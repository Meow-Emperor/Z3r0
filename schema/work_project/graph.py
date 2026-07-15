import re
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WorkProjectRelationType(StrEnum):
    CONTAINS = "contains"
    RESOLVES_TO = "resolves_to"
    HOSTS = "hosts"
    EXPOSES = "exposes"
    CONNECTS_TO = "connects_to"
    DEPENDS_ON = "depends_on"
    IMPLEMENTS = "implements"
    AUTHENTICATES_TO = "authenticates_to"
    TRUSTS = "trusts"
    CONTROLS = "controls"
    READS_FROM = "reads_from"
    WRITES_TO = "writes_to"
    DERIVED_FROM = "derived_from"


class WorkProjectRelationCategory(StrEnum):
    STRUCTURAL = "structural"
    CONNECTIVITY = "connectivity"
    DEPENDENCY = "dependency"
    IDENTITY = "identity"
    DATA = "data"
    PROVENANCE = "provenance"


RELATION_TYPE_CATEGORY: dict[WorkProjectRelationType, WorkProjectRelationCategory] = {
    WorkProjectRelationType.CONTAINS: WorkProjectRelationCategory.STRUCTURAL,
    WorkProjectRelationType.RESOLVES_TO: WorkProjectRelationCategory.STRUCTURAL,
    WorkProjectRelationType.HOSTS: WorkProjectRelationCategory.STRUCTURAL,
    WorkProjectRelationType.EXPOSES: WorkProjectRelationCategory.STRUCTURAL,
    WorkProjectRelationType.CONNECTS_TO: WorkProjectRelationCategory.CONNECTIVITY,
    WorkProjectRelationType.DEPENDS_ON: WorkProjectRelationCategory.DEPENDENCY,
    WorkProjectRelationType.IMPLEMENTS: WorkProjectRelationCategory.DEPENDENCY,
    WorkProjectRelationType.AUTHENTICATES_TO: WorkProjectRelationCategory.IDENTITY,
    WorkProjectRelationType.TRUSTS: WorkProjectRelationCategory.IDENTITY,
    WorkProjectRelationType.CONTROLS: WorkProjectRelationCategory.IDENTITY,
    WorkProjectRelationType.READS_FROM: WorkProjectRelationCategory.DATA,
    WorkProjectRelationType.WRITES_TO: WorkProjectRelationCategory.DATA,
    WorkProjectRelationType.DERIVED_FROM: WorkProjectRelationCategory.PROVENANCE,
}


class WorkProjectAssertionStatus(StrEnum):
    HYPOTHESIZED = "hypothesized"
    OBSERVED = "observed"
    VALIDATED = "validated"
    REFUTED = "refuted"


class WorkProjectAttackAction(StrEnum):
    INITIAL_ACCESS = "initial_access"
    EXECUTION = "execution"
    PERSISTENCE = "persistence"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    DEFENSE_EVASION = "defense_evasion"
    CREDENTIAL_ACCESS = "credential_access"
    DISCOVERY = "discovery"
    LATERAL_MOVEMENT = "lateral_movement"
    COLLECTION = "collection"
    COMMAND_AND_CONTROL = "command_and_control"
    EXFILTRATION = "exfiltration"
    IMPACT = "impact"


class WorkProjectAttackStepStatus(StrEnum):
    HYPOTHESIZED = "hypothesized"
    VALIDATING = "validating"
    VALIDATED = "validated"
    BLOCKED = "blocked"
    REFUTED = "refuted"


class WorkProjectAttackPathStatus(StrEnum):
    HYPOTHESIZED = "hypothesized"
    VALIDATING = "validating"
    VALIDATED = "validated"
    BLOCKED = "blocked"
    REFUTED = "refuted"
    ARCHIVED = "archived"


class WorkProjectRelationSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    source_asset_id: int
    target_asset_id: int
    type: WorkProjectRelationType
    status: WorkProjectAssertionStatus
    summary: str = ""
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime
    updated_at: datetime


class WorkProjectRelationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_asset_id: int = Field(gt=0)
    target_asset_id: int = Field(gt=0)
    type: WorkProjectRelationType
    status: WorkProjectAssertionStatus = WorkProjectAssertionStatus.HYPOTHESIZED
    summary: str = Field(default="", max_length=4000)
    evidence_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("summary", mode="before")
    @classmethod
    def normalize_summary(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_relation(self) -> "WorkProjectRelationRequest":
        if self.source_asset_id == self.target_asset_id:
            raise ValueError("relation cannot connect an asset to itself")
        self.evidence_ids = list(dict.fromkeys(self.evidence_ids))
        if self.status in {WorkProjectAssertionStatus.OBSERVED, WorkProjectAssertionStatus.VALIDATED, WorkProjectAssertionStatus.REFUTED} and not self.evidence_ids:
            raise ValueError(f"{self.status.value} relation requires evidence")
        return self


class WorkProjectAttackPathSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    objective: str
    entry_asset_id: int
    target_asset_id: int
    summary: str
    archived_at: datetime | None = None
    archive_reason: str = ""
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime
    updated_at: datetime


class WorkProjectAttackPathStepSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    path_id: int
    sequence: int
    source_asset_id: int
    target_asset_id: int
    action: WorkProjectAttackAction
    description: str
    preconditions: str
    result: str
    status: WorkProjectAttackStepStatus
    relation_id: int | None = None
    finding_id: int | None = None
    attack_technique_id: str = ""
    blocker_reason: str = ""
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime
    updated_at: datetime


class WorkProjectAttackPathStepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sequence: int = Field(gt=0)
    source_asset_id: int = Field(gt=0)
    target_asset_id: int = Field(gt=0)
    action: WorkProjectAttackAction
    description: str = Field(min_length=1, max_length=4000)
    preconditions: str = Field(default="", max_length=4000)
    result: str = Field(default="", max_length=8000)
    status: WorkProjectAttackStepStatus = WorkProjectAttackStepStatus.HYPOTHESIZED
    relation_id: int | None = Field(default=None, gt=0)
    finding_id: int | None = Field(default=None, gt=0)
    attack_technique_id: str = Field(default="", max_length=32)
    blocker_reason: str = Field(default="", max_length=4000)
    evidence_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("description", "preconditions", "result", "attack_technique_id", "blocker_reason", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_step(self) -> "WorkProjectAttackPathStepRequest":
        if self.source_asset_id == self.target_asset_id:
            raise ValueError("attack path step must move between distinct assets")
        self.evidence_ids = list(dict.fromkeys(self.evidence_ids))
        if self.attack_technique_id and not re.fullmatch(r"T\d{4}(?:\.\d{3})?", self.attack_technique_id):
            raise ValueError("attack_technique_id must be a MITRE ATT&CK technique id")
        if self.status in {WorkProjectAttackStepStatus.VALIDATED, WorkProjectAttackStepStatus.REFUTED} and not self.evidence_ids:
            raise ValueError(f"{self.status.value} attack path step requires evidence")
        if self.status in {WorkProjectAttackStepStatus.VALIDATED, WorkProjectAttackStepStatus.REFUTED} and not self.result:
            raise ValueError(f"{self.status.value} attack path step requires a result")
        if self.status == WorkProjectAttackStepStatus.BLOCKED and not self.blocker_reason:
            raise ValueError("blocked attack path step requires a blocker reason")
        if self.status != WorkProjectAttackStepStatus.BLOCKED and self.blocker_reason:
            raise ValueError("blocker_reason is only valid for a blocked attack path step")
        return self


class WorkProjectAttackPathRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    objective: str = Field(min_length=1, max_length=4000)
    entry_asset_id: int = Field(gt=0)
    target_asset_id: int = Field(gt=0)
    summary: str = Field(default="", max_length=8000)
    archived: bool = False
    archive_reason: str = Field(default="", max_length=4000)
    steps: list[WorkProjectAttackPathStepRequest] = Field(min_length=1, max_length=100)

    @field_validator("title", "objective", "summary", "archive_reason", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_path(self) -> "WorkProjectAttackPathRequest":
        if self.archived and not self.archive_reason:
            raise ValueError("archived attack path requires an archive reason")
        if not self.archived and self.archive_reason:
            raise ValueError("archive_reason is only valid for an archived attack path")
        if self.entry_asset_id == self.target_asset_id:
            raise ValueError("attack path entry and target assets must be distinct")
        sequences = [step.sequence for step in self.steps]
        if sequences != list(range(1, len(self.steps) + 1)):
            raise ValueError("attack path step sequences must be contiguous and start at 1")
        if self.steps[0].source_asset_id != self.entry_asset_id:
            raise ValueError("first attack path step must start at entry_asset_id")
        if self.steps[-1].target_asset_id != self.target_asset_id:
            raise ValueError("last attack path step must end at target_asset_id")
        for previous, current in zip(self.steps, self.steps[1:]):
            if previous.target_asset_id != current.source_asset_id:
                raise ValueError("attack path steps must form a continuous chain")
        path_assets = [self.entry_asset_id, *(step.target_asset_id for step in self.steps)]
        if len(path_assets) != len(set(path_assets)):
            raise ValueError("attack path cannot visit the same asset more than once")
        return self


def derive_attack_path_status(
    steps: list[WorkProjectAttackPathStepSchema],
    archived_at: datetime | None,
) -> WorkProjectAttackPathStatus:
    if archived_at is not None:
        return WorkProjectAttackPathStatus.ARCHIVED
    statuses = {step.status for step in steps}
    if WorkProjectAttackStepStatus.REFUTED in statuses:
        return WorkProjectAttackPathStatus.REFUTED
    if statuses == {WorkProjectAttackStepStatus.VALIDATED}:
        return WorkProjectAttackPathStatus.VALIDATED
    if WorkProjectAttackStepStatus.BLOCKED in statuses:
        return WorkProjectAttackPathStatus.BLOCKED
    if WorkProjectAttackStepStatus.VALIDATING in statuses:
        return WorkProjectAttackPathStatus.VALIDATING
    return WorkProjectAttackPathStatus.HYPOTHESIZED
