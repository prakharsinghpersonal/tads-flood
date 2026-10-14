"""Content-addressed immutable raw cache; tampering is an explicit failure."""
import hashlib
import json
from pathlib import Path
from uuid import uuid4

from .errors import PipelineError


class ContentCache:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, payload: bytes, metadata: dict):
        digest = hashlib.sha256(payload).hexdigest()
        destination = self.root / digest
        destination.mkdir(exist_ok=True)
        data_path = destination / "data.bin"
        if data_path.exists() and hashlib.sha256(data_path.read_bytes()).hexdigest() != digest:
            raise PipelineError("cache_integrity_error", "Cached source hash does not match its content.")
        if not data_path.exists():
            temp = destination / (uuid4().hex + ".tmp")
            temp.write_bytes(payload)
            temp.replace(data_path)
        manifest = {**metadata, "sha256": digest}
        # A content hash can legitimately have multiple retrieval manifests.
        manifest_hash = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
        temp_manifest = destination / (uuid4().hex + ".tmp")
        temp_manifest.write_text(json.dumps(manifest, indent=2) + "\n")
        temp_manifest.replace(destination / f"manifest-{manifest_hash}.json")
        return digest

    def metadata(self, digest, source_id):
        self.get(digest)
        records = []
        for path in sorted((self.root / digest).glob("manifest-*.json")):
            raw = path.read_bytes()
            try:
                manifest = json.loads(raw)
                identifier = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()
                if path.name != f"manifest-{identifier}.json" or manifest.get("sha256") != digest:
                    raise ValueError("Manifest checksum mismatch")
                if manifest.get("source_id") == source_id:
                    records.append(manifest)
            except (ValueError, TypeError) as exc:
                raise PipelineError("cache_integrity_error", "Cached source manifest failed its integrity check.") from exc
        return records

    def get(self, digest):
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise PipelineError("invalid_cache_id", "Invalid cache content identifier.")
        path = self.root / digest / "data.bin"
        if not path.exists():
            raise PipelineError("cache_missing", "Cached source is unavailable.")
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != digest:
            raise PipelineError("cache_integrity_error", "Cached source hash does not match its content.")
        return payload
