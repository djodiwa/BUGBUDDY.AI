"""
BugBuddy.AI — Database Layer
SQLite + bcrypt + Fernet encryption
"""

import json
import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ── Optional deps (installed by start.py) ──────────────────────────────────
try:
    import bcrypt
    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False

try:
    from cryptography.fernet import Fernet
    HAS_FERNET = True
except ImportError:
    HAS_FERNET = False

# ── Paths ───────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH  = BASE_DIR / "data" / "bugbuddy.db"
KEY_FILE = BASE_DIR / "data" / ".fernet_key"

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# ── Fernet encryption key ───────────────────────────────────────────────────
def _get_fernet():
    if not HAS_FERNET:
        return None
    if not KEY_FILE.exists():
        key = Fernet.generate_key()
        KEY_FILE.write_bytes(key)
        KEY_FILE.chmod(0o600)
    key = KEY_FILE.read_bytes()
    return Fernet(key)

_FERNET = _get_fernet()

def encrypt_value(v: str) -> str:
    if _FERNET and v:
        return _FERNET.encrypt(v.encode()).decode()
    return v  # fallback: store as-is (dev mode)

def decrypt_value(v: str) -> str:
    if _FERNET and v:
        try:
            return _FERNET.decrypt(v.encode()).decode()
        except Exception:
            return v
    return v


# ── DB connection ───────────────────────────────────────────────────────────
def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ── Schema ──────────────────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    is_active   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
    user_id         TEXT PRIMARY KEY REFERENCES users(id),
    endpoint        TEXT,
    api_key_enc     TEXT,
    model           TEXT DEFAULT 'gpt-4o-mini',
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_jobs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    target      TEXT NOT NULL,
    mode        TEXT NOT NULL,
    sensitivity TEXT NOT NULL,
    tools       TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL,
    finished_at TEXT,
    overall_score INTEGER,
    findings_count INTEGER DEFAULT 0,
    scan_dir    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS findings (
    id          TEXT PRIMARY KEY,
    scan_id     TEXT NOT NULL REFERENCES scan_jobs(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    tool        TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    severity    TEXT NOT NULL,
    url         TEXT,
    evidence    TEXT,
    confidence  TEXT,
    cvss        REAL,
    timestamp   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_user ON scan_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_findings_scan  ON findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_findings_user  ON findings(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);

CREATE TABLE IF NOT EXISTS scan_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id     TEXT NOT NULL REFERENCES scan_jobs(id),
    user_id     TEXT NOT NULL REFERENCES users(id),
    tool        TEXT NOT NULL,
    level       TEXT NOT NULL,
    message     TEXT NOT NULL,
    timestamp   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_logs_scan ON scan_logs(scan_id);
"""

def init_db():
    with get_conn() as c:
        c.executescript(SCHEMA)

init_db()


# ── Password helpers ─────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    if HAS_BCRYPT:
        return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()
    # Fallback (dev only) — NOT secure
    import hashlib
    salt = secrets.token_hex(16)
    h = hashlib.sha256((plain + salt).encode()).hexdigest()
    return f"sha256${salt}${h}"

def verify_password(plain: str, hashed: str) -> bool:
    if HAS_BCRYPT and not hashed.startswith("sha256$"):
        try:
            return bcrypt.checkpw(plain.encode(), hashed.encode())
        except Exception:
            return False
    if hashed.startswith("sha256$"):
        import hashlib
        _, salt, stored = hashed.split("$")
        h = hashlib.sha256((plain + salt).encode()).hexdigest()
        return h == stored
    return False


# ── User CRUD ────────────────────────────────────────────────────────────────
def _now(): return datetime.now(timezone.utc).isoformat()

def create_user(username: str, password: str, email: str = None) -> dict:
    uid = str(uuid.uuid4())
    ph  = hash_password(password)
    with get_conn() as c:
        c.execute(
            "INSERT INTO users(id,username,email,password_hash,created_at) VALUES(?,?,?,?,?)",
            (uid, username, email, ph, _now())
        )
    return {"id": uid, "username": username}

def get_user_by_username(username: str) -> dict | None:
    with get_conn() as c:
        row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None

def get_user_by_id(uid: str) -> dict | None:
    with get_conn() as c:
        row = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        return dict(row) if row else None


# ── Session CRUD ─────────────────────────────────────────────────────────────
from datetime import timedelta

SESSION_TTL_DAYS = 7

def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)).isoformat()
    with get_conn() as c:
        c.execute("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
                  (token, user_id, _now(), expires))
    return token

def validate_session(token: str) -> dict | None:
    with get_conn() as c:
        row = c.execute("""
            SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id
            WHERE s.token=? AND s.expires_at > ? AND u.is_active=1
        """, (token, _now())).fetchone()
        return dict(row) if row else None

def delete_session(token: str):
    with get_conn() as c:
        c.execute("DELETE FROM sessions WHERE token=?", (token,))


# ── AI Settings CRUD ─────────────────────────────────────────────────────────
def save_ai_settings(user_id: str, endpoint: str, api_key: str, model: str):
    enc_key = encrypt_value(api_key) if api_key else ""
    with get_conn() as c:
        c.execute("""
            INSERT INTO ai_settings(user_id,endpoint,api_key_enc,model,updated_at)
            VALUES(?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
              endpoint=excluded.endpoint,
              api_key_enc=excluded.api_key_enc,
              model=excluded.model,
              updated_at=excluded.updated_at
        """, (user_id, endpoint, enc_key, model, _now()))

def get_ai_settings(user_id: str) -> dict:
    with get_conn() as c:
        row = c.execute("SELECT * FROM ai_settings WHERE user_id=?", (user_id,)).fetchone()
        if row:
            d = dict(row)
            d["api_key"] = decrypt_value(d.get("api_key_enc", ""))
            d["has_key"] = bool(d["api_key"])
            d.pop("api_key_enc", None)
            return d
        return {"endpoint": "", "model": "gpt-4o-mini", "has_key": False}


# ── Scan Job CRUD ────────────────────────────────────────────────────────────
def create_scan_job(user_id: str, target: str, mode: str, sensitivity: str,
                    tools: list, scan_dir: str) -> dict:
    jid = str(uuid.uuid4())
    with get_conn() as c:
        c.execute("""
            INSERT INTO scan_jobs(id,user_id,target,mode,sensitivity,tools,status,created_at,scan_dir)
            VALUES(?,?,?,?,?,?,?,?,?)
        """, (jid, user_id, target, mode, sensitivity, json.dumps(tools), "pending", _now(), scan_dir))
    return get_scan_job(jid)

def get_scan_job(scan_id: str) -> dict | None:
    with get_conn() as c:
        row = c.execute("SELECT * FROM scan_jobs WHERE id=?", (scan_id,)).fetchone()
        if row:
            d = dict(row)
            d["tools"] = json.loads(d.get("tools", "[]"))
            return d
        return None

def list_scan_jobs(user_id: str) -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM scan_jobs WHERE user_id=? ORDER BY created_at DESC", (user_id,)
        ).fetchall()
    result = []
    for row in rows:
        d = dict(row)
        d["tools"] = json.loads(d.get("tools", "[]"))
        result.append(d)
    return result

# ── Scan Logs (persisted) ────────────────────────────────────────────────────────
def save_scan_logs(scan_id: str, user_id: str, logs: list):
    with get_conn() as c:
        for log in logs:
            c.execute(
                "INSERT INTO scan_logs (scan_id, user_id, tool, level, message, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (scan_id, user_id, log.get("tool", ""), log.get("level", "info"), log.get("message", ""), log.get("timestamp", ""))
            )

def get_scan_logs(scan_id: str) -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM scan_logs WHERE scan_id=? ORDER BY timestamp ASC", (scan_id,)
        ).fetchall()
        return [dict(row) for row in rows]

def update_scan_status(scan_id: str, status: str, finished_at: str = None,
                       overall_score: int = None, findings_count: int = None):
    with get_conn() as c:
        fields = ["status=?"]
        vals   = [status]
        if finished_at:
            fields.append("finished_at=?"); vals.append(finished_at)
        if overall_score is not None:
            fields.append("overall_score=?"); vals.append(overall_score)
        if findings_count is not None:
            fields.append("findings_count=?"); vals.append(findings_count)
        vals.append(scan_id)
        c.execute(f"UPDATE scan_jobs SET {', '.join(fields)} WHERE id=?", vals)


# ── Finding CRUD ─────────────────────────────────────────────────────────────
def insert_finding(scan_id: str, user_id: str, tool: str, title: str, description: str,
                   severity: str, url: str = None, evidence: list = None,
                   confidence: str = "medium", cvss: float = None) -> dict:
    fid = str(uuid.uuid4())
    ts  = _now()
    ev  = json.dumps(evidence or [])
    with get_conn() as c:
        c.execute("""
            INSERT INTO findings(id,scan_id,user_id,tool,title,description,severity,url,evidence,confidence,cvss,timestamp)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """, (fid, scan_id, user_id, tool, title, description, severity, url, ev, confidence, cvss, ts))
        # Real-time count update for dashboard
        c.execute("UPDATE scan_jobs SET findings_count = findings_count + 1 WHERE id=?", (scan_id,))
    return {
        "id": fid, "scan_id": scan_id, "tool": tool, "title": title,
        "description": description, "severity": severity, "url": url,
        "evidence": evidence or [], "confidence": confidence, "cvss": cvss, "timestamp": ts
    }

def get_findings(scan_id: str) -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM findings WHERE scan_id=? ORDER BY timestamp ASC", (scan_id,)
        ).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["evidence"] = json.loads(d.get("evidence", "[]"))
            result.append(d)
        return result

def get_all_findings(user_id: str) -> list:
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM findings WHERE user_id=? ORDER BY timestamp DESC", (user_id,)
        ).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["evidence"] = json.loads(d.get("evidence", "[]"))
            result.append(d)
        return result
