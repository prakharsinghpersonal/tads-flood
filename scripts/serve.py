"""One persistent API process for a container/VM; not a serverless job worker."""
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    if not 1 <= port <= 65535:
        raise ValueError("Invalid PORT")
    uvicorn.run("tads_flood.api:app", host="0.0.0.0", port=port, workers=1)
