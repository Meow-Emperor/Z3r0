from datetime import datetime

from sqlmodel import Field, SQLModel

from schema.system_user.users import SystemUserRole


class SystemUser(SQLModel, table=True):
    __tablename__ = "system_users"

    id: int | None = Field(default=None, primary_key=True)
    role: SystemUserRole = Field(default=SystemUserRole.USER)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)
    password: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
