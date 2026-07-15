from datetime import datetime

from sqlalchemy import Column, Index, String, UniqueConstraint
from sqlmodel import Field, SQLModel

from schema.work_project.assets import (
    WorkProjectAssetCriticality,
    WorkProjectAssetKind,
    WorkProjectAssetOrigin,
    WorkProjectAssetScope,
    WorkProjectAssetState,
)


class WorkProjectAsset(SQLModel, table=True):
    __tablename__ = "work_project_assets"
    __table_args__ = (
        UniqueConstraint("project_id", "kind", "locator", name="uq_work_project_asset_identity"),
        Index("ix_work_project_assets_project_scope", "project_id", "scope"),
        Index("ix_work_project_assets_project_kind", "project_id", "kind"),
    )

    id: int | None = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="work_projects.id", index=True, ondelete="CASCADE")
    kind: WorkProjectAssetKind = Field(sa_column=Column(String(32), nullable=False))
    locator: str = Field(sa_column=Column(String(1000), nullable=False, index=True))
    name: str = Field(default="", index=True)
    summary: str = ""
    origin: WorkProjectAssetOrigin = Field(sa_column=Column(String(32), nullable=False, index=True))
    scope: WorkProjectAssetScope = Field(sa_column=Column(String(32), nullable=False, index=True))
    criticality: WorkProjectAssetCriticality = Field(sa_column=Column(String(32), nullable=False))
    state: WorkProjectAssetState = Field(sa_column=Column(String(32), nullable=False, index=True))
    created_by_agent_code: str = Field(default="", index=True)
    created_from_session_id: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
