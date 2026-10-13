"""Generate the shared contract from the actual backend models/routes."""
import json
from pathlib import Path

from tads_flood.api import app
from tads_flood.models import Assessment, IsolationRequest

root = Path(__file__).resolve().parents[1]
for name, document in {"assessment.schema.json": Assessment.model_json_schema(),
                       "isolation-request.schema.json": IsolationRequest.model_json_schema(),
                       "openapi.json": app.openapi()}.items():
    path = root / "contracts" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, indent=2) + "\n")
    print(path.relative_to(root))

