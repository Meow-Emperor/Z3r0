from datetime import datetime

from sqlalchemy import CheckConstraint, Column, Index, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from schema.work_project.workflow import (
    WorkProjectTargetStatus,
    WorkProjectWorkItemPhase,
    WorkProjectWorkItemPriority,
    WorkProjectWorkItemStatus,
    WorkProjectWorkLogKind,
)


class WorkProjectWorkItem(SQLModel, table=True):
    __tablename__ = "work_project_work_items"
    __table_args__ = (
        CheckConstraint(
            "(CASE WHEN focus_relation_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN focus_finding_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN focus_attack_path_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN focus_attack_path_step_id IS NULL THEN 0 ELSE 1 END) <= 1",
            name="ck_work_project_work_item_single_focus",
        ),
        Index("ix_work_project_work_items_project_status", "project_id", "status"),
        Index("ix_work_project_work_items_project_assignee", "project_id", "assignee_agent_code"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    parent_id: int | None = Field(default=None, foreign_key="work_project_work_items.id", index=True, ondelete="SET NULL")
    title: str = Field(index=True)
    phase: WorkProjectWorkItemPhase = Field(sa_column=Column(String(32), nullable=False, index=True))
    status: WorkProjectWorkItemStatus = Field(sa_column=Column(String(32), nullable=False, index=True))
    priority: WorkProjectWorkItemPriority = Field(sa_column=Column(String(32), nullable=False))
    assignee_agent_code: str = Field(index=True)
    objective: str = ""
    execution_scope: str = ""
    completion_criteria: str = ""
    result_summary: str = ""
    blocker_reason: str = ""
    focus_relation_id: int | None = Field(default=None, foreign_key="work_project_relations.id", index=True, ondelete="SET NULL")
    focus_finding_id: int | None = Field(default=None, foreign_key="work_project_findings.id", index=True, ondelete="SET NULL")
    focus_attack_path_id: int | None = Field(default=None, foreign_key="work_project_attack_paths.id", index=True, ondelete="SET NULL")
    focus_attack_path_step_id: int | None = Field(default=None, foreign_key="work_project_attack_path_steps.id", index=True, ondelete="SET NULL")
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class WorkProjectWorkItemTarget(SQLModel, table=True):
    __tablename__ = "work_project_work_item_targets"
    __table_args__ = (
        UniqueConstraint("work_item_id", "asset_id", "surface", name="uq_work_project_work_item_target"),
        Index("ix_work_project_work_item_targets_asset_status", "asset_id", "status"),
    )

    id: int | None = Field(default=None, primary_key=True)
    work_item_id: int = Field(foreign_key="work_project_work_items.id", index=True, ondelete="CASCADE")
    asset_id: int = Field(foreign_key="work_project_assets.id", index=True, ondelete="CASCADE")
    surface: str
    status: WorkProjectTargetStatus = Field(sa_column=Column(String(32), nullable=False, index=True))
    conclusion: str = ""
    deferral_reason: str = ""
    updated_at: datetime = Field(default_factory=datetime.now)


class WorkProjectWorkItemDependency(SQLModel, table=True):
    __tablename__ = "work_project_work_item_dependencies"
    __table_args__ = (UniqueConstraint("work_item_id", "depends_on_id", name="uq_work_project_work_item_dependency"),)

    work_item_id: int = Field(foreign_key="work_project_work_items.id", primary_key=True, ondelete="CASCADE")
    depends_on_id: int = Field(foreign_key="work_project_work_items.id", primary_key=True, index=True, ondelete="CASCADE")
    created_at: datetime = Field(default_factory=datetime.now)


class WorkProjectWorkLog(SQLModel, table=True):
    __tablename__ = "work_project_work_logs"
    __table_args__ = (Index("ix_work_project_work_logs_project_created", "project_id", "created_at"),)

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    work_item_id: int = Field(foreign_key="work_project_work_items.id", index=True, ondelete="CASCADE")
    kind: WorkProjectWorkLogKind = Field(sa_column=Column(String(32), nullable=False, index=True))
    content: str = ""
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
