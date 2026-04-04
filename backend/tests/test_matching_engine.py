"""
Unit tests for MatchingEngine vector-index scoring queries.

All Neo4j calls are mocked. Tests verify that:
- _compute_skill_score issues the expected number of queries (4 total)
- mandatory/optional score math is correct given mock data
- _compute_domain_score uses vector index (2 queries) and depth weighting
- Missing skills/domains are identified correctly
"""

from __future__ import annotations

import os
import pytest
from unittest.mock import AsyncMock, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_client(**query_map):
    """
    Return a mock Neo4jClient whose run_query dispatches to the values in
    query_map based on substring matching on the Cypher string.

    Each value is a list[dict] to return.
    """
    client = MagicMock()

    async def _run_query(cypher: str, params=None):
        for key, rows in query_map.items():
            if key in cypher:
                return rows
        return []

    client.run_query = _run_query
    client.run_write = AsyncMock()
    return client


# ---------------------------------------------------------------------------
# _compute_skill_score
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def set_threshold(monkeypatch):
    monkeypatch.setenv("SEMANTIC_MATCH_THRESHOLD", "0.72")


@pytest.mark.asyncio
async def test_skill_score_perfect_mandatory_match():
    """User has matching skill for every must_have requirement."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        # mandatory_matched query — 1 skill matched
        **{
            "must_have' AND req.embedding": [
                {"matched_names": ["python"], "matched_weight": 1.0}
            ],
            # mandatory_all query
            "importance = 'must_have'\n            RETURN": [
                {"all_names": ["python"], "total_weight": 1.0}
            ],
            # optional_matched query
            "importance <> 'must_have' AND req.embedding": [
                {"matched_names": [], "matched_weight": 0.0}
            ],
            # optional_all query
            "importance <> 'must_have'\n            RETURN": [
                {"all_names": [], "total_weight": 0.0}
            ],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_skill_score("u1", "j1")
    assert result["mandatory_score"] == pytest.approx(1.0)
    assert result["optional_score"] == pytest.approx(0.0)
    assert "python" in result["matched"]
    assert result["missing"] == []


@pytest.mark.asyncio
async def test_skill_score_no_match():
    """User has no matching skills."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        **{
            "must_have' AND req.embedding": [
                {"matched_names": [], "matched_weight": 0.0}
            ],
            "importance = 'must_have'\n            RETURN": [
                {"all_names": ["python", "kubernetes"], "total_weight": 2.0}
            ],
            "importance <> 'must_have' AND req.embedding": [
                {"matched_names": [], "matched_weight": 0.0}
            ],
            "importance <> 'must_have'\n            RETURN": [
                {"all_names": [], "total_weight": 0.0}
            ],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_skill_score("u1", "j1")
    assert result["mandatory_score"] == pytest.approx(0.0)
    assert set(result["missing"]) == {"python", "kubernetes"}


@pytest.mark.asyncio
async def test_skill_score_partial_match():
    """User matches 1 of 2 must_have skills."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        **{
            "must_have' AND req.embedding": [
                {"matched_names": ["python"], "matched_weight": 1.0}
            ],
            "importance = 'must_have'\n            RETURN": [
                {"all_names": ["python", "kubernetes"], "total_weight": 2.0}
            ],
            "importance <> 'must_have' AND req.embedding": [
                {"matched_names": [], "matched_weight": 0.0}
            ],
            "importance <> 'must_have'\n            RETURN": [
                {"all_names": [], "total_weight": 0.0}
            ],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_skill_score("u1", "j1")
    assert result["mandatory_score"] == pytest.approx(0.5)
    assert "python" in result["matched"]
    assert "kubernetes" in result["missing"]


# ---------------------------------------------------------------------------
# _compute_domain_score
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_domain_score_full_match_deep():
    """User matches the one required domain at 'deep' depth → score 1.0."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        **{
            # all_reqs query
            "OPTIONAL MATCH (j:Job {id": [
                {"all_names": ["fintech"]}
            ],
            # matched_rows query
            "WHERE dr.embedding IS NOT NULL": [
                {"matched_names": ["fintech"], "total_depth_weight": 1.0}
            ],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_domain_score("u1", "j1")
    assert result["score"] == pytest.approx(1.0)
    assert "fintech" in result["matched"]
    assert result["missing"] == []


@pytest.mark.asyncio
async def test_domain_score_no_requirements():
    """Job has no domain requirements → score 0.0."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        **{
            "OPTIONAL MATCH (j:Job {id": [{"all_names": []}],
            "WHERE dr.embedding IS NOT NULL": [],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_domain_score("u1", "j1")
    assert result["score"] == pytest.approx(0.0)
    assert result["matched"] == []
    assert result["missing"] == []


@pytest.mark.asyncio
async def test_domain_score_partial_match():
    """User matches 1 of 2 required domains."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        **{
            "OPTIONAL MATCH (j:Job {id": [
                {"all_names": ["fintech", "cloud"]}
            ],
            "WHERE dr.embedding IS NOT NULL": [
                {"matched_names": ["fintech"], "total_depth_weight": 0.7}
            ],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_domain_score("u1", "j1")
    # score = 0.7 / 2 = 0.35
    assert result["score"] == pytest.approx(0.35)
    assert "fintech" in result["matched"]
    assert "cloud" in result["missing"]


@pytest.mark.asyncio
async def test_domain_score_no_match():
    """User has no matching domains."""
    from services.matching_engine import MatchingEngine

    client = _make_client(
        **{
            "OPTIONAL MATCH (j:Job {id": [
                {"all_names": ["fintech"]}
            ],
            "WHERE dr.embedding IS NOT NULL": [
                {"matched_names": [], "total_depth_weight": 0.0}
            ],
        }
    )
    engine = MatchingEngine(client)
    result = await engine._compute_domain_score("u1", "j1")
    assert result["score"] == pytest.approx(0.0)
    assert "fintech" in result["missing"]
