#!/usr/bin/env python3
"""
VulnScan::Local — Startup Script
Launches the Flask backend and Vite frontend together.

Usage:
    python3 start.py                # default ports (backend:5000, frontend:8080)
    python3 start.py --no-browser   # don't open browser automatically
    python3 start.py --backend-only # only run backend (API)
    python3 start.py --frontend-only # only run frontend (needs backend running)
"""

import argparse
import os
import platform
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent

BACKEND_PORT  = 5000
FRONTEND_PORT = 8080

BOLD  = "\033[1m"
GREEN = "\033[32m"
CYAN  = "\033[36m"
RED   = "\033[31m"
YELLOW= "\033[33m"
RESET = "\033[0m"

def banner():
    print(f"""
{CYAN}{BOLD}
  ╔══════════════════════════════════════════╗
  ║       VulnScan::Local  Launcher          ║
  ║  Flask Backend + Vite Frontend           ║
  ╚══════════════════════════════════════════╝
{RESET}""")

def check_dependency(name: str, install_hint: str) -> bool:
    import shutil
    if shutil.which(name):
        return True
    print(f"  {RED}x{RESET} {name} not found - {install_hint}")
    return False

def check_python_deps():
    missing = []
    for pkg in ["flask","flask_cors","requests","bcrypt","cryptography"]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"\n{YELLOW}Installing missing Python packages: {', '.join(missing)}{RESET}")
        subprocess.run([sys.executable, "-m", "pip", "install", *missing, "--break-system-packages"], check=False)

def is_port_in_use(port: int) -> tuple[bool, str]:
    """Check if port is in use. Returns (is_in_use, process_info)"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex(("127.0.0.1", port))
        sock.close()
        if result != 0:
            return False, ""
    except Exception:
        return False, ""
    
    try:
        result = subprocess.run(
            ["lsof", "-i", f":{port}", "-n", "-P"],
            capture_output=True,
            text=True,
            timeout=5
        )
        output = result.stdout.strip()
        if output:
            lines = output.split("\n")
            if len(lines) > 1:
                info = " | ".join(lines[1:4])
                return True, info[:100]
        return True, f"PID using port {port}"
    except Exception:
        pass
    
    return True, f"Port {port} is in use"

def wait_for_port(port: int, timeout: float = 30.0, label: str = "") -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(("127.0.0.1", port))
            sock.close()
            if result == 0:
                return True
        except Exception:
            pass
        time.sleep(0.5)
    print(f"  {RED}x{RESET} Timeout waiting for {label} on port {port}")
    return False

def prompt_kill_port(port: int, app_info: str) -> bool:
    """Prompt user to kill port or exit"""
    print(f"\n{RED}x{RESET} Port {port} is already in use")
    if app_info:
        print(f"  Info: {app_info}")
    
    while True:
        try:
            response = input(f"\n{YELLOW}Kill the process and continue? (y/n): {RESET}").strip().lower()
        except EOFError:
            return False
        if response in ["y", "yes"]:
            return True
        elif response in ["n", "no"]:
            return False
        print(f"  {RED}Please enter 'y' or 'n'{RESET}")

def kill_port_processes(port: int) -> bool:
    """Kill all processes using the port"""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True,
            text=True
        )
        if result.stdout.strip():
            pids = result.stdout.strip().split("\n")
            killed = []
            for pid in pids:
                if pid:
                    try:
                        subprocess.run(["kill", "-9", pid], check=False)
                        killed.append(pid)
                    except Exception:
                        pass
            if killed:
                print(f"  Killed PIDs: {', '.join(killed)}")
                return True
    except Exception as e:
        print(f"  {RED}Failed to kill: {e}{RESET}")
    return False

def run():
    parser = argparse.ArgumentParser(description="VulnScan::Local Launcher")
    parser.add_argument("--no-browser", action="store_true", help="Don't open browser")
    parser.add_argument("--backend-only", action="store_true", help="Only run Flask backend")
    parser.add_argument("--frontend-only", action="store_true", help="Only run Vite frontend")
    parser.add_argument("--backend-port", type=int, default=BACKEND_PORT)
    parser.add_argument("--frontend-port", type=int, default=FRONTEND_PORT)
    parser.add_argument("--force", action="store_true", help="Force kill ports if in use")
    args = parser.parse_args()

    banner()

    # Preflight checks
    print(f"{BOLD}Preflight checks:{RESET}")
    ok = True
    ok &= check_dependency("python3", "should be available")
    if not args.backend_only:
        ok &= check_dependency("node", "install Node.js from nodejs.org")
        ok &= check_dependency("npm", "install Node.js from nodejs.org")
    if not ok:
        print(f"\n{RED}Fix missing dependencies and retry.{RESET}")
        sys.exit(1)

    check_python_deps()
    print(f"  {GREEN}OK{RESET} Python deps OK\n")

    # Install npm deps if needed
    if not args.backend_only:
        node_modules = ROOT / "node_modules"
        if not node_modules.exists():
            print(f"{YELLOW}Installing npm dependencies (first run)...{RESET}")
            r = subprocess.run(["npm", "install"], cwd=ROOT, check=False)
            if r.returncode != 0:
                print(f"{RED}npm install failed.{RESET}")
                sys.exit(1)
            print(f"  {GREEN}OK{RESET} npm deps installed\n")

    # Check ports
    print(f"{BOLD}Checking ports:{RESET}")
    
    if not args.frontend_only:
        in_use, info = is_port_in_use(args.backend_port)
        if in_use:
            if args.force:
                print(f"{YELLOW}Force killing port {args.backend_port}...")
                kill_port_processes(args.backend_port)
                time.sleep(1)
            else:
                if not prompt_kill_port(args.backend_port, info):
                    print(f"\n{RED}Exiting.{RESET}")
                    sys.exit(1)
                kill_port_processes(args.backend_port)
                time.sleep(1)

    if not args.backend_only:
        in_use, info = is_port_in_use(args.frontend_port)
        if in_use:
            if args.force:
                print(f"{YELLOW}Force killing port {args.frontend_port}...")
                kill_port_processes(args.frontend_port)
                time.sleep(1)
            else:
                if not prompt_kill_port(args.frontend_port, info):
                    print(f"\n{RED}Exiting.{RESET}")
                    sys.exit(1)
                kill_port_processes(args.frontend_port)
                time.sleep(1)

    processes = []

    def cleanup(sig=None, frame=None):
        print(f"\n{YELLOW}Shutting down...{RESET}")
        for p in processes:
            try:
                p.terminate()
            except Exception:
                pass
        for p in processes:
            try:
                p.wait(timeout=5)
            except Exception:
                try: p.kill()
                except Exception: pass
        print(f"{GREEN}All processes stopped.{RESET}")
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    # Start Backend
    if not args.frontend_only:
        backend_script = ROOT / "backend" / "api.py"
        if not backend_script.exists():
            print(f"{RED}Backend script not found: {backend_script}{RESET}")
            sys.exit(1)

        print(f"{BOLD}Starting Flask backend on port {args.backend_port}...")
        env = os.environ.copy()
        env["FLASK_ENV"] = "production"
        backend_proc = subprocess.Popen(
            [sys.executable, str(backend_script)],
            cwd=ROOT,
            env=env,
        )
        processes.append(backend_proc)

        if not wait_for_port(args.backend_port, timeout=20, label="Flask backend"):
            cleanup()
        print(f"  {GREEN}OK{RESET} Backend ready at http://127.0.0.1:{args.backend_port}\n")

    # Start Frontend
    if not args.backend_only:
        print(f"{BOLD}Starting Vite frontend on port {args.frontend_port}...")
        frontend_proc = subprocess.Popen(
            ["npm", "run", "dev", "--", "--port", str(args.frontend_port)],
            cwd=ROOT,
        )
        processes.append(frontend_proc)

        if not wait_for_port(args.frontend_port, timeout=30, label="Vite frontend"):
            cleanup()
        print(f"  {GREEN}OK{RESET} Frontend ready at http://localhost:{args.frontend_port}\n")

    # Summary
    print(f"""{GREEN}
  ===========================================
  VulnScan::Local is running!
  ===========================================
  UI  -> http://localhost:{args.frontend_port}
  API -> http://127.0.0.1:{args.backend_port}
  ===========================================
  Press Ctrl+C to stop
  ===========================================
{RESET}""")

    # Open browser
    if not args.no_browser and not args.backend_only:
        time.sleep(1)
        try:
            webbrowser.open(f"http://localhost:{args.frontend_port}")
            print(f"  {CYAN}Browser opened{RESET}")
        except Exception:
            pass

    # Wait
    print("\nWaiting... (Ctrl+C to stop)\n")
    while True:
        for p in processes:
            if p.poll() is not None:
                print(f"\n{RED}A process exited unexpectedly. Shutting down.{RESET}")
                cleanup()
        time.sleep(2)

if __name__ == "__main__":
    run()