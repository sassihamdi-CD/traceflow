"""TraceFlow pilot one-command setup + run for Windows (and anywhere).

Replaces pilot-windows.ps1 with something that parses identically on every
machine: plain Python 3.9+ stdlib only, no third-party packages.

  depressing history: the .ps1 launcher died on some Windows laptops with
  "Unexpected token '}'" parse errors we could never reproduce on 7.x.
  This file is the primary launcher now; the .ps1 stays as a fallback.

Usage (Windows):
    py pilot-windows.py
    py pilot-windows.py --port 8001 --no-browser
    py pilot-windows.py --env-file "%USERPROFILE%\\Downloads\\.env"
    py pilot-windows.py --check        (diagnose only, changes nothing)

Steps: arch detect -> prereqs (git/python/docker, winget install if
missing) -> .env create/import (+ random DB_APP_PASSWORD, bridge backend
keys to NEXT_PUBLIC_*) -> free API + web ports (kills stale listeners,
never touches PID 0/4) -> `docker compose up --build -d` (or local venv
with --no-docker) -> poll API /health, /ready + web / -> open browser.
"""
from __future__ import annotations

import argparse
import os
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

VERSION = "2026-10-01-py1"
REPO = os.path.dirname(os.path.abspath(__file__))
ON_WINDOWS = os.name == "nt"

PLACEHOLDER_BITS = ("change-me", "xyz", "<account", "sk-ant-change-me", "example")


def step(msg):
    print("\n==> " + msg)


def ok(msg):
    print("  [OK] " + msg)


def warn(msg):
    print("  [!!] " + msg)


def fail(msg):
    print("  [XX] " + msg)


def run(cmd, **kw):
    """Run a command, return (returncode, stdout stripped). Never raises."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=120, **kw)
        return p.returncode, (p.stdout or "").strip()
    except Exception as e:  # missing exe, timeout, ...
        return 127, str(e)


def have(cmd):
    return shutil.which(cmd) is not None


def is_placeholder(value):
    if value is None or not str(value).strip():
        return True
    low = str(value)
    return any(bit in low for bit in PLACEHOLDER_BITS)


# ---------------------------------------------------------------- .env helpers
def read_env(path):
    data = {}
    if not os.path.exists(path):
        return data
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f.read().splitlines():
            m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", line)
            if m:
                data[m.group(1)] = m.group(2).strip()
    return data


def write_env(path, data, order_hint=()):
    """Rewrite .env preserving key order (existing order first)."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        original = f.read().splitlines()
    seen = set()
    out = []
    for line in original:
        m = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
        if m and m.group(1) in data:
            out.append("%s=%s" % (m.group(1), data[m.group(1)]))
            seen.add(m.group(1))
        else:
            out.append(line)
    for key in list(order_hint) + sorted(data):
        if key not in seen and key in data:
            out.append("%s=%s" % (key, data[key]))
            seen.add(key)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out) + "\n")


# ---------------------------------------------------------------- port helpers
def port_owner_pid(port):
    """PID listening on 127.0.0.1:port / 0.0.0.0:port, or None. Never raises."""
    if ON_WINDOWS:
        code, out = run(["netstat", "-ano"])
        if code != 0:
            return None
        for line in out.splitlines():
            if "LISTENING" not in line:
                continue
            parts = line.split()
            # TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING    1234
            if len(parts) >= 4 and parts[0] == "TCP" and parts[-2] == "LISTENING":
                addr = parts[1]
                if addr.endswith(":%d" % port):
                    try:
                        return int(parts[-1])
                    except ValueError:
                        return None
        return None
    # POSIX: try ss, then /proc scan fallback
    code, out = run(["ss", "-tlnp"])
    if code == 0:
        for line in out.splitlines():
            m = re.search(r":%d\b" % port, line)
            if m:
                m2 = re.search(r"pid=(\d+)", line)
                if m2:
                    return int(m2.group(1))
                return -1  # something listens, PID hidden
        return None
    # last resort: can we bind? (None = free, -1 = taken)
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port))
        return None
    except OSError:
        return -1
    finally:
        s.close()


def proc_name(pid):
    if pid is None or pid < 0:
        return "?"
    if ON_WINDOWS:
        code, out = run(["tasklist", "/FI", "PID eq %d" % pid, "/FO", "CSV", "/NH"])
        if code == 0 and out:
            return out.split(",")[0].strip('"')
        return "pid %d" % pid
    try:
        with open("/proc/%d/comm" % pid) as f:
            return f.read().strip()
    except Exception:
        return "pid %d" % pid


def free_port(port, label):
    pid = port_owner_pid(port)
    if pid is None:
        ok("%s port %d is free" % (label, port))
        return True
    if pid in (0, 4):
        warn("%s port %d is held by System (PID %d). Stop it manually or set another port in .env." % (label, port, pid))
        return False
    if pid == -1:
        warn("%s port %d is busy (owner hidden). Stop whatever uses it or set another port in .env." % (label, port))
        return False
    name = proc_name(pid)
    warn("%s port %d is in use by '%s' (PID %d). Stopping it ..." % (label, port, name, pid))
    if ON_WINDOWS:
        run(["taskkill", "/F", "/PID", str(pid)])
    else:
        try:
            os.kill(pid, 9)
        except Exception as e:
            fail("could not kill PID %d: %s" % (pid, e))
            return False
    time.sleep(2)
    if port_owner_pid(port) is not None:
        fail("could not free %s port %d." % (label, port))
        return False
    ok("freed %s port %d (stopped %s)" % (label, port, name))
    return True


# ---------------------------------------------------------------- health
def wait_healthy(port, path, timeout, label):
    url = "http://localhost:%d%s" % (port, path)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as r:
                if r.status < 400:
                    ok("%s -> HTTP %d" % (label, r.status))
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="TraceFlow pilot one-command setup + run")
    ap.add_argument("--port", type=int, default=0, help="API port (0 = .env PORT or 8000)")
    ap.add_argument("--web-port", type=int, default=0, help="console port (0 = .env WEB_PORT or 3000)")
    ap.add_argument("--no-docker", action="store_true")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--env-file", default="", help="import a privately-received .env")
    ap.add_argument("--check", action="store_true", help="diagnose only, change nothing")
    args = ap.parse_args()

    os.chdir(REPO)
    print("TraceFlow pilot setup v%s (python %s)" % (VERSION, platform.python_version()))

    # ---- 0. arch
    step("Detecting OS / architecture")
    arch = platform.machine() or "unknown"  # AMD64, ARM64, x86_64, ...
    print("  OS: %s | CPU: %s" % (platform.system(), arch))
    if arch == "ARM64" or arch == "aarch64":
        warn("ARM64: winget picks ARM64 installers automatically; Docker Desktop + postgres:16-alpine support it.")

    # ---- 1. prereqs
    step("Checking prerequisites (git, python, docker)")
    if have("git"):
        _, out = run(["git", "--version"])
        ok(out or "git found")
    else:
        warn("git not found.")
        if not args.check and ON_WINDOWS and have("winget"):
            print("  Installing Git via winget ...")
            run(["winget", "install", "--exact", "--id", "Git.Git",
                 "--accept-source-agreements", "--accept-package-agreements"])
        else:
            fail("install git: https://git-scm.com/download/win (then re-run)")
            if not args.check:
                return 1
    pyver = sys.version_info
    if pyver >= (3, 9):
        ok("python %s" % platform.python_version())
    else:
        fail("python 3.9+ required, found %s" % platform.python_version())
        return 1

    compose = None
    if not args.no_docker:
        code, _ = run(["docker", "compose", "version"])
        if code == 0:
            compose = ["docker", "compose"]
        elif have("docker-compose"):
            code2, _ = run(["docker-compose", "--version"])
            if code2 == 0:
                compose = ["docker-compose"]
        if compose:
            _, out = run(["docker", "--version"])
            ok("%s (compose via '%s')" % ((out or "docker found"), " ".join(compose)))
            code, _ = run(["docker", "info"])
            if code == 0:
                ok("Docker engine is running")
            elif ON_WINDOWS and not args.check:
                dd = os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"),
                                   r"Docker\Docker\Docker Desktop.exe")
                if os.path.exists(dd):
                    warn("starting Docker Desktop ...")
                    subprocess.Popen([dd])
                    for _ in range(45):
                        time.sleep(2)
                        c, _ = run(["docker", "info"])
                        if c == 0:
                            break
                    else:
                        fail("Docker engine did not start. Open Docker Desktop, wait for green, re-run.")
                        return 1
            else:
                fail("Docker engine is not running (open Docker Desktop / start dockerd).")
                if not args.check:
                    return 1
        elif args.check:
            warn("docker not found (fallback would be venv mode)")
        else:
            warn("docker not found.")
            if ON_WINDOWS and have("winget"):
                ans = input("  Install Docker Desktop via winget now? [Y/n] ").strip().lower()
                if ans in ("", "y", "yes"):
                    run(["winget", "install", "--exact", "--id", "Docker.DockerDesktop",
                         "--accept-source-agreements", "--accept-package-agreements"])
                    fail("Docker Desktop was installed. Reboot if asked, start it, re-run.")
                    return 1
            warn("continuing WITHOUT docker (venv mode: API only, needs Node for web)")
    else:
        warn("-NoDocker/--no-docker: local venv + uvicorn (API only)")

    # ---- 2. .env
    step("Ensuring .env exists and keys are sane")
    env_path = os.path.join(REPO, ".env")
    if args.env_file:
        if not os.path.exists(args.env_file):
            fail("env file not found: %s" % args.env_file)
            return 1
        if not args.check:
            shutil.copyfile(args.env_file, env_path)
        ok("imported private env file -> .env (never commit this file)")
    elif not os.path.exists(env_path):
        ex = os.path.join(REPO, ".env.example")
        if not os.path.exists(ex):
            fail(".env.example is missing — are you in the repo root?")
            return 1
        if args.check:
            warn("no .env (would create from .env.example)")
        else:
            shutil.copyfile(ex, env_path)
            ok("created .env from .env.example (placeholders — see README 'Real keys')")
    else:
        ok(".env already exists")

    env = read_env(env_path if os.path.exists(env_path) else os.path.join(REPO, ".env.example"))

    def need_fix(key, placeholders=("change-me-local-only", "change-me", "")):
        return env.get(key, "") in placeholders

    if need_fix("DB_APP_PASSWORD") and not args.check:
        env["DB_APP_PASSWORD"] = secrets.token_hex(12) + "-local"
        write_env(env_path, env)
        ok("generated a random local-only DB_APP_PASSWORD")
    else:
        ok("DB_APP_PASSWORD is set")

    # bridge backend keys -> frontend build args
    bridged = []
    if is_placeholder(env.get("NEXT_PUBLIC_SUPABASE_URL")) and not is_placeholder(env.get("SUPABASE_URL")):
        env["NEXT_PUBLIC_SUPABASE_URL"] = env["SUPABASE_URL"]
        bridged.append("NEXT_PUBLIC_SUPABASE_URL")
    if is_placeholder(env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")) and not is_placeholder(env.get("SUPABASE_ANON_KEY")):
        env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = env["SUPABASE_ANON_KEY"]
        bridged.append("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if bridged and not args.check:
        write_env(env_path, env)
    if bridged:
        ok("bridged backend keys -> frontend build args: %s" % ", ".join(bridged))

    def port_of(key, default):
        try:
            return int(env.get(key, "") or default)
        except ValueError:
            return default

    port = args.port or port_of("PORT", 8000)
    web_port = args.web_port or port_of("WEB_PORT", 3000)
    ok("API port: %d | web console port: %d" % (port, web_port))
    # Export so `docker compose` maps these exact ports (env beats .env file).
    os.environ["PORT"] = str(port)
    os.environ["WEB_PORT"] = str(web_port)
    api_url = env.get("NEXT_PUBLIC_API_URL", "")
    if not api_url.strip() and not args.check:
        env["NEXT_PUBLIC_API_URL"] = "http://localhost:%d" % port
        write_env(env_path, env)
        ok("defaulted NEXT_PUBLIC_API_URL to http://localhost:%d" % port)

    # key status report
    print("  Key status (placeholder = feature disabled, pilot still runs):")
    groups = [
        (["SUPABASE_URL", "SUPABASE_ANON_KEY"], "login-gated routes"),
        (["ANTHROPIC_API_KEY"], "AI extraction"),
        (["R2_ENDPOINT", "R2_ACCESS_KEY_ID"], "file uploads (R2)"),
        (["NEXT_PUBLIC_PILOT_INVITE_CODE"], "pilot invite gate (web)"),
    ]
    for keys, label in groups:
        real = all(not is_placeholder(env.get(k)) for k in keys)
        (ok if real else warn)("%s: keys look %s" % (label, "REAL" if real else "PLACEHOLDER"))

    if args.check:
        ok("check mode: no changes made, nothing started. Ports/docker state above.")
        free_hint = []
        for p, lab in ((port, "API"), (web_port, "web")):
            pid = port_owner_pid(p)
            free_hint.append("%s:%d -> %s" % (lab, p, "free" if pid is None else "BUSY pid %s" % pid))
        print("  ports: %s" % " | ".join(free_hint))
        return 0

    # ---- 3. free ports
    step("Checking localhost ports (kill stale processes if needed)")
    free_port(port, "API")
    free_port(web_port, "web console")

    # ---- 4+5. run
    if compose and not args.no_docker:
        step("Starting pilot with Docker (build + migrate + api + worker + web)")
        if args.rebuild:
            subprocess.run(compose + ["build"], cwd=REPO)
        r = subprocess.run(compose + ["up", "--build", "-d"], cwd=REPO)
        if r.returncode != 0:
            fail("`%s` failed." % " ".join(compose + ["up", "--build", "-d"]))
            return 1
        print("  Waiting for API /health (up to 120s) ...")
        if not wait_healthy(port, "/health", 120, "API /health"):
            fail("'/health' never came up. Recent logs:")
            subprocess.run(compose + ["logs", "--tail=60", "api", "migrate", "db"], cwd=REPO)
            return 1
        print("  Waiting for API /ready (up to 60s) ...")
        if not wait_healthy(port, "/ready", 60, "API /ready"):
            warn("'/ready' is not green. Console may still work; check: %s logs migrate" % " ".join(compose))
        print("  Waiting for web console (up to 180s — first build takes a while) ...")
        if not wait_healthy(web_port, "/", 180, "web console"):
            fail("'web console' never came up. Recent logs:")
            subprocess.run(compose + ["logs", "--tail=60", "web"], cwd=REPO)
            return 1
    else:
        step("Starting pilot in local venv mode (no Docker, API only)")
        venv_py = os.path.join(REPO, ".venv", "Scripts" if ON_WINDOWS else "bin",
                               "python.exe" if ON_WINDOWS else "python")
        if not os.path.exists(venv_py):
            print("  Creating .venv ...")
            if subprocess.run([sys.executable, "-m", "venv", ".venv"], cwd=REPO).returncode != 0:
                fail("could not create venv (install python3-venv / repair Python install).")
                return 1
            venv_py = os.path.join(REPO, ".venv", "Scripts" if ON_WINDOWS else "bin",
                                   "python.exe" if ON_WINDOWS else "python")
        print("  Installing requirements ...")
        subprocess.run([venv_py, "-m", "pip", "install", "--upgrade", "pip"], cwd=REPO)
        if subprocess.run([venv_py, "-m", "pip", "install", "-r", "requirements.txt"], cwd=REPO).returncode != 0:
            fail("pip install failed.")
            return 1
        print("  Launching uvicorn on port %d ..." % port)
        kw = {}
        if ON_WINDOWS:
            kw["creationflags"] = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
        subprocess.Popen([venv_py, "-m", "uvicorn", "app.main:app",
                          "--host", "0.0.0.0", "--port", str(port)], cwd=REPO, **kw)
        print("  Waiting for API /health (up to 60s) ...")
        if not wait_healthy(port, "/health", 60, "API /health"):
            fail("uvicorn did not come up (often a bad DATABASE_URL in .env).")
            return 1
        warn("venv mode starts the API only. Web console: cd web && npm ci && npm run dev (needs Node 20+)")

    # ---- 6. browser
    step("Pilot is running")
    web_url = "http://localhost:%d" % web_port
    print("  Pilot console (frontend): %s" % web_url)
    print("  API docs (Swagger UI):  http://localhost:%d/docs" % port)
    if not args.no_browser:
        webbrowser.open(web_url)
        ok("opened the pilot console in your default browser")
    if compose and not args.no_docker:
        print("\n  Useful: %s logs -f api | %s down  (stop) | %s up --build -d (restart)"
              % (" ".join(compose), " ".join(compose), " ".join(compose)))
    ok("Done.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\nAborted.")
        sys.exit(130)
    except BrokenPipeError:
        sys.exit(0)
