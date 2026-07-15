from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WorkProjectWorkItemPhase(StrEnum):
    SCOPE_REVIEW = "scope_review"
    RECONNAISSANCE = "reconnaissance"
    ENUMERATION = "enumeration"
    ASSESSMENT = "assessment"
    VALIDATION = "validation"
    EXPLOITATION = "exploitation"
    POST_EXPLOITATION = "post_exploitation"
    CODE_REVIEW = "code_review"
    REVERSE_ENGINEERING = "reverse_engineering"
    CRYPTOGRAPHY_REVIEW = "cryptography_review"
    REPORTING = "reporting"


class WorkProjectWorkItemStatus(StrEnum):
    QUEUED = "queued"
    ACTIVE = "active"
    BLOCKED = "blocked"
    REVIEW = "review"
    COMPLETED = "completed"
    CANCELED = "canceled"


class WorkProjectWorkItemPriority(StrEnum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class WorkProjectTargetStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    COVERED = "covered"
    BLOCKED = "blocked"
    DEFERRED = "deferred"


class WorkProjectWorkLogKind(StrEnum):
    STATE_CHANGE = "state_change"
    PLAN_CHANGE = "plan_change"
    DECISION = "decision"
    BLOCKER = "blocker"
    HANDOFF = "handoff"
    RESULT = "result"


class WorkProjectReviewDecision(StrEnum):
    ACCEPT = "accept"
    REQUEST_CHANGES = "request_changes"


class WorkProjectWorkItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    parent_id: int | None = None
    title: str
    phase: WorkProjectWorkItemPhase
    status: WorkProjectWorkItemStatus
    priority: WorkProjectWorkItemPriority
    assignee_agent_code: str
    objective: str
    execution_scope: str
    completion_criteria: str
    result_summary: str
    blocker_reason: str
    focus_relation_id: int | None = None
    focus_finding_id: int | None = None
    focus_attack_path_id: int | None = None
    focus_attack_path_step_id: int | None = None
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime
    updated_at: datetime


class WorkProjectWorkItemTargetSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    work_item_id: int
    asset_id: int
    surface: str
    status: WorkProjectTargetStatus
    conclusion: str
    deferral_reason: str
    updated_at: datetime


class WorkProjectWorkLogSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    work_item_id: int
    kind: WorkProjectWorkLogKind
    content: str
    created_by_agent_code: str
    created_from_session_id: str
    created_at: datetime


class WorkProjectWorkItemTargetKey(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: int = Field(gt=0)
    surface: str = Field(min_length=1, max_length=500)

    @field_validator("surface", mode="before")
    @classmethod
    def normalize_surface(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class WorkProjectWorkItemTargetUpdateRequest(WorkProjectWorkItemTargetKey):
    status: WorkProjectTargetStatus
    conclusion: str = Field(default="", max_length=4000)
    deferral_reason: str = Field(default="", max_length=2000)

    @field_validator("conclusion", "deferral_reason", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_terminal_detail(self) -> "WorkProjectWorkItemTargetUpdateRequest":
        if self.status not in {
            WorkProjectTargetStatus.ACTIVE,
            WorkProjectTargetStatus.COVERED,
            WorkProjectTargetStatus.DEFERRED,
        }:
            raise ValueError("target updates support active, covered, or deferred; use the WorkItem commands for pending or blocked")
        if self.status == WorkProjectTargetStatus.COVERED and not self.conclusion:
            raise ValueError("covered target requires a conclusion")
        if self.status == WorkProjectTargetStatus.DEFERRED and not self.deferral_reason:
            raise ValueError("deferred target requires a deferral reason")
        if self.status != WorkProjectTargetStatus.COVERED and self.conclusion:
            raise ValueError("conclusion is only valid for a covered target")
        if self.status != WorkProjectTargetStatus.DEFERRED and self.deferral_reason:
            raise ValueError("deferral_reason is only valid for a deferred target")
        return self


class WorkProjectWorkItemPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_id: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=1, max_length=255)
    phase: WorkProjectWorkItemPhase
    priority: WorkProjectWorkItemPriority = WorkProjectWorkItemPriority.NORMAL
    assignee_agent_code: str = Field(min_length=1, max_length=32)
    objective: str = Field(min_length=1, max_length=4000)
    execution_scope: str = Field(min_length=1, max_length=4000)
    completion_criteria: str = Field(min_length=1, max_length=4000)
    focus_relation_id: int | None = Field(default=None, gt=0)
    focus_finding_id: int | None = Field(default=None, gt=0)
    focus_attack_path_id: int | None = Field(default=None, gt=0)
    focus_attack_path_step_id: int | None = Field(default=None, gt=0)
    dependency_ids: list[int] = Field(default_factory=list, max_length=100)
    targets: list[WorkProjectWorkItemTargetKey] = Field(min_length=1, max_length=500)

    @field_validator(
        "title", "assignee_agent_code", "objective", "execution_scope",
        "completion_criteria", mode="before",
    )
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_plan(self) -> "WorkProjectWorkItemPlanRequest":
        focus_count = sum(value is not None for value in (
            self.focus_relation_id, self.focus_finding_id,
            self.focus_attack_path_id, self.focus_attack_path_step_id,
        ))
        if focus_count > 1:
            raise ValueError("work item can have at most one focus record")
        self.dependency_ids = list(dict.fromkeys(self.dependency_ids))
        target_keys = [(target.asset_id, target.surface) for target in self.targets]
        if len(target_keys) != len(set(target_keys)):
            raise ValueError("work item contains a duplicate asset surface target")
        return self


class WorkProjectWorkLogRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: WorkProjectWorkLogKind
    content: str = Field(min_length=1, max_length=8000)

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value
