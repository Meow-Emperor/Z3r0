from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schema.common.responses import PaginatedResponse


DEFAULT_SANDBOX_CONTAINER_COMMAND = "trap 'exit 0' TERM INT; while :; do sleep 3600; done"


class SandboxContainerStatus(StrEnum):
    CREATED = "created"
    RUNNING = "running"
    STOPPED = "stopped"
    ERROR = "error"


# sandbox container port mapping schema
class SandboxContainerPortMapping(BaseModel):
    container_port: int = Field(ge=1, le=65535)
    host_port: int = Field(ge=1, le=65535)
    protocol: Literal["tcp", "udp"] = "tcp"

    @field_validator("protocol", mode="before")
    @classmethod
    def normalize_protocol(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip().lower()
        return value


# sandbox container public data schema
class SandboxContainerSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    container_name: str
    container_hash: str
    image_id: int
    image_name: str
    container_command: str
    port_mappings: list[SandboxContainerPortMapping]
    novnc_support: bool
    novnc_port: int
    status: SandboxContainerStatus
    owner_id: int
    owner_username: str
    created_at: datetime
    updated_at: datetime


# create sandbox container request schema
class CreateSandboxContainerRequest(BaseModel):
    image_id: int = Field(gt=0)
    owner_id: int | None = Field(default=None, description="Assign container owner user ID. Admin only; defaults to the creator.")
    container_command: str = Field(default=DEFAULT_SANDBOX_CONTAINER_COMMAND, max_length=2000)
    port_mappings: list[SandboxContainerPortMapping] = Field(default_factory=list, max_length=32)
    novnc_support: bool = False
    novnc_port: int = Field(default=0, ge=0, le=65535)

    @field_validator("container_command", mode="before")
    @classmethod
    def normalize_container_command(cls, value: Any) -> Any:
        if value is None:
            return DEFAULT_SANDBOX_CONTAINER_COMMAND
        if isinstance(value, str):
            return value.strip()
        return value

    @model_validator(mode="after")
    def validate_container_contract(self):
        container_ports: set[tuple[int, str]] = set()
        host_ports: set[tuple[int, str]] = set()
        for mapping in self.port_mappings:
            container_key = (mapping.container_port, mapping.protocol)
            host_key = (mapping.host_port, mapping.protocol)
            if container_key in container_ports:
                raise ValueError("container ports must be unique per protocol")
            if host_key in host_ports:
                raise ValueError("host ports must be unique per protocol")
            container_ports.add(container_key)
            host_ports.add(host_key)

        if not self.novnc_support:
            self.novnc_port = 0
            return self
        if self.novnc_port <= 0:
            raise ValueError("novnc port is required when novnc support is enabled")
        return self


# delete sandbox container response schema (presence implies success)
class DeleteSandboxContainerResponse(BaseModel):
    id: int


# query sandbox containers response schema
class QuerySandboxContainersResponse(PaginatedResponse[SandboxContainerSchema]):
    pass


# ── container file manager schemas ────────────────────────────────────────────


class ContainerFileType(StrEnum):
    FILE = "file"
    DIRECTORY = "directory"
    SYMLINK = "symlink"


class ContainerFileInfo(BaseModel):
    name: str
    type: ContainerFileType
    size: int
    modified_at: int
    owner: str
    group: str
    permissions: str
    path: str


class ListContainerFilesResponse(BaseModel):
    path: str
    files: list[ContainerFileInfo]


class ContainerFileReadResponse(BaseModel):
    path: str
    content: str
    size: int


class ContainerFileUploadItem(BaseModel):
    name: str
    path: str
    size: int


class ContainerFileUploadResponse(BaseModel):
    path: str
    files: list[ContainerFileUploadItem]


class ContainerFileWriteRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
    content: str = Field(min_length=0, max_length=1_048_576)


class ContainerFileCopyRequest(BaseModel):
    sources: list[str] = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=4096)


class ContainerFileMoveRequest(BaseModel):
    sources: list[str] = Field(min_length=1, max_length=100)
    destination: str = Field(min_length=1, max_length=4096)


class ContainerFileDeleteRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=100)


class ContainerFileMkdirRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)
