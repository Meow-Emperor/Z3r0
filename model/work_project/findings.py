from datetime import datetime

from sqlalchemy import Column, Index, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from schema.work_project.findings import (
    WorkProjectFindingAssetRole,
    WorkProjectFindingCategory,
    WorkProjectFindingResolution,
    WorkProjectFindingSeverity,
    WorkProjectFindingVerification,
)


class WorkProjectFinding(SQLModel, table=True):
    __tablename__ = "work_project_findings"
    __table_args__ = (
        Index("ix_work_project_findings_project_verification", "project_id", "verification"),
        Index("ix_work_project_findings_project_severity", "project_id", "severity"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    primary_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    category: WorkProjectFindingCategory = Field(sa_column=Column(String(32), nullable=False, index=True))
    title: str = Field(index=True)
    verification: WorkProjectFindingVerification = Field(sa_column=Column(String(32), nullable=False, index=True))
    resolution: WorkProjectFindingResolution | None = Field(default=None, sa_column=Column(String(32), nullable=True, index=True))
    severity: WorkProjectFindingSeverity = Field(sa_column=Column(String(32), nullable=False, index=True))
    description: str = ""
    preconditions: str = ""
    impact: str = ""
    recommendation: str = ""
    cwe_id: str = Field(default="", index=True)
    cvss_vector: str = ""
    cvss_score: float | None = None
    deferral_reason: str = ""
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    validated_at: datetime | None = None


class WorkProjectFindingAsset(SQLModel, table=True):
    __tablename__ = "work_project_finding_assets"
    __table_args__ = (UniqueConstraint("finding_id", "asset_id", "role", name="uq_work_project_finding_asset"),)

    finding_id: int = Field(foreign_key="work_project_findings.id", primary_key=True, ondelete="CASCADE")
    asset_id: int = Field(foreign_key="work_project_assets.id", primary_key=True, index=True, ondelete="CASCADE")
    role: WorkProjectFindingAssetRole = Field(sa_column=Column(String(32), primary_key=True, nullable=False))
    created_at: datetime = Field(default_factory=datetime.now)
