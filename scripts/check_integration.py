"""Run browser checks against a fresh, credential-free local API, never a mock."""
import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.request import urlopen
import json

ROOT = Path(__file__).resolve().parents[1]
CREDENTIALS = ("CDSE_CLIENT_ID", "CDSE_CLIENT_SECRET", "OHSOME_API_KEY",
               "LLM_API_KEY", "LLM_MODEL", "LLM_BASE_URL")


def healthy(port):
    try:
        with urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
            value = json.load(response)
        return value == {"status": "ok", "schema_version": "1.0.0"}
    except (OSError, ValueError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all-browser", action="store_true", help="Include recorded/fixture browser flows")
    parser.add_argument("--hosted-replay", action="store_true", help="Check the read-only Vercel handler through local HTTP")
    args = parser.parse_args()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    environment = dict(os.environ)
    # Empty values prevent load_dotenv(override=False) from reading operator keys.
    environment.update({key: "" for key in CREDENTIALS})
    environment["LLM_PROVIDER"] = "openai"
    with TemporaryDirectory(prefix="tads-integration-") as temporary:
        environment["TADS_DATA_ROOT"] = temporary
        with open(Path(temporary) / "api.log", "w+") as log:
            command = ["node", "scripts/serve_hosted_replay.mjs", str(port)] if args.hosted_replay else [sys.executable, "-m", "uvicorn", "tads_flood.api:app",
                "--app-dir", "services/api/src", "--host", "127.0.0.1", "--port", str(port),
                "--no-access-log"]
            api = subprocess.Popen(command, cwd=ROOT, env=environment, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 20
                while not healthy(port):
                    if api.poll() is not None or time.monotonic() > deadline:
                        log.seek(0)
                        print(log.read(), file=sys.stderr)
                        raise RuntimeError("Integration API failed to start")
                    time.sleep(.1)
                profile = "hosted synthetic replay" if args.hosted_replay else "fresh Python API with synthetic inputs"
                print(f"Required browser flow: {profile}, no credentials or interception.", flush=True)
                environment.update({"CI": "true", "REQUIRE_LOCAL_API": "1",
                                    "VITE_API_BASE_URL": f"http://127.0.0.1:{port}"})
                command = ["npm", "run", "test:e2e"]
                if not args.all_browser:
                    command += ["--", "api-live.spec.ts"]
                return subprocess.run(command, cwd=ROOT / "apps/web", env=environment).returncode
            finally:
                if api.poll() is None:
                    api.terminate()
                    try:
                        api.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        api.kill()
                        api.wait()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, FileNotFoundError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
