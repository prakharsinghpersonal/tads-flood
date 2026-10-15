import json

import httpx
import pytest

from tads_flood.api import demo
from tads_flood.copilot import generate_answer, FactSelection, render_selection, deterministic_bilingual_report
from tads_flood.errors import PipelineError
from tads_flood.reports import render_brief
from tads_flood.settings import Settings


def settings():
    return Settings(llm_api_key="test-api-key", llm_model="test-model", llm_base_url="https://model.example/v1")


def model_client(content, finish_reason="stop", refusal=None):
    def handler(request):
        return httpx.Response(200, json={"choices": [{"finish_reason": finish_reason,
            "message": {"content": json.dumps(content), "refusal": refusal}}]})
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_model_selects_facts_but_does_not_supply_numbers_or_citations():
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {
            "content": json.dumps({"fact_ids": ["summary/potentially_isolated"], "refused": False})}}]})
    result = generate_answer(demo(), "Which settlements may be cut off?", "en", settings(),
                             client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert result["generator"] == "llm_fact_selection"
    assert result["answer"].startswith("1 mapped settlement may be isolated")
    assert result["claims"][0]["evidence_ids"] == ["synthetic-exposure-001"]
    assert captured[0]["response_format"]["json_schema"]["strict"] is True


@pytest.mark.parametrize("content", [
    {"fact_ids": ["invented/999"], "refused": False},
    {"fact_ids": ["summary/potentially_isolated"] * 2, "refused": False},
    {"fact_ids": [], "refused": False},
    {"fact_ids": ["summary/potentially_isolated"], "refused": False, "deaths": 999},
])
def test_hallucinated_duplicate_empty_or_extra_claim_output_rejected(content):
    with pytest.raises(PipelineError):
        generate_answer(demo(), "Summarize the assessment", "en", settings(), client=model_client(content))


def test_incomplete_model_output_not_published():
    with pytest.raises(PipelineError, match="finish"):
        generate_answer(demo(), "Summarize", "en", settings(),
                        client=model_client({"fact_ids": [], "refused": True}, "length"))


def test_refusal_and_unsupported_casualty_request():
    refused = generate_answer(demo(), "How many deaths?", "en", Settings())
    assert refused["refused"] and not refused["ai_ready"]
    model_refusal = generate_answer(demo(), "Unrelated question", "en", settings(),
                                    client=model_client({}, refusal="refused"))
    assert model_refusal["refused"] and not model_refusal["claims"]


def test_nepali_and_english_use_same_numeric_facts_and_citations():
    english = deterministic_bilingual_report(demo(), "en")
    nepali = deterministic_bilingual_report(demo(), "ne")
    assert english["facts"] == nepali["facts"]
    assert [c["evidence_ids"] for c in english["claims"]] == [c["evidence_ids"] for c in nepali["claims"]]
    assert nepali["translation_reviewed"] is False
    assert nepali["generator"] == "deterministic_template"


def test_missing_model_credentials_is_explicit():
    with pytest.raises(PipelineError, match="Configure"):
        generate_answer(demo(), "Summarize", "en", Settings())


def test_printable_brief_escapes_external_labels():
    assessment = demo()
    original = assessment.sources[0].source_id
    assessment.sources[0].source_id = "<script>alert(1)</script>"
    assessment.evidence[0].source_ids = [assessment.sources[0].source_id]
    html = render_brief(assessment, deterministic_bilingual_report(assessment, "en"))
    assert "<script>" not in html
    assert "&lt;script&gt;" in html
    assert "SYNTHETIC TRAINING SCENE" in html


def test_key_free_local_ollama_uses_schema_and_the_same_grounding_gate():
    captured = []
    def handler(request):
        captured.append(request)
        return httpx.Response(200, json={"done": True, "done_reason": "stop", "message": {
            "content": json.dumps({"fact_ids": ["summary/potentially_isolated"], "refused": False})}})
    local = Settings(llm_provider="ollama", llm_model="installed-model", llm_base_url="http://127.0.0.1:11434")
    assert local.ai_ready
    answer = generate_answer(demo(), "Which settlements may be isolated?", "ne", local,
        client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert str(captured[0].url) == "http://127.0.0.1:11434/api/chat"
    assert "Authorization" not in captured[0].headers
    body = json.loads(captured[0].content)
    assert body["stream"] is False and body["format"]["additionalProperties"] is False
    assert answer["generator"] == "llm_fact_selection" and answer["translation_reviewed"] is False
    assert answer["facts"] == demo().summary.model_dump()


@pytest.mark.parametrize("origin", ["http://model.example", "http://localhost:11434", "http://127.0.0.1:11434/v1",
                                   "http://127.0.0.1:11434?key=secret", "http://user:password@127.0.0.1:11434"])
def test_local_model_configuration_cannot_fetch_non_loopback_origins(origin):
    local = Settings(llm_provider="ollama", llm_model="model", llm_base_url=origin)
    with pytest.raises(PipelineError, match="loopback"):
        generate_answer(demo(), "Summarize", "en", local)


@pytest.mark.parametrize("response", [
    {"done": False, "done_reason": "stop", "message": {"content": "{}"}},
    {"done": True, "done_reason": "length", "message": {"content": "{}"}},
    {"done": True, "done_reason": "stop", "message": {"content": '{"fact_ids":["invented"],"refused":false}'}},
])
def test_local_model_incomplete_and_unsupported_facts_are_rejected(response):
    local = Settings(llm_provider="ollama", llm_model="model", llm_base_url="http://127.0.0.1:11434")
    with pytest.raises(PipelineError):
        generate_answer(demo(), "Summarize", "en", local,
                        client=httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=response))))
