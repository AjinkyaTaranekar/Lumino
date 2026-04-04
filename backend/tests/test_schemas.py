import pytest
from models.schemas import (
    ExtractedSkill, ExtractedDomain,
    ExtractedJobSkillRequirement, ExtractedJobDomainRequirement,
)


def test_extracted_skill_has_context_field():
    skill = ExtractedSkill(name="Python", family="Programming Languages")
    assert skill.context is None


def test_extracted_skill_context_accepts_string():
    skill = ExtractedSkill(
        name="Python",
        family="Programming Languages",
        context="Used for production ML pipelines serving 1M daily predictions.",
    )
    assert skill.context == "Used for production ML pipelines serving 1M daily predictions."


def test_extracted_domain_has_description_field():
    domain = ExtractedDomain(name="FinTech", family="FinTech")
    assert domain.description is None


def test_extracted_domain_description_accepts_string():
    domain = ExtractedDomain(
        name="FinTech",
        family="FinTech",
        description="Deep expertise in payment systems and PCI-DSS compliance.",
    )
    assert domain.description == "Deep expertise in payment systems and PCI-DSS compliance."


def test_extracted_job_skill_req_has_context_field():
    req = ExtractedJobSkillRequirement(name="Python", family="Programming Languages")
    assert req.context is None


def test_extracted_job_domain_req_has_importance_and_depth():
    req = ExtractedJobDomainRequirement(name="FinTech", family="FinTech")
    assert req.importance == "must_have"
    assert req.depth is None


def test_extracted_job_domain_req_importance_optional():
    req = ExtractedJobDomainRequirement(
        name="FinTech", family="FinTech", importance="optional", depth="deep"
    )
    assert req.importance == "optional"
    assert req.depth == "deep"
