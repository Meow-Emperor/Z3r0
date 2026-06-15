from datetime import datetime

from sqlmodel import Field, SQLModel


class SandboxImage(SQLModel, table=True):
    __tablename__ = "sandbox_images"

    id: int | None = Field(default=None, primary_key=True)
    image_name: str = Field(default="")
    default_exposed_port: int = Field(default=8000)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
