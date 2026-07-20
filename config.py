import json
import secrets
import tempfile
from pathlib import Path
from typing import Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator


ROOT_PATH = Path(__file__).resolve().parent
WORKSPACE = ROOT_PATH / ".z3r0"
CONFIG_FILE = WORKSPACE / "config.json"


# strict type config base model
class StrictConfigModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)


# system config
class BootstrapAdminConfig(StrictConfigModel):
    enabled: bool = Field(default=False)
    username: str = Field(default="admin", min_length=1, max_length=64)
    email: str = Field(default="admin@z3r0.local", min_length=1, max_length=255)
    password: str = Field(default="", max_length=128)

    @model_validator(mode="after")
    def validate_password_when_enabled(self):
        if self.enabled and not self.password:
            raise ValueError("bootstrap admin password is required when bootstrap admin is enabled")
        return self


class SystemConfig(StrictConfigModel):
    listen_addr: str = Field(default="127.0.0.1", min_length=1)
    listen_port: int = Field(default=8000, ge=1, le=65535)
    encrypt_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32), min_length=32)
    bootstrap_admin: BootstrapAdminConfig = Field(default_factory=BootstrapAdminConfig)


# database config
class DatabaseConfig(StrictConfigModel):
    host: str = Field(default="127.0.0.1", min_length=1)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(default="z3r0", min_length=1)
    username: str = Field(default="root", min_length=1)
    password: str = Field(default="")
    pool_size: int = Field(default=32, ge=1)
    max_overflow: int = Field(default=32, ge=0)
    pool_timeout_seconds: int = Field(default=30, gt=0)
    pool_recycle_seconds: int = Field(default=1800, ge=0)
    pool_pre_ping: bool = Field(default=True)


# agent config
class AgentConfig(StrictConfigModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(default="")
    base_url: str = Field(min_length=1)
    api_key: str = Field(default="")
    model: str = Field(min_length=1)
    use_responses: bool = Field(default=False)
    context_window: int = Field(default=1000000, ge=0)


# per-process agent runtime pool tuning
class AgentPoolConfig(StrictConfigModel):
    max_size: int = Field(default=256, ge=1)
    ttl_seconds: int = Field(default=30 * 60, ge=0)
    sweep_interval_seconds: int = Field(default=60, ge=1)


# per-process agent run tuning
class AgentRuntimeConfig(StrictConfigModel):
    main_max_turns: int = Field(default=1000, ge=1)
    subordinate_max_turns: int = Field(default=1000, ge=1)
    model_stream_idle_timeout_seconds: int = Field(default=300, ge=30)
    report_retention_seconds: int = Field(default=3 * 24 * 60 * 60, ge=0)
    context_compression_trigger_ratio: float = Field(default=0.90, gt=0, lt=1)
    context_compression_hard_stop_ratio: float = Field(default=0.98, gt=0, lt=1)
    context_compression_target_ratio: float = Field(default=0.20, gt=0, lt=1)
    context_budget_model_call_ratio: float = Field(default=0.80, gt=0, lt=1)
    context_compression_preserve_recent_ratio: float = Field(default=0.25, gt=0, lt=1)
    context_compression_preserve_recent_items: int = Field(default=20, ge=1)
    context_compression_min_items: int = Field(default=12, ge=1)
    context_compression_summary_max_tokens: int = Field(default=8000, ge=512)

    @model_validator(mode="after")
    def validate_context_thresholds(self) -> Self:
        if not (
            self.context_compression_target_ratio
            < self.context_compression_trigger_ratio
            < self.context_compression_hard_stop_ratio
        ):
            raise ValueError(
                "context compression ratios must satisfy target < trigger < hard stop"
            )
        return self


# LightRAG config
class LightRAGConfig(StrictConfigModel):
    embedding_api: str = Field(default="https://api.openai.com/v1", min_length=1)
    embedding_key: str = Field(default="")
    embedding_model: str = Field(default="text-embedding-3-small", min_length=1)
    embedding_dim: int = Field(default=1536, ge=1, le=16000)
    llm_api: str = Field(default="https://api.openai.com/v1", min_length=1)
    llm_key: str = Field(default="")
    llm_model: str = Field(default="gpt-5", min_length=1)
    graph_matches: int = Field(default=5, ge=1, le=50)
    chunk_matches: int = Field(default=10, ge=1, le=50)


# global config
class GlobalConfig(StrictConfigModel):
    system: SystemConfig = Field(default_factory=SystemConfig)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    agents: dict[str, AgentConfig] = Field(default_factory=dict)
    agent_pool: AgentPoolConfig = Field(default_factory=AgentPoolConfig)
    agent_runtime: AgentRuntimeConfig = Field(default_factory=AgentRuntimeConfig)
    lightrag: LightRAGConfig = Field(default_factory=LightRAGConfig)

    @model_validator(mode="after")
    def validate_agent_codes(self) -> Self:
        for code, agent in self.agents.items():
            if code != agent.code:
                raise ValueError(f"agent code mismatch: {code}")
        return self


###
# global config instance
###
_cfg: GlobalConfig = GlobalConfig()


def load_config() -> None:
    """Load validated configuration while preserving the shared object identity."""
    next_cfg = read_config_file()
    for field_name in type(_cfg).model_fields:
        setattr(_cfg, field_name, getattr(next_cfg, field_name))


def get_config() -> GlobalConfig:
    """Return the process-wide configuration object."""
    return _cfg


def read_config_file() -> GlobalConfig:
    """Read and validate config.json without mutating global state."""
    with CONFIG_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return GlobalConfig.model_validate(data)


def write_config_file(cfg: GlobalConfig) -> None:
    """Atomically write a validated config.json."""
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    data: dict[str, Any] = cfg.model_dump(mode="json")
    payload = json.dumps(data, ensure_ascii=False, indent=4)

    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=WORKSPACE,
            prefix=".config.",
            suffix=".json.tmp",
            delete=False,
        ) as f:
            temp_path = Path(f.name)
            f.write(payload)
            f.write("\n")
        temp_path.replace(CONFIG_FILE)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
