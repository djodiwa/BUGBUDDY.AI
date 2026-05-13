<div align="center">

# ----- BugBuddy.AI (VulnScan::Local)-----

<a href="https://github.com/D3Ext/aesthetic-wallpapers/stargazers">
    <img alt="Stargazers" src="https://img.shields.io/github/stars/AXWTV/Hyprland-DotFiles?style=for-the-badge&logo=starship&color=89b4fa&logoColor=D9E0EE&labelColor=302D41"></a>
  <a href="https://lbesson.mit-license.org/">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge&color=89b4fa&logoColor=D9E0EE&labelColor=302D41"></a>
  <a herf="https://github.com/AXWTV/Hyprland-DotFiles/commits/main">
    <img alt="last-commit" src="https://img.shields.io/github/last-commit/AXWTV/Hyprland-DotFiles?style=for-the-badge&color=89b4fa&logo=github&logoColor=D9E0EE&labelColor=302D41"></a> 
  <a href="https://github.com/AXWTV/Hyprland-DotFiles/releases/latest">
    <img alt="GitHub release" src="https://img.shields.io/github/v/release/AXWTV/Hyprland-DotFiles?style=for-the-badge&color=89b4fa&logo=github&logoColor=D9E0EE&labelColor=302D41"></a>

<br/>
</div>

**An open-source, self-hosted vulnerability scanner orchestration platform with AI-powered analysis.**

BugBuddy.AI coordinates multiple industry-standard security scanning tools through a unified web dashboard, streams real-time results via SSE, and uses AI to summarise, score, and recommend remediation for findings. Everything runs locally — no cloud dependency, full data sovereignty.

### Core Capabilities

- **Multi-tool orchestration** — Runs Nuclei, Nikto, Wapiti, OWASP ZAP, Nmap, Subfinder, HTTPX, WhatWeb, and SSLyze in a phased pipeline
- **Three scan profiles** — Basic (passive/safe), Medium (active in-scope), Advanced (full active) with configurable sensitivity (Low-Noise/Normal/Aggressive)
- **Real-time streaming** — Live terminal console with colour-coded logs and findings via Server-Sent Events
- **AI Mission Intelligence** — Post-scan summarisation, scoring (0–100), risk assessment, and remediation recommendations via any OpenAI-compatible endpoint
- **AI Chatbot** — Built-in assistant that answers questions about scans, findings, and navigation
- **Findings management** — Browse, filter, search, and examine vulnerabilities across all scans with severity breakdowns
- **Export** — JSON and HTML report export for findings and AI intelligence
- **Full data sovereignty** — All scan data, logs, and AI reports stored locally in SQLite

> **Legal:** Only scan targets you own or have explicit written permission to test. Unauthorised scanning may violate computer fraud laws.

---

## Architecture

```
Browser (port 8080)                    Flask API (port 5000)
     │                                       │
     │── /api/* ──(proxy)──────────────────► │
     │                                       │
     │◄── SSE (real-time logs/findings)──────│
     │                                       │
                                        orchestrator.py (subprocess)
                                             │
                                   ┌─────────┼──────────┐
                                 Nuclei   Nikto   Wapiti   ZAP   Nmap   ...
```

- **Frontend:** React 18 + TypeScript + Vite 5 (port 8080)
- **Backend:** Flask Python REST API (port 5000)
- **Orchestrator:** Standalone Python subprocess managing tool execution lifecycle
- **Database:** SQLite with WAL mode (auto-created on first run)

---

## Requirements

| Requirement | Minimum |
|---|---|
| OS | **Kali Linux** (recommended), Debian 11+, Ubuntu 22.04+, Arch Linux |
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |
| RAM | 4 GB (8 GB recommended for aggressive scans) |
| Disk | 2 GB free |

---

## Installation

### 1. Clone and enter the project

```bash
git clone <your-repo-url> && cd FINAL_PUSH
```

### 2. Install Python dependencies

```bash
pip install -r requirements.txt --break-system-packages
```

### 3. Install Node.js dependencies

```bash
npm install
```

### 4. Install security scanning tools

#### Kali Linux (Recommended)

Most tools come pre-installed on Kali. Install any missing ones:

```bash
sudo apt update
sudo apt install -y nikto wapiti zaproxy nmap whatweb sslyze
```

Install ProjectDiscovery tools (nuclei, subfinder, httpx):

```bash
# Nuclei
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
# Subfinder
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
# HTTPX
go install github.com/projectdiscovery/httpx/cmd/httpx@latest
```

Or download pre-built binaries from the [ProjectDiscovery releases page](https://github.com/projectdiscovery).

#### Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y nikto wapiti zaproxy nmap whatweb sslyze

# ProjectDiscovery tools (option 1 — Go)
sudo apt install -y golang-go
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/httpx/cmd/httpx@latest

# ProjectDiscovery tools (option 2 — pre-built binaries)
# Visit: https://github.com/projectdiscovery/nuclei/releases
#        https://github.com/projectdiscovery/subfinder/releases
#        https://github.com/projectdiscovery/httpx/releases
```

#### Arch Linux

```bash
sudo pacman -S nikto wapiti nmap whatweb sslyze
yay -S zaproxy nuclei-bin subfinder-bin httpx-bin
```

### 5. (Optional) OWASP ZAP daemon

For ZAP integration, start the daemon before running scans:

```bash
zap.sh -daemon -port 8090 -host 127.0.0.1 -config api.disablekey=true
```

The orchestrator can also auto-start ZAP if the daemon is not already running.

---

## Running

```bash
python3 start.py
```

This starts both the Flask backend (port 5000) and Vite frontend (port 8080), then opens your browser.

| Flag | Purpose |
|---|---|
| `--no-browser` | Skip opening browser automatically |
| `--backend-only` | Start only the Flask API server |
| `--frontend-only` | Start only the Vite dev server |
| `--backend-port PORT` | Custom backend port (default: 5000) |
| `--frontend-port PORT` | Custom frontend port (default: 8080) |
| `--force` | Auto-kill processes on conflicting ports |

### Access

- **Web UI:** http://localhost:8080
- **API:** http://127.0.0.1:5000

---

## Quick Start Guide

1. Open the UI and **register** an account
2. Configure your **AI endpoint** in Settings (e.g. OpenAI, local Ollama, or any OpenAI-compatible API)
3. Go to **Tools** to verify which scanners are installed
4. On the **Dashboard**, enter a target URL, select a profile (Basic/Medium/Advanced) and sensitivity, then click **EXECUTE SCAN_**
5. Monitor the live terminal as the scan runs through Recon → Asset Intelligence → Vulnerability Engine phases
6. When the scan completes, view the **AI Mission Intelligence** report with scoring, summary, and recommendations
7. Browse all findings in the **Intelligence Hub** (Findings page)

### Scan Profiles

| Mode | Tools | What it does |
|---|---|---|
| Basic | All selected | Passive, low/medium templates, passive ZAP |
| Medium | All selected | Active in-scope, SQLi/XSS, ZAP active in-scope |
| Advanced | All selected | Full active, all severities, ZAP full scan |

### Estimated Times

| | Low-Noise | Normal | Aggressive |
|---|---|---|---|
| Basic | 45–90 min | 10–20 min | 3–8 min |
| Medium | 2–4 hrs | 30–60 min | 12–25 min |
| Advanced | 4–8 hrs | 60–120 min | 25–50 min |

---

## API Overview

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/scans` | Yes | List scans |
| POST | `/api/scan` | Yes | Launch scan |
| GET | `/api/scan/<id>/stream` | Token | SSE live stream |
| GET | `/api/scan/<id>/intelligence` | Yes | Get AI report |
| POST | `/api/chat` | Yes | AI chatbot |
| GET | `/api/tools` | Yes | Tool status |
| GET | `/api/settings/ai` | Yes | AI config |
| POST | `/api/settings/ai` | Yes | Save AI config |

---

## Tech Stack

**Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS 3, Framer Motion, Radix UI, TanStack Query, Recharts

**Backend:** Python 3, Flask, SQLite, bcrypt, Fernet encryption

**Scanners:** Nuclei, Nikto, Wapiti, OWASP ZAP, Nmap, Subfinder, HTTPX, WhatWeb, SSLyze

---

## License

See [LICENSE](LICENSE).
