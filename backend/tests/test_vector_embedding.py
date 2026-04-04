"""
Unit tests for VectorEmbeddingService.

All Neo4j and litellm calls are mocked — no live credentials needed.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client(query_rows=None, write_ok=True):
    """Return a mock Neo4jClient."""
    client = MagicMock()
    client.run_query = AsyncMock(return_value=query_rows or [])
    client.run_write = AsyncMock(return_value=None)
    return client


def _fake_embedding_response(n: int, dims: int = 4):
    """Build a minimal litellm-style embedding response with n vectors of size dims."""
    data = [{"embedding": [0.1] * dims, "index": i} for i in range(n)]
    resp = MagicMock()
    resp.data = data
    return resp


# ---------------------------------------------------------------------------
# Import service under test (after mocking litellm at module level)
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def patch_litellm():
    """Patch litellm.aembedding globally for every test in this module."""
    with patch("services.vector_embedding.aembedding", new_callable=AsyncMock) as mock_aemb:
        mock_aemb.return_value = _fake_embedding_response(1)
        yield mock_aemb


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------

def test_service_disabled_when_env_false(monkeypatch):
    monkeypatch.setenv("SEMANTIC_MATCH_ENABLED", "false")
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    assert svc._enabled is False


def test_service_enabled_by_default(monkeypatch):
    monkeypatch.setenv("SEMANTIC_MATCH_ENABLED", "true")
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    assert svc._enabled is True


def test_resolve_embedding_model_explicit(monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "openai/text-embedding-3-small")
    monkeypatch.delenv("LLM_MODEL", raising=False)
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    assert svc._embedding_model == "openai/text-embedding-3-small"


def test_resolve_embedding_model_from_llm_model(monkeypatch):
    monkeypatch.delenv("EMBEDDING_MODEL", raising=False)
    monkeypatch.setenv("LLM_MODEL", "gemini/gemini-2.0-flash")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    assert svc._embedding_model == "gemini/gemini-embedding-001"


# ---------------------------------------------------------------------------
# Text builders
# ---------------------------------------------------------------------------

def test_build_skill_text_minimal(monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    row = {"name": "Python", "family": "Programming Languages",
           "context": None, "years": None, "level": None, "evidence": None,
           "project_usages": [], "domains": []}
    text = svc._build_skill_text(row)
    assert "skill: Python" in text
    assert "family: Programming Languages" in text


def test_build_skill_text_with_project(monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    row = {
        "name": "FastAPI", "family": "Web Frameworks",
        "context": "Used in production API serving 10k req/s",
        "years": 3, "level": "senior", "evidence": "project_backed",
        "project_usages": [{"project": "MyApp", "what": "REST API", "how": "FastAPI", "outcome": "50% latency cut"}],
        "domains": ["FinTech"],
    }
    text = svc._build_skill_text(row)
    assert "Used in production API" in text
    assert "project: MyApp" in text
    assert "domains: FinTech" in text


def test_build_domain_text_with_description(monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    row = {
        "name": "FinTech", "family": "Finance",
        "description": "Payment systems and PCI-DSS compliance",
        "years": 5, "depth": "deep",
        "projects": [{"name": "PayMe", "description": "Mobile payments app"}],
    }
    text = svc._build_domain_text(row)
    assert "domain: FinTech" in text
    assert "Payment systems" in text
    assert "project: PayMe" in text


def test_build_job_skill_text(monkeypatch):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    row = {
        "name": "Kubernetes", "family": "DevOps",
        "context": "Must manage multi-region clusters",
        "importance": "must_have", "min_years": 2,
        "job_title": "SRE", "company": "Acme",
        "job_domains": ["Cloud Infrastructure"],
    }
    text = svc._build_job_skill_text(row)
    assert "skill: Kubernetes" in text
    assert "Must manage multi-region clusters" in text
    assert "job: SRE at Acme" in text


# ---------------------------------------------------------------------------
# Embed and store (mocked pipeline)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_embed_user_skills_returns_count(monkeypatch, patch_litellm):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    monkeypatch.setenv("SEMANTIC_MATCH_ENABLED", "true")
    from services.vector_embedding import VectorEmbeddingService

    rows = [
        {"node_id": "4:abc:1", "name": "Python", "family": "PL",
         "context": None, "years": 2, "level": "mid", "evidence": "project_backed",
         "project_usages": [], "domains": []},
    ]
    patch_litellm.return_value = _fake_embedding_response(1)
    client = _make_client(query_rows=rows)
    svc = VectorEmbeddingService(client)
    count = await svc.embed_user_skills("u1")
    assert count == 1
    client.run_write.assert_called_once()


@pytest.mark.asyncio
async def test_embed_user_skills_disabled_returns_zero(monkeypatch):
    monkeypatch.setenv("SEMANTIC_MATCH_ENABLED", "false")
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    from services.vector_embedding import VectorEmbeddingService
    svc = VectorEmbeddingService(_make_client())
    count = await svc.embed_user_skills("u1")
    assert count == 0


@pytest.mark.asyncio
async def test_embed_empty_nodes_returns_zero(monkeypatch, patch_litellm):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    monkeypatch.setenv("SEMANTIC_MATCH_ENABLED", "true")
    from services.vector_embedding import VectorEmbeddingService
    client = _make_client(query_rows=[])
    svc = VectorEmbeddingService(client)
    count = await svc.embed_user_skills("u1")
    assert count == 0
    patch_litellm.assert_not_called()


@pytest.mark.asyncio
async def test_reembed_user_returns_dict(monkeypatch, patch_litellm):
    monkeypatch.setenv("EMBEDDING_MODEL", "gemini/gemini-embedding-001")
    monkeypatch.setenv("SEMANTIC_MATCH_ENABLED", "true")
    from services.vector_embedding import VectorEmbeddingService

    skill_row = {"node_id": "4:abc:1", "name": "Go", "family": "PL",
                 "context": None, "years": 1, "level": "junior", "evidence": None,
                 "project_usages": [], "domains": []}
    domain_row = {"node_id": "4:abc:2", "name": "FinTech", "family": "Finance",
                  "description": None, "years": 2, "depth": "moderate",
                  "projects": []}

    call_count = [0]

    async def fake_run_query(cypher, params=None):
        call_count[0] += 1
        if "Skill" in cypher:
            return [skill_row]
        if "Domain" in cypher:
            return [domain_row]
        return []

    patch_litellm.return_value = _fake_embedding_response(1)
    client = _make_client()
    client.run_query = fake_run_query
    svc = VectorEmbeddingService(client)
    result = await svc.reembed_user("u1")
    assert result["skills_embedded"] == 1
    assert result["domains_embedded"] == 1
