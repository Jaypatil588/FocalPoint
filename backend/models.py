from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class GazeEvent(StrictModel):
    zone: str = Field(min_length=1, max_length=160)
    visits: int = Field(ge=0, le=100000, strict=True)
    flag: Literal["smooth", "confusion", "skipped", "skim"]


class FeedbackRequest(StrictModel):
    user_id: str = Field(min_length=1, max_length=100)
    session_id: str = Field(min_length=1, max_length=100)
    request_id: str = Field(min_length=8, max_length=100)
    previous_response_id: str | None = None
    gaze_events: list[GazeEvent] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def validate_feedback(self):
        if self.gaze_events and not self.previous_response_id:
            raise ValueError("gaze feedback requires previous_response_id")
        zones = [event.zone for event in self.gaze_events]
        if len(zones) != len(set(zones)):
            raise ValueError("duplicate gaze zones")
        if any(not zone.startswith(f"{self.previous_response_id}:") for zone in zones):
            raise ValueError("gaze zones must be scoped to previous_response_id")
        return self


class ChatRequest(FeedbackRequest):
    message: str = Field(min_length=1, max_length=20000)

    @field_validator("message")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("message cannot be blank")
        return value


class SessionEndRequest(FeedbackRequest):
    pass


class UserProfileOut(StrictModel):
    complexity_score: int = Field(ge=1, le=10, strict=True)
    preferred_format: Literal["prose", "bullets"]


class SaveProfileRequest(StrictModel):
    user_id: str
    profile: UserProfileOut


class HistoryMessage(StrictModel):
    role: Literal["user", "assistant"]
    content: str
    message_id: str


class PromptPolicy(StrictModel):
    base_instructions: list[str]
    adaptive_instructions: list[str] = Field(default_factory=list, max_length=4)

    @field_validator("adaptive_instructions")
    @classmethod
    def bounded_instructions(cls, value):
        if any(not line.strip() or len(line) > 400 for line in value):
            raise ValueError("each instruction must contain 1..400 characters")
        return value


class RewardPolicy(StrictModel):
    flag_scores: dict[Literal["smooth", "confusion", "skipped", "skim"], float]

    @field_validator("flag_scores")
    @classmethod
    def require_all_flags(cls, value):
        if set(value) != {"smooth", "confusion", "skipped", "skim"}:
            raise ValueError("exactly four reward flags required")
        if any(not -1 <= score <= 1 for score in value.values()):
            raise ValueError("reward scores must be finite and between -1 and 1")
        return value


class ProfileUpdatePolicy(StrictModel):
    positive_complexity_delta: int = Field(ge=1, le=2, strict=True)
    negative_complexity_delta: int = Field(ge=-2, le=-1, strict=True)
    max_topics_to_simplify: int = Field(ge=1, le=10)
    reading_length_ema_alpha: float = Field(gt=0, le=1)


class ContextPolicy(StrictModel):
    max_history_messages: int = Field(ge=2, le=30, strict=True)
    max_memories: int = Field(ge=0, le=10, strict=True)
    max_input_tokens: int = Field(ge=2000, le=20000, strict=True)


class AdaptationPolicy(StrictModel):
    policy_id: str
    user_id: str
    parent_policy_id: str | None
    created_at: str
    created_by: Literal["system", "meta_agent"]
    rationale: str
    evidence_episode_ids: list[str] = Field(default_factory=list)
    prompt: PromptPolicy
    reward: RewardPolicy
    profile_update: ProfileUpdatePolicy
    context: ContextPolicy


class PolicyProposal(StrictModel):
    rationale: str = Field(min_length=20, max_length=1200)
    adaptive_instructions: list[str] = Field(min_length=1, max_length=4)
    reward: RewardPolicy
    profile_update: ProfileUpdatePolicy
    context: ContextPolicy


class MemoryReference(StrictModel):
    memory_id: str
    key: str
    content: str
    confidence: float = Field(ge=0, le=1)
    evidence_count: int = Field(ge=1)
    episode_ids: list[str]
    topic: str | None
    created_at: str
    updated_at: str


class ContextPacket(StrictModel):
    history: list[HistoryMessage]
    memories: list[MemoryReference]
    system_prompt: str
    query: str
    estimated_input_tokens: int
    token_budget: int
    omitted_messages: int


class ModelResult(StrictModel):
    text: str
    provider: str
    model: str
    temperature: float
    max_output_tokens: int
    input_tokens: int
    output_tokens: int


class RunSpan(StrictModel):
    name: str
    status: Literal["running", "completed", "failed"]
    started_at: str
    input: dict
    output: dict
    duration_ms: float = Field(default=0, ge=0)
    error: str | None = None


class ChatResponse(StrictModel):
    response_id: str
    text: str
    reward: float | None
    user_profile: UserProfileOut
    system_prompt: str
    policy_id: str
    trace: dict


class Grades(StrictModel):
    correctness: float = Field(ge=0, le=10, strict=True)
    clarity: float = Field(ge=0, le=10, strict=True)
    adaptation: float = Field(ge=0, le=10, strict=True)


class Judgement(StrictModel):
    response_a: Grades
    response_b: Grades
    reason: str = Field(min_length=1, max_length=2000)
