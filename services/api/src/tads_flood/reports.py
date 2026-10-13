"""Deterministic facts boundary. This fallback is explicitly not an AI copilot."""
from .models import Assessment


def build_report(assessment: Assessment):
    facts = {
        "potentially_isolated_count": assessment.summary.potentially_isolated_count,
        "unknown_network_count": assessment.summary.unknown_network_count,
    }
    claims = [{"claim_id": s.settlement_id, "text": s.reason,
               "evidence_ids": s.evidence_ids} for s in assessment.settlements]
    return {"assessment_id": assessment.assessment_id, "mode": assessment.mode,
            "generator": "deterministic_template", "ai_ready": False, "language": "en",
            "facts": facts, "claims": claims, "limitations": assessment.limitations}

