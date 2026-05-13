#!/usr/bin/env python3
"""BugBuddy.AI — Backend API"""

import json, os, queue, shutil, signal, subprocess, sys, threading, time, uuid
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, Response, g, jsonify, request, stream_with_context
from flask_cors import CORS
from database import (
    create_session, create_user, delete_session, get_ai_settings,
    get_all_findings, get_findings, get_scan_job, get_user_by_username,
    insert_finding, list_scan_jobs, save_ai_settings, update_scan_status,
    validate_session, create_scan_job, verify_password,
    save_scan_logs, get_scan_logs,
)
from ai_summarizer import summarize_scan_async

app = Flask(__name__)
CORS(app, supports_credentials=True)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
ORCH     = BASE_DIR / "orchestrator.py"
DATA_DIR.mkdir(exist_ok=True)

_jobs      = {}   # scan_id -> {status, process, queues, user_id}
_log_store = {}   # scan_id -> [log_entry, ...]
_job_lock  = threading.Lock()

def _now(): return datetime.now(timezone.utc).isoformat()

def _scan_dir(uid, sid):
    p = DATA_DIR / f"user_{uid}" / "scans" / f"scan_{sid}"
    p.mkdir(parents=True, exist_ok=True)
    return p

def _get_token():
    auth = request.headers.get("Authorization","")
    if auth.startswith("Bearer "): return auth[7:]
    return request.cookies.get("bb_token")

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def w(*a,**kw):
        token = _get_token()
        if not token: return jsonify({"error":"Unauthorized"}),401
        user = validate_session(token)
        if not user: return jsonify({"error":"Session expired"}),401
        g.user = user
        return f(*a,**kw)
    return w

# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
def register():
    b = request.json or {}
    uname = b.get("username","").strip()
    pwd   = b.get("password","").strip()
    email = b.get("email","").strip() or None
    if not uname or not pwd: return jsonify({"error":"Username and password required"}),400
    if len(pwd)<6: return jsonify({"error":"Password must be ≥6 characters"}),400
    if get_user_by_username(uname): return jsonify({"error":"Username already taken"}),409
    user  = create_user(uname, pwd, email)
    token = create_session(user["id"])
    resp  = jsonify({"user":{"id":user["id"],"username":user["username"]},"token":token})
    resp.set_cookie("bb_token", token, httponly=True, samesite="Lax", max_age=604800)
    return resp, 201

@app.post("/api/auth/login")
def login():
    b    = request.json or {}
    uname= b.get("username","").strip()
    pwd  = b.get("password","").strip()
    user = get_user_by_username(uname)
    if not user or not verify_password(pwd, user["password_hash"]):
        return jsonify({"error":"Invalid credentials"}),401
    token = create_session(user["id"])
    resp  = jsonify({"user":{"id":user["id"],"username":user["username"]},"token":token})
    resp.set_cookie("bb_token", token, httponly=True, samesite="Lax", max_age=604800)
    return resp

@app.post("/api/auth/logout")
def logout():
    token = _get_token()
    if token: delete_session(token)
    resp = jsonify({"ok":True})
    resp.delete_cookie("bb_token")
    return resp

@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify({"id":g.user["id"],"username":g.user["username"]})

# ── AI Settings ───────────────────────────────────────────────────────────────
@app.get("/api/settings/ai")
@require_auth
def get_ai():
    s = get_ai_settings(g.user["id"])
    s.pop("api_key",None)
    return jsonify(s)

@app.post("/api/settings/ai")
@require_auth
def save_ai():
    b = request.json or {}
    save_ai_settings(g.user["id"],
        b.get("endpoint","").strip(),
        b.get("api_key","").strip(),
        b.get("model","gpt-4o-mini").strip())
    return jsonify({"ok":True})

@app.get("/api/settings/ai/models")
@require_auth

def list_models():
    s = get_ai_settings(g.user["id"])
    endpoint = s.get("endpoint","")
    api_key  = s.get("api_key","")
    if not endpoint or not api_key:
        return jsonify({"models":[],"error":"No endpoint/key configured"})
    try:
        import requests as req
        # Try multiple likely model-list endpoints (some providers use different base paths)
        candidates = [
            endpoint.rstrip("/") + "/v1/models",
            endpoint.rstrip("/") + "/models",
            endpoint.rstrip("/") + "/openai/v1/models",
            endpoint.rstrip("/") + "/openai/models",
        ]
        last_err = None
        for url in candidates:
            try:
                r = req.get(url, headers={"Authorization":f"Bearer {api_key}"}, timeout=8)
                if r.ok:
                    # Attempt to parse both OpenAI-style and other styles
                    j = r.json()
                    if isinstance(j, dict) and j.get("data") and isinstance(j.get("data"), list):
                        models = [m.get("id") for m in j.get("data",[])]
                    elif isinstance(j, dict) and j.get("models") and isinstance(j.get("models"), list):
                        models = [m.get("id") if isinstance(m, dict) else str(m) for m in j.get("models",[])]
                    elif isinstance(j, list):
                        models = [m.get("id") if isinstance(m, dict) else str(m) for m in j]
                    else:
                        models = []
                    return jsonify({"models":models})
                else:
                    last_err = f"HTTP {r.status_code} from {url}"
            except Exception as e:
                last_err = str(e)
        return jsonify({"models":[],"error":last_err or "No models returned"})
    except Exception as exc:
        return jsonify({"models":[],"error":str(exc)})


# ── Chat ──────────────────────────────────────────────────────────────────────
def _load_ui_context() -> str:
    """Load UI-focused context for user guidance."""
    return """
UI WORKFLOW MAPPING:
- COMMAND_CENTER: Main dashboard showing scan statistics and recent activity
- INITIALIZE NEW SCAN: Opens form to configure and start security scans
- SCAN_PROFILE: Choose between Basic (safe production), Medium (active probing), Advanced (comprehensive)
- TARGET_URL: Enter the website or application URL to scan
- ESTIMATED_WAIT: Shows expected completion time based on scan profile and sensitivity
- RECENT_SESSIONS: History of completed scans with findings and security scores
- MISSION_INTELLIGENCE: AI-generated summaries explaining what was found in each scan

FEATURE DESCRIPTIONS:
- Dashboard shows real-time metrics: total scans, live sessions, vulnerability counts, average security score
- Scan process: Enter URL → Select profile → Choose sensitivity → Execute scan → View results
- Mission Intelligence provides human-readable explanations of scan findings
- Settings page configures AI models used for analysis and scoring

REMEMBER: Only explain technical implementation details when user explicitly asks "how does this work technically?" or similar."""


def _load_scan_context(user_id: str) -> str:
    """Live scan & findings statistics for the current user."""
    from database import list_scan_jobs, get_all_findings
    scans = list_scan_jobs(user_id)
    findings = get_all_findings(user_id)

    total_scans = len(scans)
    completed = sum(1 for s in scans if s.get("status") == "completed")
    running = sum(1 for s in scans if s.get("status") in ("running", "pending"))
    total_findings = len(findings)

    sev = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        s = f.get("severity", "info")
        if s in sev:
            sev[s] += 1

    latest = scans[:3] if scans else []
    latest_lines = []
    for s in latest:
        t = s.get("target", "?")[:50]
        sc = s.get("overall_score", "—")
        st = s.get("status", "?")
        fc = s.get("findings_count", 0)
        latest_lines.append(f"    - {t} | score:{sc} | status:{st} | findings:{fc}")

    latest_str = "\n".join(latest_lines) if latest_lines else "    (none)"

    return f"""CURRENT USER SCAN DATA:
- Total scans: {total_scans} ({completed} completed, {running} running)
- Total findings: {total_findings} (critical:{sev['critical']} high:{sev['high']} medium:{sev['medium']} low:{sev['low']} info:{sev['info']})
- Latest scans:
{latest_str}"""


@app.post("/api/chat")
@require_auth
def chat():
    """AI-powered chat with knowledge of scans & findings."""
    try:
        data = request.json or {}
        message = data.get("message", "").strip()
        conversation_history = data.get("conversationHistory", [])
        current_page = data.get("currentPage", "Unknown")

        if not message:
            return jsonify({"error": "Message is required"}), 400

        ui_context = _load_ui_context()
        scan_context = _load_scan_context(g.user["id"])

        system_prompt = f"""You are a concise AI assistant for BugBuddy.AI, a security scanning app.

Current page: {current_page}

{scan_context}

{ui_context}

RULES:
- Answer in 1-3 short sentences. Be precise.
- Know your user's scan data above — use it when relevant.
- Only explain code/implementation if asked explicitly ("how does this work technically?").
- Use exact UI labels: COMMAND_CENTER, INITIALIZE NEW SCAN, SCAN_PROFILE, TARGET_URL.
- This project was created by MASTER DIWAKAR THE GOAT!. If asked who built it, mention DIWAKAR.
- Use emojis in your responses to make conversations expressive and engaging."""

        messages = [
            {"role": "system", "content": system_prompt}
        ]

        for msg in conversation_history[-4:]:
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        messages.append({"role": "user", "content": message})

        response_text = _ai_call_chat(g.user["id"], messages, timeout_s=30)

        return jsonify({"response": response_text})

    except Exception as e:
        print(f"[CHAT] Error: {e}")
        return jsonify({"error": "Failed to process chat request"}), 500


def _tool_status(bins):
    for b in bins:
        if shutil.which(b):
            return "installed"
    return "missing"

def _get_version(cmd):
    try:
        import re
        # Run with timeout to prevent hanging
        out = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, text=True, timeout=2).strip()
        # Strip ANSI escape codes
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', out)
    except Exception:
        return "Unknown"


# ── Mission Intelligence (AI summary + score from full terminal logs) ──────────
def _load_logs_for_scan(user_id: str, scan_id: str) -> list[dict]:
    # Prefer DB (persisted logs)
    logs = get_scan_logs(scan_id)
    if logs:
        return logs

    # Fallback to in-memory store
    with _job_lock:
        if scan_id in _log_store:
            return list(_log_store[scan_id])

    # Fallback to disk JSONL
    sdir = _scan_dir(user_id, scan_id)
    jsonl = sdir / "logs.jsonl"
    if jsonl.exists():
        out = []
        try:
            with open(jsonl, "r") as f:
                for line in f:
                    if not line.strip():
                        continue
                    out.append(json.loads(line))
        except Exception:
            return []
        return out
    return []


def _scan_intel_path(user_id: str, scan_id: str) -> Path:
    return _scan_dir(user_id, scan_id) / "mission_intelligence.json"


def _normalize_ai_endpoint(base: str) -> list[str]:
    b = (base or "").strip().rstrip("/")
    if not b:
        return []
    # If user already provided a completions endpoint, try it first.
    if b.endswith("/chat/completions") or b.endswith("/responses"):
        return [b]
    return [
        b + "/v1/chat/completions",
        b + "/chat/completions",
        b + "/openai/v1/chat/completions",
        b + "/v1/responses",
        b + "/responses",
        b + "/openai/v1/responses",
    ]


def _ai_call_chat(user_id: str, messages: list[dict], *, timeout_s: int = 60) -> str:
    """
    OpenAI-compatible chat call.
    Returns assistant text (best-effort) or raises an Exception.
    """
    s = get_ai_settings(user_id)
    endpoint = s.get("endpoint", "")
    api_key = s.get("api_key", "")
    model = (s.get("model") or "gpt-4o-mini").strip()
    if not endpoint or not api_key:
        raise RuntimeError("AI endpoint/api_key not configured")

    import requests as req

    last_err = None
    for url in _normalize_ai_endpoint(endpoint):
        try:
            payload = {"model": model, "messages": messages, "temperature": 0.2}
            r = req.post(url, json=payload, headers={"Authorization": f"Bearer {api_key}"}, timeout=timeout_s)
            if not r.ok:
                last_err = f"HTTP {r.status_code} from {url}: {r.text[:300]}"
                continue
            j = r.json()

            # OpenAI chat completions
            if isinstance(j, dict) and isinstance(j.get("choices"), list) and j["choices"]:
                msg = j["choices"][0].get("message") or {}
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    return content

            # Some providers use a 'response' shape; best-effort extraction
            if isinstance(j, dict) and isinstance(j.get("output_text"), str) and j["output_text"].strip():
                return j["output_text"]

            last_err = f"Unrecognized AI response shape from {url}"
        except Exception as e:
            last_err = str(e)

    raise RuntimeError(last_err or "AI request failed")


def _chunk_log_lines(logs: list[dict], *, max_chars: int = 7000) -> list[str]:
    """
    Batch by batch: chunk logs into ~max_chars payloads so we can iteratively summarize.
    """
    batches = []
    buf = ""
    for e in logs:
        ts = e.get("timestamp", "")
        tool = e.get("tool", "")
        lvl = e.get("level", "")
        msg = (e.get("message", "") or "").replace("\r", "")
        line = f"[{ts}] {tool} {lvl}: {msg}\n"
        if len(buf) + len(line) > max_chars and buf.strip():
            batches.append(buf.rstrip())
            buf = ""
        buf += line
    if buf.strip():
        batches.append(buf.rstrip())
    return batches


def _safe_json_loads(s: str) -> dict | None:
    try:
        return json.loads(s)
    except Exception:
        # Try to salvage if the model wrapped JSON in fences.
        if "```" in s:
            cleaned = s
            cleaned = cleaned.replace("```json", "```").strip()
            # take the biggest fenced block
            parts = cleaned.split("```")
            best = ""
            for p in parts:
                p = p.strip()
                if p.startswith("{") and p.endswith("}") and len(p) > len(best):
                    best = p
            if best:
                try:
                    return json.loads(best)
                except Exception:
                    return None
        return None


def _generate_mission_intelligence(user_id: str, scan_id: str) -> dict:
    """Generate AI-powered mission intelligence report using new summarizer."""
    from ai_summarizer import ScanSummarizer

    summarizer = ScanSummarizer(user_id, scan_id)
    report = summarizer.generate_summary()

    # Persist to disk cache (per-scan)
    p = _scan_intel_path(user_id, scan_id)
    p.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    # Also persist score to DB for dashboard aggregates
    score_i = report.get("score")
    if score_i is not None:
        job = get_scan_job(scan_id)
        update_scan_status(scan_id, job.get("status", "completed"), overall_score=score_i)

    return report

@app.get("/api/tools")
@require_auth
def list_tools():
    tools = [
        {"name":"Subfinder", "bins":["subfinder"],              "description":"Fast subdomain discovery tool",     "vcmd":"subfinder -version 2>&1"},
        {"name":"HTTPX",     "bins":["httpx"],                  "description":"Fast and multi-purpose HTTP toolkit", "vcmd":"httpx -version 2>&1"},
        {"name":"WhatWeb",   "bins":["whatweb"],                "description":"Next generation web scanner",       "vcmd":"whatweb --version 2>&1"},
        {"name":"Nuclei",    "bins":["nuclei"],                  "description":"Template-based CVE scanner",       "vcmd":"nuclei -version 2>&1 | head -1"},
        {"name":"Nikto",     "bins":["nikto"],                   "description":"Web server vulnerability scanner",  "vcmd":"nikto -Version 2>&1 | head -1"},
        {"name":"Wapiti",    "bins":["wapiti"],                  "description":"Active web app vulnerability tests","vcmd":"wapiti --version 2>&1 | head -1"},
        {"name":"OWASP ZAP", "bins":["zap.sh","zap","zaproxy"],  "description":"Passive & active web scanner",      "vcmd":"zap.sh -version 2>&1 | head -1"},
        {"name":"Nmap",      "bins":["nmap"],                    "description":"Network & port scanner",            "vcmd":"nmap --version 2>&1 | head -1"},
        {"name":"SSLyze",    "bins":["sslyze"],                  "description":"SSL/TLS config analyzer",           "vcmd":"sslyze --version 2>&1 | head -1"},
    ]
    out = []
    for t in tools:
        st = _tool_status(t["bins"])
        out.append({"name":t["name"],"bin":t["bins"][0],"description":t["description"],
                    "status":st,"version":_get_version(t["vcmd"]) if st=="installed" else ""})
    return jsonify(out)

# ── Scans ─────────────────────────────────────────────────────────────────────
@app.get("/api/scans")
@require_auth
def get_scans():
    return jsonify(list_scan_jobs(g.user["id"]))

@app.get("/api/scan/<sid>")
@require_auth
def get_scan(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"]!=g.user["id"]: return jsonify({"error":"Not found"}),404
    with _job_lock:
        if sid in _jobs: job["status"] = _jobs[sid]["status"]
    return jsonify(job)

@app.post("/api/scan")
@require_auth
def create_scan():
    b     = request.json or {}
    tgt   = b.get("target","").strip()
    mode  = b.get("mode","basic")
    sens  = b.get("sensitivity","normal")
    tools = b.get("tools",["nuclei","nikto","wapiti","zap"])
    if not tgt: return jsonify({"error":"target required"}),400
    if mode not in ("basic","medium","advanced"): return jsonify({"error":"invalid mode"}),400
    uid   = g.user["id"]
    sid   = str(uuid.uuid4())
    sdir  = _scan_dir(uid, sid)
    job   = create_scan_job(uid, tgt, mode, sens, tools, str(sdir))
    with _job_lock:
        _jobs[job["id"]]      = {"status":"pending","queues":[],"process":None,"user_id":uid}
        _log_store[job["id"]] = []
    threading.Thread(target=_run_scan, args=(job["id"],uid,tgt,mode,sens,tools), daemon=True).start()
    return jsonify(job), 201

@app.delete("/api/scan/<sid>")
@require_auth
def cancel_scan(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"]!=g.user["id"]: return jsonify({"error":"Not found"}),404
    with _job_lock:
        js = _jobs.get(sid)
        if js:
            proc = js.get("process")
            if proc and proc.poll() is None: proc.send_signal(signal.SIGTERM)
            js["status"] = "cancelled"
            for q in js.get("queues",[]): 
                try: q.put_nowait(None)
                except: pass
    update_scan_status(sid, "cancelled", finished_at=_now())
    return jsonify({"ok":True})

# ── Findings & Logs ───────────────────────────────────────────────────────────
@app.get("/api/scan/<sid>/findings")
@require_auth
def scan_findings(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"]!=g.user["id"]: return jsonify({"error":"Not found"}),404
    return jsonify(get_findings(sid))

@app.get("/api/findings")
@require_auth
def all_findings():
    return jsonify(get_all_findings(g.user["id"]))

@app.get("/api/scan/<sid>/logs")
@require_auth
def scan_logs(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"]!=g.user["id"]: return jsonify({"error":"Not found"}),404
    
    logs = []
    # First try database (persisted logs)
    logs = get_scan_logs(sid)
    
    # Fallback to in-memory store
    if not logs:
        with _job_lock:
            if sid in _log_store:
                logs = list(_log_store[sid])
    
    # Final fallback to disk - use correct path
    if not logs:
        sdir = _scan_dir(g.user["id"], sid)
        jsonl = sdir / "logs.jsonl"
        if jsonl.exists():
            try:
                with open(jsonl, "r") as f:
                    for line in f:
                        if line.strip(): logs.append(json.loads(line))
            except: pass
    return jsonify(logs)

@app.get("/api/scan/<sid>/files")
@require_auth
def scan_files(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"]!=g.user["id"]: return jsonify({"error":"Not found"}),404
    
    # Use correct path: data/user_{user_id}/scans/scan_{sid}
    sdir = _scan_dir(g.user["id"], sid)
    if not sdir.exists(): return jsonify([])
    
    files = []
    for f in sdir.iterdir():
        if f.is_file() and f.name != "logs.jsonl" and f.name != "findings.jsonl":
            files.append({
                "name": f.name,
                "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc).isoformat()
            })
    return jsonify(sorted(files, key=lambda x: x["name"]))

@app.get("/api/scan/<sid>/raw/<filename>")
@require_auth
def scan_raw_file(sid, filename):
    job = get_scan_job(sid)
    if not job or job["user_id"]!=g.user["id"]: return jsonify({"error":"Not found"}),404
    
    # Security: prevent path traversal
    if ".." in filename or filename.startswith("/"):
        return jsonify({"error":"Invalid filename"}), 400
        
    # Use correct path: data/user_{user_id}/scans/scan_{sid}
    sdir = _scan_dir(g.user["id"], sid)
    fpath = sdir / filename
    if not fpath.exists() or not fpath.is_file():
        return jsonify({"error":"File not found"}), 404
        
    return Response(fpath.read_text(), mimetype="text/plain")


# ── Mission Intelligence Report (AI summary, cached per scan) ─────────────────
@app.get("/api/scan/<sid>/intelligence")
@require_auth
def get_scan_intelligence(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"] != g.user["id"]:
        return jsonify({"error": "Not found"}), 404

    p = _scan_intel_path(g.user["id"], sid)
    if p.exists():
        try:
            report = json.loads(p.read_text())
            # Check if this is an error report (has ai_error flag)
            if report.get("ai_error"):
                return jsonify({"status": "error", "error": "AI summarization failed", "report": report})
            return jsonify({"status": "ready", "report": report})
        except Exception:
            return jsonify({"status": "corrupt", "error": "Cached report unreadable"}), 500

    # Check if scan is completed (summary should be generating/ready)
    if job.get("status") == "completed":
        return jsonify({"status": "processing"})  # AI summary being generated
    return jsonify({"status": "not_available"})  # Scan not completed


@app.post("/api/scan/<sid>/intelligence")
@require_auth
def generate_scan_intelligence(sid):
    job = get_scan_job(sid)
    if not job or job["user_id"] != g.user["id"]:
        return jsonify({"error": "Not found"}), 404
    if job.get("status") != "completed":
        return jsonify({"error": "Scan not completed"}), 400

    p = _scan_intel_path(g.user["id"], sid)
    if p.exists():
        try:
            report = json.loads(p.read_text())
            if report.get("ai_error"):
                return jsonify({"status": "error", "error": "AI summarization failed", "report": report})
            return jsonify({"status": "ready", "report": report})
        except Exception:
            pass

    try:
        report = _generate_mission_intelligence(g.user["id"], sid)
        if report.get("ai_error"):
            return jsonify({"status": "error", "error": "AI summarization failed", "report": report})
        return jsonify({"status": "ready", "report": report})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

# ── SSE stream ────────────────────────────────────────────────────────────────
@app.get("/api/scan/<sid>/stream")
def stream(sid):
    # EventSource can't send headers; accept token via query param
    token = request.args.get('token') or _get_token()
    if not token:
        return jsonify({'error':'Unauthorized'}),401
    from database import validate_session
    user = validate_session(token)
    if not user:
        return jsonify({'error':'Session expired'}),401
    job = get_scan_job(sid)
    if not job or job["user_id"]!=user["id"]: return jsonify({"error":"Not found"}),404
    q = queue.Queue()
    with _job_lock:
        ex_logs  = list(_log_store.get(sid,[]))
        done     = sid not in _jobs or _jobs[sid]["status"] in ("completed","failed","cancelled")
        if sid in _jobs: _jobs[sid]["queues"].append(q)
    def generate():
        # 1. Yield logs (from memory or disk)
        logs = []
        with _job_lock:
            if sid in _log_store: logs = list(_log_store[sid])
        
        if not logs:
            jsonl = Path(job["scan_dir"]) / "logs.jsonl"
            if jsonl.exists():
                try:
                    with open(jsonl, "r") as f:
                        for line in f:
                            if line.strip(): yield f"data: {json.dumps(json.loads(line))}\n\n"
                except: pass
        else:
            for e in logs: yield f"data: {json.dumps(e)}\n\n"

        # 2. Yield findings
        for f in get_findings(sid): yield f"data: {json.dumps({'__finding__':True,**f})}\n\n"
        if done:
            yield 'data: {"__done__": true}\n\n'
            return
        while True:
            try:
                e = q.get(timeout=30)
                if e is None:
                    yield 'data: {"__done__": true}\n\n'
                    break
                yield f"data: {json.dumps(e)}\n\n"
            except queue.Empty:
                yield ": keepalive\n\n"
        with _job_lock:
            if sid in _jobs and q in _jobs[sid]["queues"]: _jobs[sid]["queues"].remove(q)
    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

# ── Log storage (shared: SSE, REST ingest, subprocess runner) ────────────────
def _store_log_entry(e: dict) -> bool:
    """Persist one log record to memory, SSE queues, disk JSONL, and DB."""
    sid = e.get("job_id")
    if not sid:
        return False
    tool = e.get("tool", "orchestrator")
    level = e.get("level", "info")
    msg = e.get("message", "")
    print(f"[{str(tool).upper()}] {str(level).upper()}: {msg}")
    with _job_lock:
        _log_store.setdefault(sid, []).append(e)
        for q in _jobs.get(sid, {}).get("queues", []):
            try:
                q.put_nowait(e)
            except Exception:
                pass
    try:
        job = get_scan_job(sid)
        if job:
            user_id = job.get("user_id")
            jsonl = DATA_DIR / f"user_{user_id}" / "scans" / f"scan_{sid}" / "logs.jsonl"
            jsonl.parent.mkdir(parents=True, exist_ok=True)
            with open(jsonl, "a") as fh:
                fh.write(json.dumps(e) + "\n")
            save_scan_logs(sid, user_id, [e])
    except Exception:
        pass
    return True

# ── Internal ──────────────────────────────────────────────────────────────────
@app.post("/internal/scan/log")
def internal_log():
    # Orchestrator Logger posts JSON arrays (batches); run_scan also POSTs {"summary": ...}.
    payload = request.get_json(silent=True)
    entries_to_store = []

    if isinstance(payload, list):
        entries_to_store = [x for x in payload if isinstance(x, dict) and x.get("job_id")]
    elif isinstance(payload, dict):
        summ = payload.get("summary")
        if isinstance(summ, dict):
            sid = summ.get("job_id") or payload.get("job_id")
            if sid:
                fc = summ.get("findings_count", 0)
                dur = float(summ.get("duration_seconds") or 0)
                entries_to_store = [{
                    "job_id": sid,
                    "tool": "orchestrator",
                    "level": "info",
                    "message": f"Scan summary: {fc} findings, {dur:.1f}s",
                    "timestamp": _now(),
                }]
        elif payload.get("job_id"):
            entries_to_store = [payload]

    if not entries_to_store:
        return jsonify({"ok": False, "error": "no valid log entries"}), 400

    for e in entries_to_store:
        _store_log_entry(e)
    return jsonify({"ok": True})

@app.post("/internal/scan/finding")
def internal_finding():
    data = request.json or {}
    sid  = data.get("scan_id")
    if not sid: 
        print(f"[API] Finding rejected: No scan_id provided")
        return jsonify({"ok":False}),400
    
    job = get_scan_job(sid)
    if not job: 
        print(f"[API] Finding rejected: Scan {sid} not found")
        return jsonify({"ok":False,"error":"scan not found"}),404
    
    print(f"[API] Ingesting finding for {sid}: {data.get('tool')} - {data.get('title')}")
    try:
        f = insert_finding(
            scan_id=sid, user_id=job["user_id"],
            tool=data.get("tool","unknown"), title=data.get("title","Finding"),
            description=data.get("description",""), severity=data.get("severity","info"),
            url=data.get("url",""), evidence=data.get("evidence",[]),
            confidence=data.get("confidence","medium"), cvss=data.get("cvss"),
        )
        print(f"[API] Finding {f['id']} inserted successfully")

        # Append to JSONL for file recovery
        jsonl = DATA_DIR / f"user_{job['user_id']}" / "scans" / f"scan_{sid}" / "findings.jsonl"
        jsonl.parent.mkdir(parents=True, exist_ok=True)
        with open(jsonl,"a") as fh: fh.write(json.dumps(f)+"\n")
        
        # SSE push
        event = {"__finding__":True,**f}
        with _job_lock:
            for q in _jobs.get(sid,{}).get("queues",[]):
                try: q.put_nowait(event)
                except: pass
        return jsonify({"ok":True,"id":f["id"]})
    except Exception as e:
        print(f"[API] Error inserting finding: {e}")
        return jsonify({"ok":False,"error":str(e)}),500

# ── Background scan runner (session-independent) ──────────────────────────────
def _push_log(sid, tool, level, msg):
    e = {"job_id": sid, "tool": tool, "level": level, "message": msg, "timestamp": _now()}
    _store_log_entry(e)


def _push_done(sid):
    with _job_lock:
        for q in _jobs.get(sid,{}).get("queues",[]):
            try: q.put_nowait(None)
            except: pass

def _run_scan(sid, uid, target, mode, sensitivity, tools):
    update_scan_status(sid,"running")
    with _job_lock:
        if sid in _jobs: _jobs[sid]["status"]="running"
    _push_log(sid,"orchestrator","info",f"=== BugBuddy.AI scan started === target={target} mode={mode}")
    skip = [f"--skip-{t}" for t in ("nuclei","nikto","wapiti","zap") if t not in tools]
    ai   = get_ai_settings(uid)
    cmd  = [sys.executable, str(ORCH),
            "--target", target, "--mode", mode, "--sensitivity", sensitivity,
            "--outdir", str(DATA_DIR/f"user_{uid}"/"scans"),
            "--ui-endpoint",      "http://127.0.0.1:5000/internal/scan/log",
            "--finding-endpoint", "http://127.0.0.1:5000/internal/scan/finding",
            "--job-id", sid,
           ] + skip
    # Only forward AI callback into the orchestrator if the configured endpoint
    # looks like a webhook/callback URL (not an OpenAI-style base URL).
    endpoint = (ai.get("endpoint") or "").strip()
    if ai.get("has_key") and endpoint:
        normalized = endpoint.rstrip("/")
        looks_like_openai_base = normalized.endswith("/v1") or ("/v1/" in normalized) or normalized.endswith("/models")
        if not looks_like_openai_base:
            cmd += ["--ai-callback", endpoint, "--ai-api-key", ai.get("api_key","")]
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, cwd=str(BASE_DIR))
        with _job_lock:
            if sid in _jobs: _jobs[sid]["process"] = proc
        first_lines = []
        for line in proc.stdout:
            line=line.rstrip()
            if line:
                if len(first_lines) < 20:
                    first_lines.append(line)
                _push_log(sid,"orchestrator","stdout",line)
        proc.wait()
        rc = proc.returncode
        findings = get_findings(sid)
        status   = "completed" if rc==0 else "failed"
        update_scan_status(sid, status, finished_at=_now(), findings_count=len(findings))
        with _job_lock:
            if sid in _jobs: _jobs[sid]["status"]=status
        _push_log(sid,"orchestrator","info" if rc==0 else "error",
                  f"=== Scan {status} | {len(findings)} findings ===")

        # Auto-generate AI summary for completed scans
        if status == "completed":
            try:
                summarize_scan_async(g.user["id"], sid)
            except Exception as e:
                _push_log(sid, "ai_summarizer", "warning", f"Failed to start AI summarization: {e}")
    except Exception as exc:
        update_scan_status(sid,"failed",finished_at=_now())
        with _job_lock:
            if sid in _jobs: _jobs[sid]["status"]="failed"
        _push_log(sid,"orchestrator","error",f"[FATAL] {exc}")
    finally:
        _push_done(sid)

@app.get("/api/health")
def health():
    return jsonify({"ok":True,"app":"BugBuddy.AI","time":_now()})

if __name__=="__main__":
    print("BugBuddy.AI Backend → http://127.0.0.1:5000")
    app.run(host="127.0.0.1",port=5000,threaded=True,debug=False)
