from datetime import datetime

from sqlmodel import Field, SQLModel

from schema.work_project.projects import WorkProjectStatus, WorkProjectType


class WorkProject(SQLModel, table=True):
    __tablename__ = "work_projects"

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(default="", index=True)
    description: str = Field(default="")
    sandbox_container_id: int | None = Field(
        default=None,
        foreign_key="sandbox_containers.id",
        unique=True,
        index=True,
        ondelete="SET NULL",
    )
    status: WorkProjectStatus = Field(default=WorkProjectStatus.ACTIVE, index=True)
    type: WorkProjectType = Field(default=WorkProjectType.PENETRATION_TEST, index=True)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class WorkProjectOwner(SQLModel, table=True):
    __tablename__ = "work_project_owners"

    project_id: int = Field(foreign_key="work_projects.id", primary_key=True, ondelete="CASCADE")
    user_id: int = Field(foreign_key="system_users.id", primary_key=True, index=True, ondelete="CASCADE")
    position: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.now)
