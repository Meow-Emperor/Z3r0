from datetime import datetime

from sqlalchemy import Column, Index, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from schema.work_project.graph import (
    WorkProjectAssertionStatus,
    WorkProjectAttackAction,
    WorkProjectAttackStepStatus,
    WorkProjectRelationType,
)


class WorkProjectRelation(SQLModel, table=True):
    __tablename__ = "work_project_relations"
    __table_args__ = (
        UniqueConstraint("project_id", "source_asset_id", "target_asset_id", "type", name="uq_work_project_relation"),
        Index("ix_work_project_relations_project_status", "project_id", "status"),
        Index("ix_work_project_relations_source", "source_asset_id"),
        Index("ix_work_project_relations_target", "target_asset_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    source_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    target_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    type: WorkProjectRelationType = Field(sa_column=Column(String(32), nullable=False))
    status: WorkProjectAssertionStatus = Field(sa_column=Column(String(32), nullable=False, index=True))
    summary: str = ""
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class WorkProjectAttackPath(SQLModel, table=True):
    __tablename__ = "work_project_attack_paths"

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    title: str = Field(index=True)
    objective: str = ""
    entry_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    target_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    summary: str = ""
    archived_at: datetime | None = Field(default=None, index=True)
    archive_reason: str = ""
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class WorkProjectAttackPathStep(SQLModel, table=True):
    __tablename__ = "work_project_attack_path_steps"
    __table_args__ = (
        UniqueConstraint("path_id", "sequence", name="uq_work_project_attack_path_step_sequence"),
        Index("ix_work_project_attack_path_steps_project_path", "project_id", "path_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    path_id: int = Field(foreign_key="work_project_attack_paths.id", index=True, ondelete="CASCADE")
    sequence: int = Field(index=True)
    source_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    target_asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    action: WorkProjectAttackAction = Field(sa_column=Column(String(32), nullable=False, index=True))
    description: str = ""
    preconditions: str = ""
    result: str = ""
    status: WorkProjectAttackStepStatus = Field(sa_column=Column(String(32), nullable=False, index=True))
    relation_id: int | None = Field(default=None, foreign_key="work_project_relations.id", index=True, ondelete="SET NULL")
    finding_id: int | None = Field(default=None, foreign_key="work_project_findings.id", index=True, ondelete="SET NULL")
    attack_technique_id: str = Field(default="", index=True)
    blocker_reason: str = ""
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
