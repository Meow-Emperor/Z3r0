import asyncio
from dataclasses import dataclass
from http import HTTPStatus

from fastapi import HTTPException

from config import (
    AgentConfig,
    AgentPoolConfig,
    AgentRuntimeConfig,
    GlobalConfig,
    LightRAGConfig,
    get_config,
    read_config_file,
    write_config_file,
)
from core.delegation.subagents import start_subagent_runtime, stop_subagent_runtime
from core.lightrag.runtime import lightrag_client, restart_lightrag
from core.runtime.session import AgentSessionPool, get_agent_pool, replace_agent_pool
from logger import get_logger
from schema.system_config.config import InstanceConfigSchema, UpdateInstanceConfigRequest


logger = get_logger(__name__)

_config_lock = asyncio.Lock()


@dataclass(frozen=True)
class InstanceConfigApplyResult:
    config: InstanceConfigSchema
    restarted: bool


async def get_instance_config() -> InstanceConfigApplyResult:
    async with _config_lock:
        file_cfg = read_config_file()
        return await _apply_instance_config_from_file(file_cfg)


async def update_instance_config(request: UpdateInstanceConfigRequest) -> InstanceConfigApplyResult:
    async with _config_lock:
        current = read_config_file()
        if set(request.agents) != set(current.agents):
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST.value,
                detail="agent set cannot be changed",
            )

        agents = {}
        for code, agent in current.agents.items():
            patch = request.agents[code]
            agents[code] = agent.model_copy(update={
                "name": patch.name,
                "description": patch.description,
                "base_url": patch.base_url,
                "api_key": patch.api_key,
                "model": patch.model,
                "use_responses": patch.use_responses,
                "context_window": patch.context_window,
            })

        next_cfg = current.model_copy(update={
            "agents": agents,
            "agent_pool": request.agent_pool,
            "agent_runtime": request.agent_runtime,
            "lightrag": request.lightrag,
        })
        write_config_file(next_cfg)
        try:
            return await _apply_instance_config_from_file(next_cfg)
        except BaseException as exc:
            try:
                write_config_file(current)
            except Exception as rollback_error:
                logger.exception("failed to roll back instance config file")
                exc.add_note(f"config file rollback also failed: {rollback_error}")
            raise


async def _apply_instance_config_from_file(file_cfg: GlobalConfig) -> InstanceConfigApplyResult:
    previous = _snapshot_instance_config(get_config())
    await _ensure_embedding_storage_compatible(previous.lightrag, file_cfg.lightrag)
    agent_runtime_changed, lightrag_runtime_changed = _apply_instance_config(file_cfg)
    if lightrag_runtime_changed:
        try:
            await restart_lightrag(file_cfg.lightrag, fallback_config=previous.lightrag)
        except BaseException:
            _restore_instance_config(previous)
            raise
        logger.info("LightRAG config applied and runtime rebuilt")
    if agent_runtime_changed:
        try:
            await rebuild_agent_instances()
        except BaseException as exc:
            _restore_instance_config(previous)
            if lightrag_runtime_changed:
                try:
                    await restart_lightrag(previous.lightrag)
                except Exception as rollback_error:
                    logger.exception("failed to roll back LightRAG after agent rebuild failure")
                    exc.add_note(f"LightRAG rollback also failed: {rollback_error}")
            raise
        logger.info("instance config applied and agent instances rebuilt")
    return InstanceConfigApplyResult(
        config=_instance_config_from_global(get_config()),
        restarted=agent_runtime_changed or lightrag_runtime_changed,
    )


def _apply_instance_config(file_cfg: GlobalConfig) -> tuple[bool, bool]:
    current = get_config()
    agent_runtime_changed = _agent_runtime_config_changed(current, file_cfg)
    lightrag_changed = current.lightrag != file_cfg.lightrag
    lightrag_runtime_changed = _lightrag_runtime_config_changed(current.lightrag, file_cfg.lightrag)
    if not agent_runtime_changed and not lightrag_changed:
        return False, False

    current.agents = _copy_agents(file_cfg.agents)
    current.agent_pool = _copy_agent_pool(file_cfg.agent_pool)
    current.agent_runtime = _copy_agent_runtime(file_cfg.agent_runtime)
    current.lightrag = _copy_lightrag(file_cfg.lightrag)
    return agent_runtime_changed, lightrag_runtime_changed


def _agent_runtime_config_changed(current: GlobalConfig, next_cfg: GlobalConfig) -> bool:
    return (
        current.agents != next_cfg.agents
        or current.agent_pool != next_cfg.agent_pool
        or current.agent_runtime != next_cfg.agent_runtime
    )


def _lightrag_runtime_config_changed(current: LightRAGConfig, next_cfg: LightRAGConfig) -> bool:
    retrieval_fields = {"graph_matches", "chunk_matches"}
    return current.model_dump(exclude=retrieval_fields) != next_cfg.model_dump(exclude=retrieval_fields)


async def _ensure_embedding_storage_compatible(current: LightRAGConfig, next_cfg: LightRAGConfig) -> None:
    embedding_changed = (
        current.embedding_api != next_cfg.embedding_api
        or current.embedding_model != next_cfg.embedding_model
        or current.embedding_dim != next_cfg.embedding_dim
    )
    if not embedding_changed:
        return

    async with lightrag_client() as rag:
        status_counts = await rag.get_processing_status()
    if any(int(count) > 0 for count in status_counts.values()):
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST.value,
            detail="embedding API, model, and dimension cannot change while LightRAG documents exist",
        )


def _copy_agents(agents: dict[str, AgentConfig]) -> dict[str, AgentConfig]:
    return {code: agent.model_copy(deep=True) for code, agent in agents.items()}


def _copy_agent_pool(agent_pool: AgentPoolConfig) -> AgentPoolConfig:
    return agent_pool.model_copy(deep=True)


def _copy_agent_runtime(agent_runtime: AgentRuntimeConfig) -> AgentRuntimeConfig:
    return agent_runtime.model_copy(deep=True)


def _copy_lightrag(lightrag: LightRAGConfig) -> LightRAGConfig:
    return lightrag.model_copy(deep=True)


def _snapshot_instance_config(cfg: GlobalConfig) -> InstanceConfigSchema:
    return _instance_config_from_global(cfg).model_copy(deep=True)


def _restore_instance_config(snapshot: InstanceConfigSchema) -> None:
    current = get_config()
    current.agents = _copy_agents(snapshot.agents)
    current.agent_pool = _copy_agent_pool(snapshot.agent_pool)
    current.agent_runtime = _copy_agent_runtime(snapshot.agent_runtime)
    current.lightrag = _copy_lightrag(snapshot.lightrag)


async def rebuild_agent_instances() -> None:
    old_pool = get_agent_pool()
    new_pool = replace_agent_pool(AgentSessionPool())
    try:
        try:
            await stop_subagent_runtime()
        finally:
            await old_pool.stop()
        await start_subagent_runtime()
        await new_pool.start()
    except BaseException as exc:
        logger.exception("agent instance rebuild failed")
        try:
            await new_pool.stop()
        except Exception as cleanup_error:
            logger.exception("failed to stop replacement agent pool")
            exc.add_note(f"replacement agent pool cleanup also failed: {cleanup_error}")

        fallback_pool = replace_agent_pool(AgentSessionPool())
        try:
            await fallback_pool.start()
        except Exception as recovery_error:
            logger.exception("failed to start fallback agent pool")
            exc.add_note(f"fallback agent pool start also failed: {recovery_error}")
        try:
            await start_subagent_runtime()
        except Exception as recovery_error:
            logger.exception("failed to recover subagent runtime")
            exc.add_note(f"subagent runtime recovery also failed: {recovery_error}")
        raise


def _instance_config_from_global(cfg: GlobalConfig) -> InstanceConfigSchema:
    return InstanceConfigSchema(
        agents=cfg.agents,
        agent_pool=cfg.agent_pool,
        agent_runtime=cfg.agent_runtime,
        lightrag=cfg.lightrag,
    )
