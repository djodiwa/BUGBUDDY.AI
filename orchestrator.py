import argparse
import concurrent.futures
import json
import logging
import os
import queue
import random
import re
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from urllib.parse import urlparse

import requests
import urllib3

# Custom exception for clean aborts (Point 13)
class ScanAbortedError(Exception):
    pass

SENSITIVITY_PROFILES = {
    "low-noise":  {"concurrency": 1, "sleep_min": 3.0, "sleep_max": 7.0, "max_hosts": 5},
    "normal":     {"concurrency": 2, "sleep_min": 0.5, "sleep_max": 2.0, "max_hosts": 50},
    "aggressive": {"concurrency": 4, "sleep_min": 0.1, "sleep_max": 0.5, "max_hosts": 500},
}
MODE_TOOL_CONFIG = {
    "basic":    {"nuclei_flags": ["-severity", "low,medium", "-silent", "-json"], "nikto_flags": ["-Tuning", "0"], "wapiti_flags": ["--scope", "page", "-m", "None"], "zap_mode": "passive"},
    "medium":   {"nuclei_flags": ["-severity", "low,medium,high", "-silent", "-json"], "nikto_flags": ["-Tuning", "1,2,3"], "wapiti_flags": ["--scope", "domain", "-m", "sql,xss"], "zap_mode": "active_inscope"},
    "advanced": {"nuclei_flags": ["-severity", "low,medium,high,critical", "-silent", "-json"], "nikto_flags": [], "wapiti_flags": ["--scope", "domain"], "zap_mode": "active_full"},
}
SEVERITY_MAP = {
    "critical": "critical", "high": "high", "medium": "medium", "low": "low",
    "informational": "info", "info": "info", "3": "high", "2": "medium", "1": "low", "0": "info"
}
ZAP_RISK_MAP = {
    "3": "high", "2": "medium", "1": "low", "0": "info",
    "High": "high", "Medium": "medium", "Low": "low", "Informational": "info"
}

def _now(): return datetime.now(timezone.utc).isoformat()

# ── Job ───────────────────────────────────────────────────────────────────────
class Job:
    def __init__(self, target, mode, outdir, sensitivity, ui_endpoint, finding_endpoint,
                 ai_callback=None, ai_api_key=None, zap_api="http://localhost:8090",
                 zap_api_key="", job_id=None,
                 skip_nuclei=False, skip_nikto=False, skip_wapiti=False, skip_zap=False,
                 verify_ssl=True, tool_paths=None, concurrency_overrides=None):
        ts    = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        short = uuid.uuid4().hex[:8]
        self.job_id    = job_id or f"{ts}-{short}"
        self.target    = target
        self.mode      = mode
        self.outdir    = Path(outdir) / f"scan_{self.job_id}"
        self.sensitivity   = sensitivity
        self.ui_endpoint   = ui_endpoint
        self.finding_endpoint = finding_endpoint
        self.ai_callback   = ai_callback
        
        # Point 12: API keys from env
        self.ai_api_key    = ai_api_key or os.environ.get("AI_API_KEY")
        self.zap_api       = zap_api
        self.zap_api_key   = zap_api_key or os.environ.get("ZAP_API_KEY")
        
        self.skip_nuclei   = skip_nuclei
        self.skip_nikto    = skip_nikto
        self.skip_wapiti   = skip_wapiti
        self.skip_zap      = skip_zap
        self.verify_ssl    = verify_ssl # Point 8
        self.tool_paths    = tool_paths or {} # Point 9
        
        self.start_time    = None
        self.end_time      = None
        
        p = SENSITIVITY_PROFILES[sensitivity]
        self.concurrency = p["concurrency"]
        if concurrency_overrides:
            self.concurrency = int(concurrency_overrides.get("global", self.concurrency))
        self.max_hosts   = p.get("max_hosts", 50) # Point 15
        self.sleep_min   = p["sleep_min"]
        self.sleep_max   = p["sleep_max"]
        
        self.alive_urls  = [self.target]
        self.zap_proc    = None
        self.outdir.mkdir(parents=True, exist_ok=True)
        
        # Shared findings for deduplication and summary (Point 1, 14)
        self.findings = []
        self.posted_finding_ids = set()
        self.errors = []
        
        # Session for consistency (Point 8)
        self.session = requests.Session()
        self.session.verify = self.verify_ssl
        if not self.verify_ssl:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def find_tool(self, name, candidates):
        """Finds a tool binary, prioritizing user-provided paths (Point 9)."""
        if name in self.tool_paths:
            p = shutil.which(self.tool_paths[name])
            if p: return p
        
        env_path = os.environ.get(f"{name.upper()}_PATH")
        if env_path:
            p = shutil.which(env_path)
            if p: return p
            
        for c in candidates:
            p = shutil.which(c)
            if p: return p
        return None

# ── Logger ────────────────────────────────────────────────────────────────────
class Logger:
    def __init__(self, job):
        self.job = job
        self.log_file_path = job.outdir / f"scan_log_{job.job_id}.txt"
        self._ui_queue = queue.Queue()
        self._stop_event = threading.Event()
        
        # Ensure log file exists (Point 10)
        self.log_file_path.write_text(f"--- Scan Log: {job.job_id} ---\n")

        self._ui_thread = threading.Thread(target=self._process_ui_posts, daemon=True)
        self._ui_thread.start()

    def _process_ui_posts(self):
        """Processes UI posts from the queue in batches (Point 10)."""
        batch_size = 10
        batch_timeout = 2
        batch = []

        while not self._stop_event.is_set() or not self._ui_queue.empty():
            try:
                item = self._ui_queue.get(timeout=batch_timeout)
                batch.append(item)
                if len(batch) >= batch_size:
                    self._send_batch(batch)
                    batch = []
            except queue.Empty:
                if batch:
                    self._send_batch(batch)
                    batch = []
            except Exception as e:
                print(f"[Logger] Error processing UI posts: {e}")

    def _send_batch(self, batch):
        """Sends a batch of logs to the UI endpoint."""
        try:
            # Point 8: Use job's session for consistency
            self.job.session.post(self.job.ui_endpoint, json=batch, timeout=10)
        except Exception as e:
            print(f"[Logger] Error sending log batch to UI: {e}")

    def _log(self, tool, level, msg):
        now = _now()
        entry = f"[{now}] [{tool}:{level}] {msg}"
        
        # Point 10: Save to file
        try:
            with open(self.log_file_path, "a") as f:
                f.write(entry + "\n")
        except: pass
        
        # Print to stdout
        print(entry)
        
        # Queue for UI
        self._ui_queue.put({
            "job_id": self.job.job_id,
            "tool": tool,
            "level": level,
            "message": msg,
            "timestamp": now
        })

    def info(self, t, m): self._log(t, "info", m)
    def warn(self, t, m): self._log(t, "warn", m)
    def error(self, t, m): 
        self._log(t, "error", m)
        self.job.errors.append({"tool": t, "message": m, "time": _now()})

    def flush(self):
        self._stop_event.set()
        if self._ui_thread.is_alive():
            self._ui_thread.join(timeout=5)

# ── Finding poster ────────────────────────────────────────────────────────────
def post_finding(job, tool, title, desc, severity, url="", evidence=None, confidence="medium", cvss=None):
    """Posts a finding with deduplication (Point 1)."""
    # Deduplication ID: tool + title + url
    fid = f"{tool}:{title}:{url}"
    if fid in job.posted_finding_ids:
        return
    job.posted_finding_ids.add(fid)

    severity = SEVERITY_MAP.get(str(severity).lower(), "info")
    finding = {
        "scan_id": job.job_id,
        "tool": tool,
        "title": title,
        "description": desc,
        "severity": severity,
        "url": url,
        "evidence": evidence or [],
        "confidence": confidence,
        "cvss": cvss
    }
    
    # Store for AI callback and summary (Point 2, 14)
    job.findings.append(finding)

    try:
        r = job.session.post(job.finding_endpoint, json=finding, timeout=10)
        if r.status_code != 200:
            print(f"[finding] error: {r.status_code}")
    except Exception as e:
        print(f"[finding] exception: {e}")

# ── Utility ───────────────────────────────────────────────────────────────────
def run_proc(cmd, job, log, tool, capture_out=False, callback=None):
    """Runs a process, logging output and checking return codes (Point 4, 5)."""
    log.info(tool, f"Running: {' '.join(str(c) for c in cmd)}")
    out = [] if capture_out else None
    try:
        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        
        # Efficient reading (Point 5)
        for line in p.stdout:
            line = line.rstrip()
            if line:
                if capture_out: out.append(line)
                if callback:
                    try:
                        callback(line)
                    except: pass
                log.info(tool, line)
        
        _, stderr = p.communicate()
        if stderr:
            for line in stderr.splitlines():
                log.warn(tool, line.rstrip())
        
        if p.returncode != 0:
            log.warn(tool, f"Tool exited with non-zero code {p.returncode}")
            
        return "\n".join(out) if capture_out else p.returncode
    except FileNotFoundError:
        log.error(tool, f"Binary not found: {cmd[0]}")
        return -1
    except Exception as e:
        log.error(tool, f"Execution failed: {e}")
        return -1

def throttle(job): time.sleep(random.uniform(job.sleep_min, job.sleep_max))

# ── Pre-checks ────────────────────────────────────────────────────────────────
def run_prechecks(job, log):
    parsed = urlparse(job.target)
    host   = parsed.hostname
    port   = 443 if parsed.scheme=="https" else 80
    res    = {"host":host,"port":port,"passed":True, "tools": {}}
    
    log.info("precheck", f"Starting pre-checks for {host}...")
    
    # Point 9: Check for tools
    tools_to_check = {
        "nuclei": ["nuclei"],
        "nikto": ["nikto"],
        "wapiti": ["wapiti"],
        "zaproxy": ["zap.sh", "zap", "zaproxy"]
    }
    for name, cands in tools_to_check.items():
        found = job.find_tool(name, cands)
        res["tools"][name] = found
        if found:
            log.info("precheck", f"Tool {name} found at {found}")
        else:
            log.warn("precheck", f"Tool {name} NOT found in PATH")

    try:
        ip = socket.gethostbyname(host)
        res["dns"] = {"resolved":True,"ip":ip}
        log.info("precheck", f"[DNS] {host} → {ip}")
    except socket.gaierror as e:
        res["dns"] = {"resolved":False,"error":str(e)}; res["passed"]=False
        log.error("precheck",f"[DNS] Failed: {e}")
    try:
        s = socket.create_connection((host,port),timeout=10); s.close()
        res["tcp"] = {"open":True}
        log.info("precheck",f"[TCP] {host}:{port} open ✓")
    except Exception as e:
        res["tcp"] = {"open":False,"error":str(e)}; res["passed"]=False
        log.error("precheck",f"[TCP] Failed: {e}")
    try:
        r = job.session.get(job.target, timeout=15, allow_redirects=True)
        res["http_status"] = r.status_code
        log.info("precheck",f"[HTTP] Status {r.status_code}")
    except Exception as e:
        res["http_status"]=None; res["passed"]=False
        log.error("precheck",f"[HTTP] Failed: {e}")
        
    (job.outdir/f"precheck_{job.job_id}.json").write_text(json.dumps(res,indent=2))
    log.info("precheck",f"Pre-checks complete → passed={res['passed']}")
    return res

# ── Phase 1: Recon Engine ─────────────────────────────────────────────────────
def run_subfinder(job, log):
    parsed = urlparse(job.target)
    domain = parsed.hostname
    if not domain:
        log.warn("recon:subfinder", "Invalid domain for subfinder")
        return [job.target]
    
    out = job.outdir / f"subdomains_{job.job_id}.txt"
    subfinder = job.find_tool("subfinder", ["subfinder"])
    if not subfinder:
        log.warn("recon:subfinder", "subfinder not found, skipping enumeration")
        return [job.target]
        
    cmd = [subfinder, "-d", domain, "-silent", "-all", "-o", str(out)]
    log.info("recon:subfinder", f"Starting subdomain enumeration for {domain}")
    run_proc(cmd, job, log, "recon:subfinder")
    
    subs = []
    if out.exists():
        subs = [line.strip() for line in out.read_text().splitlines() if line.strip()]
    
    if not subs: 
        subs = [domain]
        
    log.info("recon:subfinder", f"Found {len(subs)} subdomains")
    return subs

def run_dns_collection(job, log, subdomains):
    log.info("recon:dns", "Resolving DNS for subdomains...")
    subs = list(set(subdomains))[:job.max_hosts] 
    results = []
    
    def resolve(sub):
        # Point 6: Small delay to avoid overwhelming DNS
        time.sleep(0.1)
        try: return {"subdomain": sub, "ip": socket.gethostbyname(sub)}
        except Exception: return None
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        for r in ex.map(resolve, subs):
            if r: results.append(r)
            
    out = job.outdir / f"dns_{job.job_id}.json"
    out.write_text(json.dumps(results, indent=2))
    log.info("recon:dns", f"Resolved {len(results)} subdomains to IPs")
    return results

def run_httpx(job, log, subdomains):
    log.info("recon:httpx", "Probing alive hosts...")
    httpx = job.find_tool("httpx", ["httpx"])
    if not httpx:
        log.warn("recon:httpx", "httpx not found, skipping")
        return [job.target]
        
    subs = list(set(subdomains))[:job.max_hosts]
    subs_file = job.outdir / f"httpx_in_{job.job_id}.txt"
    subs_file.write_text("\n".join(subs))
    out = job.outdir / f"httpx_{job.job_id}.json"
    
    cmd = [httpx, "-l", str(subs_file), "-silent", "-json", "-o", str(out), "-threads", "50"]
    run_proc(cmd, job, log, "recon:httpx")
    
    alive_urls = []
    if out.exists():
        for line in out.read_text().splitlines():
            try:
                data = json.loads(line)
                url = data.get("url")
                if url: alive_urls.append(url)
            except: pass
            
    if not alive_urls: alive_urls = [job.target]
    log.info("recon:httpx", f"Found {len(alive_urls)} alive URLs")
    job.alive_urls = alive_urls
    return alive_urls

def run_nmap(job, log, dns_results):
    nmap = job.find_tool("nmap", ["nmap"])
    if not nmap: return
    
    log.info("recon:nmap", "Running port & service scan...")
    ips = list(set(r["ip"] for r in dns_results))[:20] # Cap nmap targets
    if not ips: return
    
    ips_file = job.outdir / f"nmap_in_{job.job_id}.txt"
    ips_file.write_text("\n".join(ips))
    out = job.outdir / f"nmap_{job.job_id}.xml"
    
    cmd = [nmap, "-iL", str(ips_file), "-F", "-T4", "-oX", str(out)]
    run_proc(cmd, job, log, "recon:nmap")
    log.info("recon:nmap", f"Nmap scan complete for {len(ips)} IPs")

# ── Phase 2: Asset Intelligence ───────────────────────────────────────────────
def run_whatweb(job, log, alive_urls):
    whatweb = job.find_tool("whatweb", ["whatweb"])
    if not whatweb: return []
    
    log.info("asset:whatweb", "Running tech fingerprinting...")
    urls = alive_urls[:job.max_hosts]
    if not urls: return []
    
    urls_file = job.outdir / f"whatweb_in_{job.job_id}.txt"
    urls_file.write_text("\n".join(urls))
    out = job.outdir / f"whatweb_{job.job_id}.json"
    
    cmd = [whatweb, "-i", str(urls_file), "--log-json", str(out)]
    run_proc(cmd, job, log, "asset:whatweb")
    
    results = []
    if out.exists():
        try: results = json.loads(out.read_text())
        except: pass
    log.info("asset:whatweb", f"Tech fingerprinting complete for {len(urls)} URLs")
    return results

def run_js_crawler(job, log, alive_urls):
    log.info("asset:crawler", "Crawling for JS files and endpoints...")
    urls = alive_urls[:10] # Cap crawler
    results = {}
    
    js_regex = re.compile(r'src=["\']([^"\']+\.js(?:\?[^"\']*)?)["\']', re.IGNORECASE)
    endpoint_regex = re.compile(r'["\']((?:/api/|/v[1-9]/)[^"\']+)["\']', re.IGNORECASE)
    
    def crawl(url):
        # Point 6: Concurrency limit and delay
        time.sleep(0.5) 
        try:
            r = job.session.get(url, timeout=5)
            js_files = list(set(m for m in js_regex.findall(r.text)))
            endpoints = []
            for js in js_files[:5]:
                js_url = js if js.startswith("http") else (url.rstrip("/") + "/" + js.lstrip("/"))
                try:
                    jr = job.session.get(js_url, timeout=5)
                    eps = list(set(endpoint_regex.findall(jr.text)))
                    endpoints.extend(eps)
                except: pass
            return url, {"js_files": js_files, "endpoints": list(set(endpoints))}
        except: return url, None
        
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex: # Cap concurrency
        for u, res in ex.map(crawl, urls):
            if res: results[u] = res

    out = job.outdir / f"crawler_{job.job_id}.json"
    out.write_text(json.dumps(results, indent=2))
    
    for u, data in results.items():
        if data["endpoints"]:
            post_finding(job, "asset:crawler", f"Discovered API Endpoints on {u}",
                         f"Found {len(data['endpoints'])} endpoints in JS files.",
                         "info", u, data["endpoints"], "high")

    log.info("asset:crawler", f"Found endpoints/JS in {len(results)} URLs")
    return results

# ── Phase 3: Vulnerability Engine (Tool runners) ──────────────────────────────
def run_nuclei(job, log):
    if job.skip_nuclei: log.info("nuclei", "Skipped"); return []
    nuclei = job.find_tool("nuclei", ["nuclei"])
    if not nuclei: return []
    
    cfg = MODE_TOOL_CONFIG[job.mode]
    out = job.outdir/f"nuclei_{job.job_id}.jsonl"
    urls_file = job.outdir / f"nuclei_in_{job.job_id}.txt"
    urls_file.write_text("\n".join(job.alive_urls[:100]))
    
    findings = []
    
    def nuclei_callback(line):
        try:
            item = json.loads(line)
            info = item.get("info", {})
            title = info.get("name", "Nuclei finding")
            desc = info.get("description", "")
            severity = info.get("severity", "info")
            url = item.get("matched-at", job.target)
            
            evidence = []
            if item.get("extracted-results"):
                evidence.extend(item.get("extracted-results"))
            if item.get("curl-command"):
                evidence.append(f"Curl: {item['curl-command']}")
            
            post_finding(job, "nuclei", title, desc, severity, url, evidence)
            findings.append(item)
            # Log a cleaner version
            log.info("nuclei", f"[LIVE] Found: {title} ({severity}) on {url}")
        except:
            pass

    cmd = [nuclei, "-l", str(urls_file), "-json-export", str(out)] + cfg["nuclei_flags"]
    run_proc(cmd, job, log, "nuclei", callback=nuclei_callback)
    throttle(job)
    
    log.info("nuclei", f"Real-time scan finished: {len(findings)} findings posted")
    return findings

def run_nikto(job, log):
    if job.skip_nikto: log.info("nikto", "Skipped"); return {}
    nikto = job.find_tool("nikto", ["nikto"])
    if not nikto: return {}
    
    cfg = MODE_TOOL_CONFIG[job.mode]
    target_url = job.alive_urls[0] if job.alive_urls else job.target
    
    # Point 3: Fix double-extension issue
    out_base = job.outdir / f"nikto_{job.job_id}"
    out_json = job.outdir / f"nikto_{job.job_id}.json"
    
    cmd = [nikto, "-h", target_url, "-Format", "json", "-o", str(out_base)] + cfg["nikto_flags"]
    run_proc(cmd, job, log, "nikto")
    throttle(job)
    
    raw = {}
    if out_json.exists():
        try: raw = json.loads(out_json.read_text())
        except: pass
        
    count = 0
    # Point 11: Enrichment for Nikto
    for item in raw.get("vulnerabilities", []):
        evidence = []
        if item.get("osvdb"):
            evidence.append(f"OSVDB: {item['osvdb']}")
        if item.get("method"):
            evidence.append(f"Method: {item['method']}")
            
        post_finding(job, "nikto", item.get("msg", "Nikto finding"),
                     item.get("msg", ""), item.get("severity", "info"),
                     target_url, evidence)
        count += 1
        
    log.info("nikto", f"{count} findings posted")
    return raw

def run_wapiti(job, log):
    if job.skip_wapiti: log.info("wapiti", "Skipped"); return {}
    wapiti = job.find_tool("wapiti", ["wapiti"])
    if not wapiti: return {}
    
    cfg = MODE_TOOL_CONFIG[job.mode]
    target_url = job.alive_urls[0] if job.alive_urls else job.target
    out = job.outdir/f"wapiti_{job.job_id}.json"
    
    cmd = [wapiti, "-u", target_url, "-f", "json", "-o", str(out)] + cfg["wapiti_flags"]
    run_proc(cmd, job, log, "wapiti")
    throttle(job)
    
    raw = {}
    if out.exists():
        try: raw = json.loads(out.read_text())
        except: pass
        
    count = 0
    # Point 11: Enrichment for Wapiti
    vulns = raw.get("vulnerabilities", {})
    for cat, items in vulns.items():
        for v in items:
            evidence = []
            if v.get("curl_command"):
                evidence.append(f"Curl: {v['curl_command']}") 
            if v.get("parameter"):
                evidence.append(f"Parameter: {v['parameter']}")
                
            post_finding(job, "wapiti", f"Wapiti: {cat}", v.get("info", ""),
                         str(v.get("level", "medium")), v.get("path", job.target),
                         evidence)
            count += 1
            
    log.info("wapiti", f"{count} findings posted")
    return raw

# ── ZAP Helpers (Point 16) ────────────────────────────────────────────────────
def _zap_api_call(job, path, params=None):
    api = job.zap_api.rstrip("/")
    p = params or {}
    if job.zap_api_key:
        p["apikey"] = job.zap_api_key
    try:
        r = job.session.get(f"{api}{path}", params=p, timeout=30)
        return r.json()
    except Exception as e:
        raise Exception(f"ZAP API error ({path}): {e}")

def run_zap(job, log):
    if job.skip_zap: log.info("zap", "Skipped"); return {}
    # Prefer zap.sh (sets up classpath); zaproxy often maps to GUI entry on Linux.
    zap_bin = job.find_tool("zaproxy", ["zap.sh", "zap", "zaproxy"])
    
    started_daemon = False
    api = job.zap_api.rstrip("/")
    
    try:
        # Check if ZAP is already running
        job.session.get(api, timeout=2)
    except Exception:
        if zap_bin:
            log.info("zap", "ZAP not running. Starting daemon...")
            port = urlparse(api).port or 8090
            cmd = [zap_bin, "-daemon", "-port", str(port), "-host", "127.0.0.1", "-config", "api.disablekey=true"]
            env = os.environ.copy()
            jto = env.get("JAVA_TOOL_OPTIONS", "")
            if "-Djava.awt.headless=true" not in jto:
                env["JAVA_TOOL_OPTIONS"] = (jto + " -Djava.awt.headless=true").strip()
            job.zap_proc = subprocess.Popen(
                cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=env
            )
            started_daemon = True
            for i in range(30):
                time.sleep(2)
                try:
                    job.session.get(api, timeout=1)
                    log.info("zap", "ZAP daemon ready")
                    break
                except:
                    if i % 5 == 0: log.info("zap", f"Waiting for ZAP... ({i*2}s)")
            else:
                log.error("zap", "ZAP startup timeout")
                return {"error": "timeout"}
        else:
            log.warn("zap", "ZAP binary not found and no daemon at API URL")
            return {"error": "not_found"}
    else:
        log.warn(
            "zap",
            "ZAP API already reachable — using that instance. Close it for a fresh headless daemon.",
        )

    target_url = job.alive_urls[0] if job.alive_urls else job.target
    cfg = MODE_TOOL_CONFIG[job.mode]
    mode = cfg["zap_mode"]
    
    try:
        # Point 7: Only spider if not passive
        if mode in ("active_inscope", "active_full"):
            log.info("zap", "Starting spider...")
            resp = _zap_api_call(job, "/JSON/spider/action/scan/", {"url": target_url})
            sid = resp.get("scan", "0")
            for _ in range(60):
                time.sleep(3)
                status = _zap_api_call(job, "/JSON/spider/view/status/", {"scanId": sid})
                pct = status.get("status", "0")
                log.info("zap", f"Spider: {pct}%")
                if str(pct) == "100": break
        else:
            log.info("zap", "Passive mode: skipping spider/active scan")

        if mode in ("active_inscope", "active_full"):
            log.info("zap", "Starting active scan...")
            resp = _zap_api_call(job, "/JSON/ascan/action/scan/", {"url": target_url})
            asid = resp.get("scan", "0")
            for _ in range(120):
                time.sleep(5)
                status = _zap_api_call(job, "/JSON/ascan/view/status/", {"scanId": asid})
                pct = status.get("status", "0")
                log.info("zap", f"Active scan: {pct}%")
                
                # Real-time polling
                _zap_post_alerts(job, target_url)
                if str(pct) == "100": break

        # Point 1: Final alerts sweep ensures all findings (even passive) are posted
        alerts = _zap_post_alerts(job, target_url)
        log.info("zap", f"ZAP scan complete. {len(alerts)} alerts processed.")
        return {"alerts": alerts}
        
    except Exception as e:
        log.error("zap", f"ZAP error: {e}")
        return {"error": str(e)}
    finally:
        if started_daemon and job.zap_proc:
            log.info("zap", "Stopping ZAP daemon...")
            job.zap_proc.terminate()
            try: job.zap_proc.wait(timeout=10)
            except: job.zap_proc.kill()

def _zap_post_alerts(job, target_url):
    """Retrieves alerts from ZAP and posts them (Point 1)."""
    try:
        resp = _zap_api_call(job, "/JSON/alert/view/alerts/", {"baseurl": target_url})
        alerts = resp.get("alerts", [])
        for a in alerts:
            post_finding(job, "zap", a.get("name", "ZAP Alert"),
                         a.get("description", "") + "\nSolution: " + a.get("solution", ""),
                         ZAP_RISK_MAP.get(a.get("risk"), "info"),
                         a.get("url", target_url),
                         [a.get("evidence", ""), a.get("reference", "")],
                         confidence="high")
        return alerts
    except:
        return []

# ── AI callback (Point 2) ─────────────────────────────────────────────────────
def call_ai(job, findings, log):
    if not job.ai_callback: return
    log.info("ai", f"Posting {len(findings)} findings to AI endpoint")
    try:
        payload = {
            "job_id": job.job_id,
            "target": job.target,
            "mode": job.mode,
            "findings": findings,
            "meta": {"start": job.start_time, "end": job.end_time}
        }
        hdrs = {"Authorization": f"Bearer {job.ai_api_key}"} if job.ai_api_key else {}
        r = job.session.post(job.ai_callback, json=payload, headers=hdrs, timeout=60)
        r.raise_for_status()
        ai_data = r.json()
        (job.outdir/f"ai_response_{job.job_id}.json").write_text(json.dumps(ai_data, indent=2))
        log.info("ai", f"Score={ai_data.get('score')} Risk={ai_data.get('risk_level')}")
    except Exception as e:
        log.error("ai", f"AI callback failed: {e}")

# ── Main Orchestration ───────────────────────────────────────────────────────
def run_scan(job):
    log = Logger(job)
    job.start_time = _now()
    log.info("orchestrator", f"Target={job.target} Mode={job.mode} Sensitivity={job.sensitivity}")

    try:
        pre = run_prechecks(job, log)
        if not pre["passed"]:
            # Point 13: Custom exception
            log.error("orchestrator", "Pre-checks failed — aborting")
            raise ScanAbortedError("Pre-checks failed")

        log.info("orchestrator", "=== PHASE 1: Recon Engine ===")
        subs = run_subfinder(job, log)
        throttle(job)
        dns = run_dns_collection(job, log, subs)
        throttle(job)
        alive = run_httpx(job, log, subs)
        throttle(job)
        run_nmap(job, log, dns)
        
        log.info("orchestrator", "=== PHASE 2: Asset Intelligence ===")
        run_whatweb(job, log, alive)
        throttle(job)
        run_js_crawler(job, log, alive)
        throttle(job)

        log.info("orchestrator", "=== PHASE 3: Vulnerability Engine ===")
        tools = [
            (run_nuclei, "nuclei"),
            (run_nikto, "nikto"),
            (run_wapiti, "wapiti"),
            (run_zap, "zap")
        ]

        # Point 4: Error handling in tool execution
        if job.concurrency == 1:
            for func, name in tools:
                try:
                    func(job, log)
                except Exception as e:
                    log.error(name, f"Tool failed: {e}")
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=job.concurrency) as ex:
                futures = {ex.submit(func, job, log): name for func, name in tools}
                for f in concurrent.futures.as_completed(futures):
                    name = futures[f]
                    try:
                        f.result()
                    except Exception as e:
                        log.error(name, f"Parallel tool failed: {e}")

        job.end_time = _now()
        
        # Point 2: Call AI at the end
        call_ai(job, job.findings, log)
        
        # Point 14: Summary generation
        summary = {
            "job_id": job.job_id,
            "target": job.target,
            "mode": job.mode,
            "start_time": job.start_time,
            "end_time": job.end_time,
            "findings_count": len(job.findings),
            "errors": job.errors,
            "duration_seconds": (datetime.fromisoformat(job.end_time) - datetime.fromisoformat(job.start_time)).total_seconds()
        }
        (job.outdir/f"summary_{job.job_id}.json").write_text(json.dumps(summary, indent=2))
        
        # Send summary to UI
        try:
            job.session.post(
                job.ui_endpoint,
                json={"job_id": job.job_id, "summary": summary},
                timeout=10,
            )
        except: pass
        
        log.info("orchestrator", "Scan complete")
        
    except ScanAbortedError as e:
        log.error("orchestrator", f"Scan aborted: {e}")
        raise
    except Exception as e:
        log.error("orchestrator", f"Unexpected error: {e}")
        raise
    finally:
        log.flush()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--target", required=True)
    p.add_argument("--mode", choices=["basic", "medium", "advanced"], default="basic")
    p.add_argument("--outdir", default="./data")
    p.add_argument("--ui-endpoint", default="http://127.0.0.1:5000/internal/scan/log")
    p.add_argument("--finding-endpoint", default="http://127.0.0.1:5000/internal/scan/finding")
    p.add_argument("--sensitivity", choices=list(SENSITIVITY_PROFILES), default="normal")
    p.add_argument("--ai-callback", default=None)
    p.add_argument("--ai-api-key", default=None)
    p.add_argument("--zap-api", default="http://localhost:8090")
    p.add_argument("--zap-api-key", default="")
    p.add_argument("--job-id", default=None)
    p.add_argument("--skip-nuclei", action="store_true")
    p.add_argument("--skip-nikto", action="store_true")
    p.add_argument("--skip-wapiti", action="store_true")
    p.add_argument("--skip-zap", action="store_true")
    p.add_argument("--verify-ssl", type=str, default="true") # Point 8
    
    args = p.parse_args()
    verify_ssl = args.verify_ssl.lower() == "true"

    job = Job(
        target=args.target, mode=args.mode, outdir=args.outdir,
        sensitivity=args.sensitivity, ui_endpoint=args.ui_endpoint,
        finding_endpoint=args.finding_endpoint,
        ai_callback=args.ai_callback, ai_api_key=args.ai_api_key,
        zap_api=args.zap_api, zap_api_key=args.zap_api_key, job_id=args.job_id,
        skip_nuclei=args.skip_nuclei, skip_nikto=args.skip_nikto,
        skip_wapiti=args.skip_wapiti, skip_zap=args.skip_zap,
        verify_ssl=verify_ssl
    )

    try:
        run_scan(job)
    except ScanAbortedError:
        sys.exit(2)
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
