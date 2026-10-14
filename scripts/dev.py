"""Start the local API and web app, stopping only processes this script owns."""
import argparse
import json
from pathlib import Path
import socket
import signal
import subprocess
import sys
import time
import os
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def port(value):
    number = int(value)
    if not 1 <= number <= 65535:
        raise argparse.ArgumentTypeError("Port must be between 1 and 65535")
    return number


def free(number):
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", number))
            return True
        except OSError:
            return False


def healthy(number):
    try:
        with urlopen(f"http://127.0.0.1:{number}/health", timeout=2) as response:
            value = json.load(response)
        return isinstance(value, dict) and value.get("status") == "ok" and value.get("schema_version") == "1.0.0"
    except (URLError, ValueError, TimeoutError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=port, default=8000)
    parser.add_argument("--web-port", type=port, default=5173)
    args = parser.parse_args()
    if args.api_port == args.web_port or not free(args.web_port):
        parser.error("Web port must be free and different from the API port; choose --web-port.")
    if not (ROOT / "apps/web/node_modules").exists():
        parser.error("Install frontend dependencies first: cd apps/web && npm ci")
    children = []
    try:
        if healthy(args.api_port):
            print(f"Reusing the compatible API at 127.0.0.1:{args.api_port}", flush=True)
        elif not free(args.api_port):
            parser.error("API port belongs to another service; choose --api-port.")
        else:
            child = subprocess.Popen([sys.executable, "-m", "uvicorn", "tads_flood.api:app",
                "--app-dir", "services/api/src", "--host", "127.0.0.1", "--port", str(args.api_port)], cwd=ROOT, start_new_session=True)
            children.append(child)
            deadline = time.monotonic() + 20
            while not healthy(args.api_port):
                if child.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError("API did not start. Install the backend lockfile and editable package.")
                time.sleep(.25)
        web_environment = dict(os.environ)
        for key in ["CDSE_CLIENT_ID", "CDSE_CLIENT_SECRET", "OHSOME_API_KEY", "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL", "TADS_DATA_ROOT"]:
            web_environment.pop(key, None)
        web_environment["VITE_API_BASE_URL"] = f"http://127.0.0.1:{args.api_port}"
        children.append(subprocess.Popen(["npm", "run", "dev", "--", "--host", "127.0.0.1",
            "--port", str(args.web_port), "--strictPort"], cwd=ROOT / "apps/web", env=web_environment, start_new_session=True))
        print(f"Workspace: http://127.0.0.1:{args.web_port}. Ctrl-C stops owned processes.", flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(.5)
        raise RuntimeError("A workspace process stopped; inspect its output.")
    except KeyboardInterrupt:
        return 0
    except (RuntimeError, FileNotFoundError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        for child in children:
            if child.poll() is None:
                if os.name == "posix":
                    os.killpg(child.pid, signal.SIGTERM)
                else:
                    child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                if os.name == "posix":
                    os.killpg(child.pid, signal.SIGKILL)
                else:
                    child.kill()
                child.wait()


if __name__ == "__main__":
    raise SystemExit(main())
