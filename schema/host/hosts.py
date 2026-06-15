from datetime import datetime
from ipaddress import ip_address
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schema.common.responses import PaginatedResponse


class ManagedHostSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ip_address: str
    ssh_port: int
    host_account: str
    host_password: str
    docker_management_port: int
    created_at: datetime
    updated_at: datetime


class CreateManagedHostRequest(BaseModel):
    ip_address: str = Field(min_length=1, max_length=255)
    ssh_port: int = Field(default=22, ge=1, le=65535)
    host_account: str = Field(min_length=1, max_length=128)
    host_password: str = Field(min_length=1, max_length=512)
    docker_management_port: int = Field(default=2375, ge=1, le=65535)

    @field_validator("ip_address", "host_account", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, value: str) -> str:
        try:
            return str(ip_address(value))
        except ValueError as exc:
            raise ValueError("ip address must be a valid IPv4 or IPv6 address") from exc


class UpdateManagedHostRequest(BaseModel):
    ip_address: str | None = Field(default=None, min_length=1, max_length=255)
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    host_account: str | None = Field(default=None, min_length=1, max_length=128)
    host_password: str | None = Field(default=None, min_length=1, max_length=512)
    docker_management_port: int | None = Field(default=None, ge=1, le=65535)

    @field_validator("ip_address", "host_account", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            return str(ip_address(value))
        except ValueError as exc:
            raise ValueError("ip address must be a valid IPv4 or IPv6 address") from exc

    @model_validator(mode="after")
    def validate_has_updates(self):
        if all(
            value is None
            for value in (
                self.ip_address,
                self.ssh_port,
                self.host_account,
                self.host_password,
                self.docker_management_port,
            )
        ):
            raise ValueError("at least one field must be provided")
        return self


class DeleteManagedHostResponse(BaseModel):
    id: int


class QueryManagedHostsResponse(PaginatedResponse[ManagedHostSchema]):
    pass


class ManagedHostImageSchema(BaseModel):
    image_name: str
    image_id: str = ""
    image_hash: str = ""
    image_size: int = Field(default=0, json_schema_extra={"format": "int64"})
    created_at: datetime | None = None


class PullManagedHostImagesRequest(BaseModel):
    image_names: list[str] = Field(min_length=1, max_length=100)

    @field_validator("image_names", mode="after")
    @classmethod
    def normalize_image_names(cls, value: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for item in value:
            image_name = item.strip() if isinstance(item, str) else ""
            if not image_name or image_name in seen:
                continue
            result.append(image_name)
            seen.add(image_name)
        if not result:
            raise ValueError("at least one image name is required")
        return result


class PullManagedHostImageResultSchema(BaseModel):
    image_name: str
    success: bool
    message: str = ""


class PullManagedHostImagesResponse(BaseModel):
    items: list[PullManagedHostImageResultSchema]


class DeleteManagedHostImageRequest(BaseModel):
    image_id: str = Field(min_length=1, max_length=255)
    force: bool = False


class ListManagedHostImagesResponse(BaseModel):
    items: list[ManagedHostImageSchema]
