#!/usr/bin/env python3
"""AI-Powered Vulnerability Scan Summarization Engine for BugBuddy"""

import json
import re
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

import requests as req

from database import get_ai_settings, get_scan_job, get_findings, get_scan_logs


@dataclass
class AIProvider:
    """Abstraction for AI providers with OpenAI-compatible APIs."""
    endpoint: str
    api_key: str
    model: str

    def call_chat(self, messages: List[Dict], timeout_s: int = 60) -> str:
        """Make AI chat completion call."""
        last_err = None
        endpoints = self._normalize_endpoints()

        for url in endpoints:
            try:
                payload = {
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0.2
                }
                r = req.post(
                    url,
                    json=payload,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    timeout=timeout_s
                )
                if not r.ok:
                    last_err = f"HTTP {r.status_code} from {url}: {r.text[:300]}"
                    continue

                j = r.json()
                # OpenAI format
                if isinstance(j, dict) and isinstance(j.get("choices"), list) and j["choices"]:
                    msg = j["choices"][0].get("message") or {}
                    content = msg.get("content")
                    if isinstance(content, str) and content.strip():
                        return content

                # Some providers use different format
                if isinstance(j, dict) and isinstance(j.get("output_text"), str) and j["output_text"].strip():
                    return j["output_text"]

                last_err = f"Unrecognized AI response shape from {url}"
            except Exception as e:
                last_err = str(e)

        raise RuntimeError(last_err or "AI request failed")

    def _normalize_endpoints(self) -> List[str]:
        """Normalize endpoint URLs following BugBuddy pattern."""
        b = (self.endpoint or "").strip().rstrip("/")
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


class Sanitizer:
    """Sanitizes AI outputs to remove tool/provider references."""

    def __init__(self):
        # Patterns to remove tool names, scanner names, log file names
        self.patterns = [
            # Tool names
            r'\b(?:Nmap|Nuclei|Nikto|Wapiti|OWASP\s*ZAP|WhatWeb|HTTPX|Subfinder|SSLyze)\b',
            # Scanner/file references
            r'\blogs\.json\b',
            r'\bscan_log_\d+\.txt\b',
            r'\bmission_intelligence\.json\b',
            # Provider names (though we shouldn't expose them anyway)
            r'\b(?:OpenAI|Anthropic|Google|Claude|GPT)\b',
        ]
        self.compiled_patterns = [re.compile(p, re.IGNORECASE) for p in self.patterns]

    def sanitize(self, text: str) -> str:
        """Remove sensitive tool/provider references from text."""
        for pattern in self.compiled_patterns:
            text = pattern.sub('[TOOL]', text)
        return text


class PromptGenerator:
    """Generates prompts for AI summarization."""

    def generate_initial_prompt(self, scan_data: Dict) -> List[Dict]:
        """Generate initial prompt with scan context."""
        return [
            {"role": "system", "content": (
                "You are a security scan analyst. You will receive scan findings plus terminal log batches.\n"
                "Your job: summarize what happened during the scan, extract a timeline, note errors/tool failures,\n"
                "and compute a security score 0-100 based on evidence (logs + findings).\n"
                "You MUST output STRICT JSON when asked."
            )},
            {"role": "user", "content": json.dumps({
                "task": "mission_intelligence_incremental",
                "scan": scan_data["scan"],
                "findings_summary": scan_data["findings_summary"],
                "state": scan_data["state"],
                "instructions": (
                    "You will be sent log batches. For EACH batch, update state with any new timeline events, "
                    "errors, tool observations, and progress signals. Respond with JSON only:\n"
                    "{ state: <updated_state>, batch_summary: string, batch_flags: { had_errors: bool, had_tool_failures: bool } }"
                ),
            }, ensure_ascii=False)}
        ]

    def generate_batch_prompt(self, scan_data: Dict, batch_index: int, total_batches: int, log_batch: str) -> List[Dict]:
        """Generate prompt for log batch processing."""
        return [
            {"role": "user", "content": json.dumps({
                "batch_index": batch_index,
                "batch_total": total_batches,
                "log_batch": log_batch,
            }, ensure_ascii=False)}
        ]

    def generate_final_prompt(self, scan_data: Dict, accumulated_state: Dict) -> List[Dict]:
        """Generate final synthesis prompt."""
        return [
            {"role": "system", "content": (
                "You are a security scan analyst. Produce a Mission Intelligence Report from the provided state "
                "derived from full terminal logs (batch-by-batch) plus scan findings counts.\n"
                "Output STRICT JSON only. No markdown."
            )},
            {"role": "user", "content": json.dumps({
                "task": "mission_intelligence_final",
                "scan": scan_data["scan"],
                "findings_summary": scan_data["findings_summary"],
                "state_from_logs": accumulated_state,
                "output_schema": {
                    "score": "integer 0-100 (higher is better security posture)",
                    "risk_level": "low|medium|high|critical",
                    "mission_summary": "1-2 sentences",
                    "what_happened": "short narrative of scan phases and events",
                    "timeline": "array of key events with timestamps if available",
                    "notable_errors": "array of errors/tool failures",
                    "recommendations": "array of concrete next steps",
                },
            }, ensure_ascii=False)}
        ]


class LogParser:
    """Parses and normalizes scan logs and findings."""

    def parse_logs(self, logs: List[Dict]) -> List[str]:
        """Parse logs into batches for AI processing."""
        batches = []
        buf = ""
        max_chars = 7000

        for entry in logs:
            ts = entry.get("timestamp", "")
            tool = entry.get("tool", "")
            lvl = entry.get("level", "")
            msg = (entry.get("message", "") or "").replace("\r", "")
            line = f"[{ts}] {tool} {lvl}: {msg}\n"

            if len(buf) + len(line) > max_chars and buf.strip():
                batches.append(buf.rstrip())
                buf = ""
            buf += line

        if buf.strip():
            batches.append(buf.rstrip())

        return batches if batches else ["(no logs captured)"]

    def normalize_findings(self, findings: List[Dict]) -> Dict:
        """Normalize findings into summary format."""
        return {
            "count": len(findings),
            "by_severity": {
                "critical": sum(1 for f in findings if f.get("severity") == "critical"),
                "high": sum(1 for f in findings if f.get("severity") == "high"),
                "medium": sum(1 for f in findings if f.get("severity") == "medium"),
                "low": sum(1 for f in findings if f.get("severity") == "low"),
                "info": sum(1 for f in findings if f.get("severity") == "info"),
            },
        }


class ScanSummarizer:
    """Main service class for AI-powered scan summarization."""

    def __init__(self, user_id: str, scan_id: str):
        self.user_id = user_id
        self.scan_id = scan_id
        self.provider = None
        self.sanitizer = Sanitizer()
        self.prompt_gen = PromptGenerator()
        self.log_parser = LogParser()
        self._load_config()

    def _load_config(self):
        """Load user AI configuration."""
        settings = get_ai_settings(self.user_id)
        if not settings.get("endpoint") or not settings.get("api_key"):
            raise RuntimeError("AI endpoint/api_key not configured")

        self.provider = AIProvider(
            endpoint=settings["endpoint"],
            api_key=settings["api_key"],
            model=settings.get("model", "gpt-4o-mini").strip()
        )

    def _get_scan_data(self) -> Dict:
        """Load scan job and findings data."""
        job = get_scan_job(self.scan_id)
        if not job or job["user_id"] != self.user_id:
            raise RuntimeError("scan not found")
        if job.get("status") != "completed":
            raise RuntimeError("scan not completed")

        findings = get_findings(self.scan_id)
        logs = get_scan_logs(self.scan_id)  # Assuming this function exists

        return {
            "job": job,
            "findings": findings,
            "logs": logs
        }

    def _safe_json_loads(self, text: str) -> Optional[Dict]:
        """Safely parse JSON from AI response."""
        try:
            return json.loads(text)
        except Exception:
            # Try to salvage JSON in code blocks
            if "```" in text:
                cleaned = text.replace("```json", "```").strip()
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
                        pass
        return None

    def generate_summary(self) -> Dict:
        """Generate AI-powered summary for the scan."""
        scan_data = self._get_scan_data()

        # Parse logs into batches
        log_batches = self.log_parser.parse_logs(scan_data["logs"])
        findings_summary = self.log_parser.normalize_findings(scan_data["findings"])

        # Prepare initial scan context
        job = scan_data["job"]
        scan_context = {
            "scan": {
                "id": self.scan_id,
                "target": job.get("target"),
                "mode": job.get("mode"),
                "sensitivity": job.get("sensitivity"),
                "tools": job.get("tools", []),
                "created_at": job.get("created_at"),
                "finished_at": job.get("finished_at"),
            },
            "findings_summary": findings_summary,
            "state": {
                "timeline": [],
                "notable_events": [],
                "errors": [],
                "tools_observed": [],
                "progress_signals": [],
            }
        }

        # Incremental processing state
        state = scan_context["state"]

        # Process log batches incrementally
        base_context = self.prompt_gen.generate_initial_prompt(scan_context)

        for i, batch in enumerate(log_batches):
            batch_prompt = self.prompt_gen.generate_batch_prompt(
                scan_context, i + 1, len(log_batches), batch
            )
            messages = base_context + batch_prompt

            try:
                response = self.provider.call_chat(messages, timeout_s=75)
                parsed = self._safe_json_loads(response)
                if isinstance(parsed, dict) and "state" in parsed:
                    state = parsed["state"]
                    # Update base context with new state
                    scan_context["state"] = state
                    base_context = [base_context[0]] + [
                        {"role": "user", "content": json.dumps({
                            "task": "mission_intelligence_incremental",
                            "scan": scan_context["scan"],
                            "findings_summary": findings_summary,
                            "state": state,
                            "instructions": (
                                "Continue updating state from the next log batch. JSON only."
                            ),
                        }, ensure_ascii=False)}
                    ]
            except Exception as e:
                # Log error but continue processing
                print(f"Warning: Failed to process batch {i+1}: {e}")
                continue

        # Final synthesis
        final_messages = self.prompt_gen.generate_final_prompt(scan_context, state)
        try:
            final_response = self.provider.call_chat(final_messages, timeout_s=90)
            report = self._safe_json_loads(final_response)
            if not isinstance(report, dict):
                raise RuntimeError("AI did not return JSON for mission intelligence report")
        except Exception as e:
            # Fallback to basic report on AI failure
            report = self._generate_fallback_report(scan_data, str(e))

        # Post-process report
        report = self._post_process_report(report)

        return report

    def _generate_fallback_report(self, scan_data: Dict, error: str) -> Dict:
        """Generate basic report when AI fails."""
        findings = scan_data["findings"]
        return {
            "score": 50,  # Neutral score
            "risk_level": "unknown",
            "mission_summary": f"Scan completed with {len(findings)} findings. AI summarization failed: {error}",
            "what_happened": "Scan executed but AI analysis unavailable.",
            "timeline": ["Scan completed"],
            "notable_errors": [f"AI service error: {error}"],
            "recommendations": ["Review findings manually", "Check AI configuration"],
            "ai_error": True
        }

    def _post_process_report(self, report: Dict) -> Dict:
        """Post-process and sanitize the AI report."""
        # Sanitize text fields
        for key in ["mission_summary", "what_happened"]:
            if key in report and isinstance(report[key], str):
                report[key] = self.sanitizer.sanitize(report[key])

        # Sanitize arrays
        for key in ["timeline", "notable_errors", "recommendations"]:
            if key in report and isinstance(report[key], list):
                report[key] = [self.sanitizer.sanitize(str(item)) for item in report[key]]

        # Clamp score
        score = report.get("score")
        try:
            score_i = int(score)
            score_i = max(0, min(100, score_i))
            report["score"] = score_i
        except Exception:
            report["score"] = 50

        # Set metadata
        report.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
        report.setdefault("scan_id", self.scan_id)

        return report


def summarize_scan_async(user_id: str, scan_id: str):
    """Async wrapper to generate scan summary in background thread."""
    def worker():
        try:
            summarizer = ScanSummarizer(user_id, scan_id)
            report = summarizer.generate_summary()

            # Save to cache file (following existing pattern)
            from pathlib import Path
            cache_dir = Path(f"data/user_{user_id}/scans/scan_{scan_id}")
            cache_dir.mkdir(parents=True, exist_ok=True)
            cache_file = cache_dir / "mission_intelligence.json"
            cache_file.write_text(json.dumps(report, indent=2, ensure_ascii=False))

            # Update DB with score if available
            if "score" in report:
                from database import update_scan_status
                update_scan_status(scan_id, "completed", overall_score=report["score"])

        except Exception as e:
            print(f"Failed to generate AI summary for scan {scan_id}: {e}")
            # Could log to scan logs or set error flag

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()