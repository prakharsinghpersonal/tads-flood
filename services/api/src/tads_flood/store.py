"""Thread-safe SQLite jobs and validated assessments, without credentials."""
from datetime import datetime, timezone
from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
from uuid import uuid4

from .models import Assessment

TERMINAL = {"completed", "failed", "cancelled"}


class JobStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS assessments (assessment_id TEXT PRIMARY KEY, payload TEXT NOT NULL, assets TEXT NOT NULL)")

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path, timeout=10)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def create(self, request):
        now = datetime.now(timezone.utc).isoformat()
        job = {"job_id": str(uuid4()), "status": "queued", "fraction": 0.0,
               "message": "Queued for data processing", "stage_message": "Queued for data processing",
               "mode": request.mode, "assessment_id": None,
               "error": None, "created_at": now, "updated_at": now,
               "request": request.model_dump(mode="json")}
        with self.connection() as connection:
            connection.execute("INSERT INTO jobs VALUES (?, ?)", (job["job_id"], json.dumps(job)))
        return job

    def get(self, job_id):
        with self.connection() as connection:
            row = connection.execute("SELECT payload FROM jobs WHERE job_id=?", (job_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def update(self, job_id, **changes):
        if "message" in changes:
            changes["stage_message"] = changes["message"]
        with self.connection() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute("SELECT payload FROM jobs WHERE job_id=?", (job_id,)).fetchone()
            if not row:
                return None
            job = json.loads(row[0])
            if job["status"] in TERMINAL:
                return job
            job.update(changes, updated_at=datetime.now(timezone.utc).isoformat())
            connection.execute("UPDATE jobs SET payload=? WHERE job_id=?", (json.dumps(job), job_id))
            return job

    def put_assessment(self, assessment: Assessment, assets):
        assessment = Assessment.model_validate(assessment.model_dump())
        with self.connection() as connection:
            connection.execute("INSERT OR IGNORE INTO assessments VALUES (?, ?, ?)",
                (assessment.assessment_id, assessment.model_dump_json(), json.dumps(assets)))

    def assessment(self, assessment_id):
        with self.connection() as connection:
            row = connection.execute("SELECT payload, assets FROM assessments WHERE assessment_id=?", (assessment_id,)).fetchone()
        if row is None:
            return None
        return Assessment.model_validate_json(row[0]), json.loads(row[1])

    def recover_interrupted(self):
        with self.connection() as connection:
            rows = connection.execute("SELECT job_id, payload FROM jobs").fetchall()
        for job_id, payload in rows:
            job = json.loads(payload)
            if job["status"] not in TERMINAL:
                self.update(job_id, status="failed", error={"code": "server_restarted", "message": "Processing was interrupted; retry explicitly.", "retryable": True})
