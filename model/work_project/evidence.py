from datetime import datetime

from sqlalchemy import Column, Index, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from schema.work_project.evidence import WorkProjectEvidenceKind, WorkProjectEvidenceStatus


class WorkProjectEvidence(SQLModel, table=True):
    __tablename__ = "work_project_evidence"
    __table_args__ = (
        Index("ix_work_project_evidence_project_kind", "project_id", "kind"),
        Index("ix_work_project_evidence_project_status", "project_id", "status"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    kind: WorkProjectEvidenceKind = Field(sa_column=Column(String(32), nullable=False))
    title: str = Field(index=True)
    summary: str = ""
    reference: str = Field(sa_column=Column(String(2000), nullable=False))
    sha256: str = Field(default="", max_length=64, index=True)
    primary_asset_id: int | None = Field(default=None, foreign_key="work_project_assets.id", index=True, ondelete="SET NULL")
    work_item_id: int = Field(foreign_key="work_project_work_items.id", index=True, ondelete="CASCADE")
    status: WorkProjectEvidenceStatus = Field(sa_column=Column(String(32), nullable=False, index=True))
    supersedes_evidence_id: int | None = Field(default=None, foreign_key="work_project_evidence.id", index=True, ondelete="SET NULL")
    invalidation_reason: str = ""
    captured_at: datetime = Field(default_factory=datetime.now, index=True)
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)


class WorkProjectRelationEvidence(SQLModel, table=True):
    __tablename__ = "work_project_relation_evidence"
    __table_args__ = (UniqueConstraint("relation_id", "evidence_id", name="uq_work_project_relation_evidence"),)

    relation_id: int = Field(foreign_key="work_project_relations.id", primary_key=True, ondelete="CASCADE")
    evidence_id: int = Field(foreign_key="work_project_evidence.id", primary_key=True, index=True, ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.now)


class WorkProjectFindingEvidence(SQLModel, table=True):
    __tablename__ = "work_project_finding_evidence"
    __table_args__ = (UniqueConstraint("finding_id", "evidence_id", name="uq_work_project_finding_evidence"),)

    finding_id: int = Field(foreign_key="work_project_findings.id", primary_key=True, ondelete="CASCADE")
    evidence_id: int = Field(foreign_key="work_project_evidence.id", primary_key=True, index=True, ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.now)


class WorkProjectAttackPathStepEvidence(SQLModel, table=True):
    __tablename__ = "work_project_attack_path_step_evidence"
    __table_args__ = (UniqueConstraint("step_id", "evidence_id", name="uq_work_project_attack_path_step_evidence"),)

    step_id: int = Field(foreign_key="work_project_attack_path_steps.id", primary_key=True, ondelete="CASCADE")
    evidence_id: int = Field(foreign_key="work_project_evidence.id", primary_key=True, index=True, ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.now)
