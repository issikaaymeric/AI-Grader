"""Regression tests for the production LLM provider waterfall."""

import pytest

from app.services.scoring import llm_client


def test_provider_models_use_current_supported_families():
    assert "deepseek-flash" == llm_client.DEEPSEEK_MODEL
    assert "openai/gpt-oss-120b" in llm_client.GROQ_MODELS
    assert "openai/gpt-oss-20b" in llm_client.GROQ_MODELS
    assert all("llama-3.3-70b-versatile" != model for model in llm_client.GROQ_MODELS)
    assert all("llama-3.1-8b-instant" != model for model in llm_client.GROQ_MODELS)


def test_call_llm_falls_through_to_groq(monkeypatch):
    def unavailable(*args, **kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(llm_client, "_deepseek_once", unavailable)
    monkeypatch.setattr(llm_client, "_nvidia_once", unavailable)
    monkeypatch.setattr(llm_client, "_mistral_pool", lambda: [])
    monkeypatch.setattr(
        llm_client,
        "_groq_once",
        lambda model, system, user: ('{"summary":"ok"}', "stop"),
    )

    assert llm_client.call_llm("system", "user") == '{"summary":"ok"}'


def test_call_llm_reports_exhausted_active_providers(monkeypatch):
    def unavailable(*args, **kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(llm_client, "_deepseek_once", unavailable)
    monkeypatch.setattr(llm_client, "_nvidia_once", unavailable)
    monkeypatch.setattr(llm_client, "_mistral_pool", lambda: [])
    monkeypatch.setattr(llm_client, "_groq_once", unavailable)

    with pytest.raises(RuntimeError, match="DeepSeek, NVIDIA, Mistral, Groq"):
        llm_client.call_llm("system", "user")



def test_deepseek_tries_second_key_when_first_fails(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "DEEPSEEK_API_KEY", "primary-key")
    monkeypatch.setattr(llm_client.settings, "DEEPSEEK_API_KEY1", "secondary-key")
    attempted = []

    def deepseek_once(api_key, system, user):
        attempted.append(api_key)
        if api_key == "primary-key":
            raise RuntimeError("primary key quota exceeded")
        return ('{"summary":"ok"}', "stop")

    monkeypatch.setattr(llm_client, "_deepseek_once", deepseek_once)
    assert llm_client.call_llm("system", "user") == '{"summary":"ok"}'
    assert attempted == ["primary-key", "secondary-key"]
