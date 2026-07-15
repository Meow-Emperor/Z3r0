import ipaddress
import re
from datetime import datetime
from enum import StrEnum
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class WorkProjectAssetKind(StrEnum):
    NETWORK = "network"
    HOST = "host"
    DOMAIN = "domain"
    SERVICE = "service"
    APPLICATION = "application"
    ENDPOINT = "endpoint"
    REPOSITORY = "repository"
    COMPONENT = "component"
    ARTIFACT = "artifact"
    IDENTITY = "identity"
    DATA_STORE = "data_store"
    CLOUD_RESOURCE = "cloud_resource"


class WorkProjectAssetOrigin(StrEnum):
    DECLARED = "declared"
    DISCOVERED = "discovered"


class WorkProjectAssetScope(StrEnum):
    IN_SCOPE = "in_scope"
    CONTEXT = "context"
    OUT_OF_SCOPE = "out_of_scope"


class WorkProjectAssetCriticality(StrEnum):
    UNKNOWN = "unknown"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WorkProjectAssetState(StrEnum):
    UNKNOWN = "unknown"
    ACTIVE = "active"
    INACTIVE = "inactive"
    RETIRED = "retired"


class WorkProjectAssetSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    kind: WorkProjectAssetKind
    locator: str
    name: str = ""
    summary: str = ""
    origin: WorkProjectAssetOrigin
    scope: WorkProjectAssetScope
    criticality: WorkProjectAssetCriticality
    state: WorkProjectAssetState
    created_by_agent_code: str = ""
    created_from_session_id: str = ""
    created_at: datetime
    updated_at: datetime


class WorkProjectAssetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: WorkProjectAssetKind
    locator: str = Field(min_length=1, max_length=1000)
    name: str = Field(default="", max_length=255)
    summary: str = Field(default="", max_length=2000)
    scope: WorkProjectAssetScope = WorkProjectAssetScope.CONTEXT
    criticality: WorkProjectAssetCriticality = WorkProjectAssetCriticality.UNKNOWN
    state: WorkProjectAssetState = WorkProjectAssetState.UNKNOWN

    @field_validator("locator", "name", "summary", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def normalize_locator(self) -> "WorkProjectAssetRequest":
        self.locator = canonicalize_asset_locator(self.kind, self.locator)
        return self

    @property
    def identity(self) -> tuple[WorkProjectAssetKind, str]:
        return self.kind, self.locator


def canonicalize_asset_locator(kind: WorkProjectAssetKind, value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("asset locator is required")
    if kind == WorkProjectAssetKind.NETWORK:
        try:
            return str(ipaddress.ip_network(value.removeprefix("cidr:"), strict=False))
        except ValueError as error:
            raise ValueError("network locator must be a valid CIDR or IP address") from error
    if kind == WorkProjectAssetKind.HOST:
        candidate = value.removeprefix("host:").strip().lower().rstrip(".")
        _validate_hostname_or_ip(candidate, "host")
        return candidate
    if kind == WorkProjectAssetKind.DOMAIN:
        candidate = value.removeprefix("dns:").strip().lower().rstrip(".")
        _validate_hostname_or_ip(candidate, "domain", allow_ip=False)
        return candidate
    if kind == WorkProjectAssetKind.SERVICE:
        return _canonicalize_url(value, require_port=True)
    if kind == WorkProjectAssetKind.ENDPOINT:
        return _canonicalize_url(value, require_port=False, require_http=True)
    if kind == WorkProjectAssetKind.REPOSITORY and "://" in value:
        return _canonicalize_url(value, require_port=False)
    if kind == WorkProjectAssetKind.ARTIFACT and value.lower().startswith("sha256:"):
        digest = value.split(":", 1)[1].lower()
        if not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("artifact sha256 locator must contain a 64-character hexadecimal digest")
        return f"sha256:{digest}"
    return value


def _canonicalize_url(value: str, *, require_port: bool, require_http: bool = False) -> str:
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.hostname:
        raise ValueError("asset locator must be an absolute URI")
    scheme = parsed.scheme.lower()
    if require_http and scheme not in {"http", "https"}:
        raise ValueError("endpoint locator must use http or https")
    if require_port and parsed.port is None:
        raise ValueError("service locator must include an explicit port")
    host = parsed.hostname.lower().rstrip(".")
    netloc = host
    if ":" in host and not host.startswith("["):
        netloc = f"[{host}]"
    if parsed.port is not None:
        netloc = f"{netloc}:{parsed.port}"
    if parsed.username:
        raise ValueError("asset locator must not contain credentials")
    path = parsed.path or ("/" if require_http else "")
    return urlunsplit((scheme, netloc, path, parsed.query, ""))


def _validate_hostname_or_ip(value: str, label: str, *, allow_ip: bool = True) -> None:
    try:
        ipaddress.ip_address(value)
        if allow_ip:
            return
        raise ValueError(f"{label} locator must be a DNS name")
    except ValueError:
        if not allow_ip and re.fullmatch(r"\d+(?:\.\d+){3}", value):
            raise ValueError(f"{label} locator must be a DNS name")
    if len(value) > 253 or not re.fullmatch(r"(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", value):
        raise ValueError(f"{label} locator must be a valid hostname")
