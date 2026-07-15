from datetime import datetime
from enum import StrEnum
from typing import Any

from cvss import CVSS3, CVSS4
from cvss.exceptions import CVSSError
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WorkProjectFindingCategory(StrEnum):
    VULNERABILITY = "vulnerability"
    MISCONFIGURATION = "misconfiguration"
    EXPOSURE = "exposure"
    CREDENTIAL = "credential"
    SENSITIVE_DATA = "sensitive_data"
    SECURITY_CONTROL_GAP = "security_control_gap"


class WorkProjectFindingVerification(StrEnum):
    SUSPECTED = "suspected"
    VALIDATED = "validated"
    REFUTED = "refuted"
    DEFERRED = "deferred"


class WorkProjectFindingResolution(StrEnum):
    OPEN = "open"
    ACCEPTED = "accepted"
    REMEDIATED = "remediated"
    CLOSED = "closed"


class WorkProjectFindingSeverity(StrEnum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WorkProjectFindingAssetRole(StrEnum):
    AFFECTED = "affected"
    ENTRY = "entry"
    IMPACT = "impact"


class WorkProjectFindingSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    primary_asset_id: int
    category: WorkProjectFindingCategory
    title: str
    verification: WorkProjectFindingVerification
    resolution: WorkProjectFindingResolution | None = None
    severity: WorkProjectFindingSeverity
    description: str
    preconditions: str
    impact: str
    recommendation: str
    cwe_id: str
    cvss_vector: str
    cvss_score: float | None = None
    deferral_reason: str
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime
    updated_at: datetime
    validated_at: datetime | None = None


class WorkProjectFindingAssetLinkSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    finding_id: int
    asset_id: int
    role: WorkProjectFindingAssetRole


class WorkProjectFindingAssetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: int = Field(gt=0)
    role: WorkProjectFindingAssetRole = WorkProjectFindingAssetRole.AFFECTED


class WorkProjectFindingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    primary_asset_id: int = Field(gt=0)
    category: WorkProjectFindingCategory
    title: str = Field(min_length=1, max_length=255)
    verification: WorkProjectFindingVerification = WorkProjectFindingVerification.SUSPECTED
    resolution: WorkProjectFindingResolution | None = None
    severity: WorkProjectFindingSeverity = WorkProjectFindingSeverity.INFO
    description: str = Field(min_length=1, max_length=8000)
    preconditions: str = Field(default="", max_length=4000)
    impact: str = Field(default="", max_length=8000)
    recommendation: str = Field(default="", max_length=8000)
    cwe_id: str = Field(default="", max_length=32)
    cvss_vector: str = Field(default="", max_length=255)
    deferral_reason: str = Field(default="", max_length=4000)
    affected_assets: list[WorkProjectFindingAssetRequest] = Field(default_factory=list, max_length=500)
    evidence_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator(
        "title", "description", "preconditions", "impact", "recommendation",
        "cwe_id", "cvss_vector", "deferral_reason", mode="before",
    )
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_finding(self) -> "WorkProjectFindingRequest":
        self.cwe_id = self.cwe_id.upper()
        if self.cwe_id and (not self.cwe_id.startswith("CWE-") or not self.cwe_id[4:].isdigit()):
            raise ValueError("cwe_id must use the CWE-<number> format")
        self.evidence_ids = list(dict.fromkeys(self.evidence_ids))
        asset_links = [(item.asset_id, item.role) for item in self.affected_assets]
        if len(asset_links) != len(set(asset_links)):
            raise ValueError("finding contains a duplicate asset role")
        if self.verification in {
            WorkProjectFindingVerification.SUSPECTED,
            WorkProjectFindingVerification.VALIDATED,
            WorkProjectFindingVerification.REFUTED,
        } and not self.evidence_ids:
            raise ValueError(f"{self.verification.value} finding requires evidence")
        if self.verification == WorkProjectFindingVerification.DEFERRED and not self.deferral_reason:
            raise ValueError("deferred finding requires a deferral reason")
        if self.verification != WorkProjectFindingVerification.DEFERRED and self.deferral_reason:
            raise ValueError("deferral_reason is only valid for a deferred finding")
        if self.verification == WorkProjectFindingVerification.VALIDATED and not self.impact:
            raise ValueError("validated finding requires an impact statement")
        if self.verification != WorkProjectFindingVerification.VALIDATED and self.resolution is not None:
            raise ValueError("resolution is only valid for a validated finding")
        if self.verification == WorkProjectFindingVerification.VALIDATED and self.resolution is None:
            self.resolution = WorkProjectFindingResolution.OPEN
        if self.cvss_vector:
            score = _cvss_score(self.cvss_vector)
            expected_severity = _severity_for_cvss(score)
            if self.severity != expected_severity:
                raise ValueError(
                    f"severity must be {expected_severity.value} for CVSS score {score:g}"
                )
        return self

    @property
    def cvss_score(self) -> float | None:
        return _cvss_score(self.cvss_vector) if self.cvss_vector else None


def _cvss_score(vector: str) -> float:
    try:
        if vector.startswith("CVSS:4.0/"):
            return float(CVSS4(vector).scores()[0])
        if vector.startswith("CVSS:3.0/") or vector.startswith("CVSS:3.1/"):
            return float(CVSS3(vector).scores()[0])
    except (CVSSError, ValueError, IndexError, KeyError) as error:
        raise ValueError("cvss_vector is invalid") from error
    raise ValueError("cvss_vector must be CVSS 3.0, 3.1, or 4.0")


def _severity_for_cvss(score: float) -> WorkProjectFindingSeverity:
    if score == 0:
        return WorkProjectFindingSeverity.INFO
    if score < 4:
        return WorkProjectFindingSeverity.LOW
    if score < 7:
        return WorkProjectFindingSeverity.MEDIUM
    if score < 9:
        return WorkProjectFindingSeverity.HIGH
    return WorkProjectFindingSeverity.CRITICAL
