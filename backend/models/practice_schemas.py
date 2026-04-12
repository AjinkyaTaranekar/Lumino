"""Pydantic models for the interview practice feature."""

from typing import Annotated, Literal, Optional
from pydantic import BaseModel, Field


class StartPracticeRequest(BaseModel):
    user_id: str
    job_id: str


class StartPracticeResponse(BaseModel):
    session_id: str
    opening_message: str
    interviewer_persona: str
    phase: str
    core_questions_count: int
    job_title: str
    company: str


class PracticeMessageRequest(BaseModel):
    user_id: str
    content: str


class InterviewTurn(BaseModel):
    ai_response: str
    interviewer_persona: str
    phase: str
    phase_changed: bool
    session_complete: bool
    coaching_hint: Optional[str] = None


class CompletePracticeRequest(BaseModel):
    user_id: str


class ScoreBreakdown(BaseModel):
    communication: Annotated[float, Field(ge=0, le=10)]
    technical: Annotated[float, Field(ge=0, le=10)]
    behavioral: Annotated[float, Field(ge=0, le=10)]
    culture: Annotated[float, Field(ge=0, le=10)]
    overall: Annotated[float, Field(ge=0, le=10)]


class PracticeScorecard(BaseModel):
    scores: ScoreBreakdown
    strengths: list[str]
    gaps: list[str]
    recommendation: Literal['strong_yes', 'yes', 'maybe', 'no']


class PracticeMessageHistory(BaseModel):
    role: str
    content: str
    interviewer_persona: Optional[str] = None
    phase: Optional[str] = None


class PracticeHistoryResponse(BaseModel):
    session_id: str
    phase: str
    question_index: int
    core_questions_count: int
    messages: list[PracticeMessageHistory]


class PracticeSessionSummary(BaseModel):
    session_id: str
    job_id: str
    job_title: str
    company: Optional[str] = None
    phase: str
    started_at: str
    last_active: str
    has_scorecard: bool


class UserPracticeSessionsResponse(BaseModel):
    user_id: str
    sessions: list[PracticeSessionSummary]


class RecruiterTwinEvidence(BaseModel):
    source: Literal['practice_session', 'digital_twin', 'job_profile']
    snippet: str
    relevance: str


class StartRecruiterTwinRequest(BaseModel):
    recruiter_id: str
    user_id: str
    job_id: str
    nightmare_mode: bool = False


class StartRecruiterTwinResponse(BaseModel):
    session_id: str
    recruiter_id: str
    user_id: str
    job_id: str
    job_title: str
    company: Optional[str] = None
    candidate_snapshot: str
    opening_message: str
    confidence: Annotated[float, Field(ge=0, le=1)]
    evidence: list[RecruiterTwinEvidence]
    follow_up_question: str
    culture_follow_up_question: str
    next_best_followups: list[str] = []
    nightmare_questions: list[str] = []


class RecruiterTwinMessageRequest(BaseModel):
    recruiter_id: str
    content: str
    nightmare_mode: bool = False


class RecruiterTwinTurnResponse(BaseModel):
    twin_response: str
    confidence: Annotated[float, Field(ge=0, le=1)]
    evidence: list[RecruiterTwinEvidence]
    follow_up_question: str
    culture_follow_up_question: str
    next_best_followups: list[str] = []
    nightmare_questions: list[str] = []


class RecruiterTwinHistoryMessage(BaseModel):
    role: Literal['recruiter', 'twin']
    content: str
    confidence: Optional[float] = None
    evidence: list[RecruiterTwinEvidence] = []
    follow_up_question: Optional[str] = None
    culture_follow_up_question: Optional[str] = None
    next_best_followups: list[str] = []
    nightmare_questions: list[str] = []
    created_at: str


class RecruiterTwinHistoryResponse(BaseModel):
    session_id: str
    recruiter_id: str
    user_id: str
    job_id: str
    nightmare_mode: bool
    messages: list[RecruiterTwinHistoryMessage]
