"""Start detached local recording services; reuse healthy ports and stop nothing."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
LOGS = ROOT / "artifacts/recording-servers"


def ready(port, kind):
    try:
        with urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
            value = json.load(response)
        if value != {"status": "ok", "schema_version": "1.0.0"}:
            return False
        if kind == "web":
            with urlopen(f"http://127.0.0.1:{port}/", timeout=1) as response:
                return b"TADS Flood" in response.read(10000)
        return True
    except (OSError, ValueError):
        return False


def start(port, kind, command, cwd, environment):
    if ready(port, kind):
        print(f"Reusing healthy {kind} service at 127.0.0.1:{port}", flush=True)
        return
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            raise RuntimeError(f"Port {port} belongs to another or unhealthy service; nothing was stopped.")
    with (LOGS / f"{kind}.log").open("ab") as log:
        child = subprocess.Popen(command, cwd=cwd, env=environment,
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True)
    (LOGS / f"{kind}.pid").write_text(str(child.pid) + "\n")
    deadline = time.monotonic() + 20
    while not ready(port, kind):
        if child.poll() is not None or time.monotonic() > deadline:
            raise RuntimeError(f"{kind} did not become healthy. Inspect {LOGS / (kind + '.log')}.")
        time.sleep(.2)
    print(f"Started detached {kind} service at 127.0.0.1:{port} (PID {child.pid})", flush=True)


def main():
    if not (ROOT / "apps/web/dist/index.html").is_file():
        raise RuntimeError("Build the web app first: npm run build --prefix apps/web")
    LOGS.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ)
    start(8000, "api", [sys.executable, "-m", "uvicorn", "tads_flood.api:app",
        "--app-dir", "services/api/src", "--host", "127.0.0.1", "--port", "8000",
        "--no-access-log"], ROOT, environment)
    web_environment = dict(environment)
    for key in ("CDSE_CLIENT_ID", "CDSE_CLIENT_SECRET", "OHSOME_API_KEY", "LLM_API_KEY",
                "LLM_MODEL", "LLM_BASE_URL", "LLM_PROVIDER", "TADS_DATA_ROOT"):
        web_environment.pop(key, None)
    web_environment["VITE_API_BASE_URL"] = "http://127.0.0.1:8000"
    start(4175, "web", ["npm", "run", "preview", "--", "--host", "127.0.0.1",
        "--port", "4175", "--strictPort"], ROOT / "apps/web", web_environment)
    print("Recording app: http://127.0.0.1:4175/", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, FileNotFoundError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
