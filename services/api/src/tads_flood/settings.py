"""Operator-only runtime settings; expose readiness booleans, never secrets."""
from dataclasses import dataclass, field
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[4]


@dataclass(frozen=True)
class Settings:
    cdse_client_id: str = field(default="", repr=False)
    cdse_client_secret: str = field(default="", repr=False)
    ohsome_api_key: str = field(default="", repr=False)
    llm_api_key: str = field(default="", repr=False)
    llm_model: str = ""
    llm_base_url: str = ""
    llm_provider: str = "openai"
    data_root: Path = ROOT / "data/cache/runtime"

    @classmethod
    def from_environment(cls):
        load_dotenv(ROOT / ".env", override=False)
        return cls(cdse_client_id=os.getenv("CDSE_CLIENT_ID", ""),
                   cdse_client_secret=os.getenv("CDSE_CLIENT_SECRET", ""),
                   ohsome_api_key=os.getenv("OHSOME_API_KEY", ""),
                   llm_api_key=os.getenv("LLM_API_KEY", ""),
                   llm_model=os.getenv("LLM_MODEL", ""),
                   llm_base_url=os.getenv("LLM_BASE_URL", ""),
                   llm_provider=os.getenv("LLM_PROVIDER", "openai"),
                   data_root=Path(os.getenv("TADS_DATA_ROOT", str(ROOT / "data/cache/runtime"))))

    @property
    def live_ready(self):
        return bool(self.cdse_client_id and self.cdse_client_secret and self.ohsome_api_key)

    @property
    def ai_ready(self):
        if self.llm_provider == "ollama":
            return bool(self.llm_model and self.llm_base_url)
        return bool(self.llm_api_key and self.llm_model and self.llm_base_url)

    def readiness(self):
        return {"satellite_configured": bool(self.cdse_client_id and self.cdse_client_secret),
                "historical_osm_configured": bool(self.ohsome_api_key),
                "ai_configured": self.ai_ready, "live_configured": self.live_ready,
                "note": "Configuration does not establish successful live execution or evaluation."}
