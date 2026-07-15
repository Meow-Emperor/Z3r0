from datetime import datetime
from uuid import uuid4

from sqlalchemy import Integer, String, cast, delete, func, or_, tuple_, update
from sqlmodel import select

from core.agent.constants import DEFAULT_AGENT_CODE
from database import get_async_session
from logger import get_logger
from model.agent.sessions import AgentSessionMeta
from model.egress_proxy.proxies import EgressProxy
from model.host.hosts import ManagedHost
from model.sandbox.containers import SandboxContainer
from model.sandbox.images import SandboxImage
from model.system_user.users import SystemUser
from model.work_project.assets import WorkProjectAsset
from model.work_project.findings import WorkProjectFinding
from model.work_project.graph import WorkProjectAttackPath, WorkProjectAttackPathStep
from model.work_project.projects import WorkProject, WorkProjectOwner
from model.work_project.workflow import WorkProjectWorkItem, WorkProjectWorkItemTarget
from schema.agent.sessions import AgentSessionSummarySchema, SessionType
from schema.sandbox.containers import SandboxContainerSchema, SandboxContainerStatus
from schema.system_user.users import SystemUserRole
from schema.work_project.assets import WorkProjectAssetOrigin, WorkProjectAssetRequest, WorkProjectAssetScope
from schema.work_project.findings import WorkProjectFindingVerification
from schema.work_project.graph import WorkProjectAttackPathStepSchema, WorkProjectAttackPathStatus, derive_attack_path_status
from schema.work_project.projects import (
    CreateWorkProjectRequest,
    UpdateWorkProjectMetadataRequest,
    WorkProjectOwnerSchema,
    WorkProjectSchema,
    WorkProjectSummarySchema,
    WorkProjectStatus,
)
from schema.work_project.workflow import WorkProjectTargetStatus, WorkProjectWorkItemStatus
from service.agent.sessions import cancel_sessions, delete_session, ensure_sdk_session_row, list_sessions
from service.common.pagination import Page, paginate_statement
from service.sandbox.egress import sandbox_egress_label
from service.sandbox.records import sandbox_container_schema
from service.sandbox.status import status_generation
from service.sandbox.types import SandboxContainerRecord
from service.system_user.locking import lock_system_user_lifecycle
from service.work_project.assets import apply_asset_request


logger = get_logger(__name__)
_PROJECT_SESSION_TITLE_REGEX = r"^session ([0-9]+)$"


class WorkProjectSessionCreateResult:
    def __init__(self, session_id: str = "", not_found: bool = False, inactive: bool = False) -> None:
        self.session_id = session_id
        self.not_found = not_found
        self.inactive = inactive


class WorkProjectMetadataValidationError(ValueError):
    pass


def can_create_work_project_session(status: WorkProjectStatus) -> bool:
    return status == WorkProjectStatus.ACTIVE


def can_cancel_work_project(status: WorkProjectStatus) -> bool:
    return status == WorkProjectStatus.ACTIVE


def can_retry_work_project(status: WorkProjectStatus) -> bool:
    return status == WorkProjectStatus.CANCELED


async def create_work_project(
    request: CreateWorkProjectRequest,
    *,
    user_id: int,
    user_role: SystemUserRole,
) -> WorkProjectSchema:
    now = datetime.now()
    project = WorkProject(
        name=request.name,
        description=request.description,
        sandbox_container_id=request.sandbox_container_id,
        status=WorkProjectStatus.ACTIVE,
        type=request.type,
        created_at=now,
        updated_at=now,
    )

    async with get_async_session() as session:
        validation_error = await _validate_work_project_metadata_for_write(
            session,
            request,
            user_id=user_id,
            user_role=user_role,
            project_id=None,
        )
        if validation_error:
            raise WorkProjectMetadataValidationError(validation_error)
        session.add(project)
        await session.flush()
        project_id = project.id or 0
        _set_project_owner_rows(session, project_id, request.owner_user_ids)
        _set_project_asset_rows(session, project_id, request.assets)
        await session.commit()
        await session.refresh(project)
        schema = await _project_schema(session, project, user_id=user_id, user_role=user_role)

    logger.info("work project created: %s", project.id)
    return schema


async def get_work_project_for_user(
    id: int,
    user_id: int,
    user_role: SystemUserRole,
) -> WorkProjectSchema | None:
    async with get_async_session() as session:
        if not await _can_access_work_project_in_tx(session, id, user_id, user_role):
            return None
        project = await session.get(WorkProject, id)
        if project is None:
            return None
        return await _project_schema(session, project, user_id=user_id, user_role=user_role)


async def update_work_project_metadata(
    id: int,
    request: UpdateWorkProjectMetadataRequest,
    *,
    user_id: int,
    user_role: SystemUserRole,
) -> WorkProjectSchema | None:
    async with get_async_session() as session:
        validation_error = await _validate_work_project_metadata_for_write(
            session,
            request,
            user_id=user_id,
            user_role=user_role,
            project_id=id,
        )
        if validation_error:
            raise WorkProjectMetadataValidationError(validation_error)
        project = (await session.exec(
            select(WorkProject).where(WorkProject.id == id).with_for_update()
        )).first()
        if project is None:
            return None
        project.name = request.name
        project.description = request.description
        project.sandbox_container_id = request.sandbox_container_id
        project.type = request.type
        project.updated_at = datetime.now()
        session.add(project)
        await _replace_project_owners(session, id, request.owner_user_ids)
        await _upsert_project_assets(session, id, request.assets)
        await _sync_project_session_sandbox_selection(session, id, request.sandbox_container_id)
        await session.commit()
        await session.refresh(project)
        schema = await _project_schema(session, project, user_id=user_id, user_role=user_role)

    logger.info("work project metadata updated: %s", id)
    return schema


async def cancel_work_project(
    id: int,
    *,
    user_id: int,
    user_role: SystemUserRole,
) -> tuple[WorkProjectSchema | None, bool]:
    async with get_async_session() as session:
        project = (await session.exec(
            select(WorkProject).where(WorkProject.id == id).with_for_update()
        )).first()
        if project is None:
            return None, False
        if not can_cancel_work_project(project.status):
            return await _project_schema(session, project, user_id=user_id, user_role=user_role), False

        project.status = WorkProjectStatus.CANCELED
        project.updated_at = datetime.now()
        session.add(project)
        session_ids = list((await session.exec(
            select(AgentSessionMeta.session_id).where(AgentSessionMeta.project_id == id)
        )).all())
        await session.commit()
        await session.refresh(project)
        schema = await _project_schema(session, project, user_id=user_id, user_role=user_role)

    await cancel_sessions(session_ids, "WorkProject canceled.")
    logger.info("work project canceled: %s", id)
    return schema, True


async def delete_work_project(id: int) -> bool:
    async with get_async_session() as session:
        project = (await session.exec(
            select(WorkProject).where(WorkProject.id == id).with_for_update()
        )).first()
        if project is None:
            return False
        project.status = WorkProjectStatus.CANCELED
        project.updated_at = datetime.now()
        session.add(project)
        session_ids = list((await session.exec(
            select(AgentSessionMeta.session_id).where(AgentSessionMeta.project_id == id)
        )).all())
        await session.commit()

    for session_id in session_ids:
        await delete_session(
            session_id,
            user_role=SystemUserRole.ADMIN,
            allow_project_session=True,
        )

    async with get_async_session() as session:
        project = (await session.exec(
            select(WorkProject).where(WorkProject.id == id).with_for_update()
        )).first()
        if project is None:
            return True
        await session.delete(project)
        await session.commit()

    logger.info("work project deleted: %s", id)
    return True


async def retry_work_project(
    id: int,
    *,
    user_id: int,
    user_role: SystemUserRole,
) -> tuple[WorkProjectSchema | None, bool]:
    async with get_async_session() as session:
        project = (await session.exec(
            select(WorkProject).where(WorkProject.id == id).with_for_update()
        )).first()
        if project is None:
            return None, False
        if not can_retry_work_project(project.status):
            return await _project_schema(session, project, user_id=user_id, user_role=user_role), False

        project.status = WorkProjectStatus.ACTIVE
        project.updated_at = datetime.now()
        session.add(project)
        await session.commit()
        await session.refresh(project)
        schema = await _project_schema(session, project, user_id=user_id, user_role=user_role)

    logger.debug("work project retried: %s", project.id)
    return schema, True


async def complete_work_project(project_id: int) -> str:
    async with get_async_session() as session:
        project = (await session.exec(
            select(WorkProject).where(WorkProject.id == project_id).with_for_update()
        )).one_or_none()
        if project is None:
            return "work project not found"
        if project.status != WorkProjectStatus.ACTIVE:
            return f"work project is {project.status}"
        open_work = (await session.exec(select(WorkProjectWorkItem.id).where(
            WorkProjectWorkItem.project_id == project_id,
            WorkProjectWorkItem.status.not_in({WorkProjectWorkItemStatus.COMPLETED, WorkProjectWorkItemStatus.CANCELED}),
        ).limit(1))).first()
        if open_work is not None:
            return "work project has non-terminal work items"
        suspected = (await session.exec(select(WorkProjectFinding.id).where(
            WorkProjectFinding.project_id == project_id,
            WorkProjectFinding.verification == WorkProjectFindingVerification.SUSPECTED,
        ).limit(1))).first()
        if suspected is not None:
            return "work project has suspected findings that require validation, refutation, or deferral"
        in_scope_assets = set((await session.exec(select(WorkProjectAsset.id).where(
            WorkProjectAsset.project_id == project_id,
            WorkProjectAsset.scope == WorkProjectAssetScope.IN_SCOPE,
        ))).all())
        covered_assets = set((await session.exec(
            select(WorkProjectWorkItemTarget.asset_id)
            .join(WorkProjectWorkItem, WorkProjectWorkItem.id == WorkProjectWorkItemTarget.work_item_id)
            .where(
                WorkProjectWorkItem.project_id == project_id,
                WorkProjectWorkItem.status == WorkProjectWorkItemStatus.COMPLETED,
                WorkProjectWorkItemTarget.status.in_({WorkProjectTargetStatus.COVERED, WorkProjectTargetStatus.DEFERRED}),
            )
        )).all())
        if not in_scope_assets.issubset(covered_assets):
            return "work project has in-scope assets without a covered or deferred target conclusion"
        paths = list((await session.exec(select(WorkProjectAttackPath).where(WorkProjectAttackPath.project_id == project_id))).all())
        steps = list((await session.exec(select(WorkProjectAttackPathStep).where(WorkProjectAttackPathStep.project_id == project_id))).all())
        steps_by_path: dict[int, list[WorkProjectAttackPathStepSchema]] = {}
        for step in steps:
            steps_by_path.setdefault(step.path_id, []).append(WorkProjectAttackPathStepSchema.model_validate(step))
        for path in paths:
            status = derive_attack_path_status(steps_by_path.get(path.id or 0, []), path.archived_at)
            if status not in {
                WorkProjectAttackPathStatus.VALIDATED,
                WorkProjectAttackPathStatus.REFUTED,
                WorkProjectAttackPathStatus.ARCHIVED,
            }:
                return "work project has unresolved attack paths"
        project.status = WorkProjectStatus.COMPLETED
        project.updated_at = datetime.now()
        session.add(project)
        await session.commit()
    return ""


async def query_work_projects_for_user(
    page: int,
    size: int,
    keyword: str,
    user_id: int,
    user_role: SystemUserRole,
) -> Page[WorkProjectSummarySchema]:
    return await _query_work_projects(
        page=page,
        size=size,
        keyword=keyword,
        owner_user_id=None if user_role == SystemUserRole.ADMIN else user_id,
        user_id=user_id,
        user_role=user_role,
    )


async def create_work_project_session(
    project_id: int,
    owner_id: int,
    user_role: SystemUserRole,
) -> WorkProjectSessionCreateResult:
    session_id = str(uuid4())
    async with get_async_session() as session:
        await lock_system_user_lifecycle(session, owner_id)
        if await session.get(SystemUser, owner_id) is None:
            return WorkProjectSessionCreateResult(not_found=True)
        project = (await session.exec(
            select(WorkProject)
            .where(WorkProject.id == project_id)
            .with_for_update()
        )).first()
        if project is None:
            return WorkProjectSessionCreateResult(not_found=True)
        if (
            user_role != SystemUserRole.ADMIN
            and await session.get(WorkProjectOwner, (project_id, owner_id)) is None
        ):
            return WorkProjectSessionCreateResult(not_found=True)
        if not can_create_work_project_session(project.status):
            return WorkProjectSessionCreateResult(inactive=True)
        title = await _next_project_session_title(session, project_id)
        sandbox_container_id, sandbox_generation = await _project_sandbox_selection_in_tx(session, project_id)

        await ensure_sdk_session_row(session, session_id)
        session.add(AgentSessionMeta(
            session_id=session_id,
            session_type=SessionType.PROJECT,
            title=title,
            agent_code=DEFAULT_AGENT_CODE,
            owner_id=owner_id,
            project_id=project_id,
            selected_sandbox_container_id=sandbox_container_id,
            selected_sandbox_container_generation=sandbox_generation,
        ))
        await session.commit()

    logger.info("work project session created: project=%s session=%s", project_id, session_id)
    return WorkProjectSessionCreateResult(session_id=session_id)


async def list_work_project_sessions(
    project_id: int,
    user_id: int,
    user_role: SystemUserRole,
    page: int,
    size: int,
) -> Page[AgentSessionSummarySchema] | None:
    if not await can_access_work_project(project_id, user_id, user_role):
        return None
    return await list_sessions(
        page=page,
        size=size,
        user_id=user_id,
        user_role=user_role,
        project_id=project_id,
    )


async def can_run_work_project_session(
    session_id: str,
    user_id: int,
    user_role: SystemUserRole,
) -> bool:
    async with get_async_session() as session:
        meta = await session.get(AgentSessionMeta, session_id)
        if meta is None:
            return False
        if meta.project_id is None:
            return True
        if not await _can_access_work_project_in_tx(session, meta.project_id, user_id, user_role):
            return False
        project = await session.get(WorkProject, meta.project_id)
        return project is not None and can_create_work_project_session(project.status)


async def delete_work_project_session(
    project_id: int,
    session_id: str,
    user_id: int,
    user_role: SystemUserRole,
) -> bool | None:
    if not await can_access_work_project(project_id, user_id, user_role):
        return None
    async with get_async_session() as session:
        meta = await session.get(AgentSessionMeta, session_id)
        if meta is None or meta.project_id != project_id:
            return None if await session.get(WorkProject, project_id) is None else False
    return await delete_session(
        session_id,
        user_id=user_id,
        user_role=user_role,
        allow_project_session=True,
    )


async def work_project_allows_sandbox_container(
    project_id: int,
    sandbox_container_id: int,
    user_id: int,
    user_role: SystemUserRole,
) -> bool:
    if not await can_access_work_project(project_id, user_id, user_role):
        return False
    async with get_async_session() as session:
        bound_container_id = await _sandbox_container_id_for_project_in_tx(session, project_id)
        if bound_container_id != sandbox_container_id:
            return False
        container = await session.get(SandboxContainer, sandbox_container_id)
        return container is not None and container.status == SandboxContainerStatus.RUNNING


async def sandbox_container_id_for_work_project(project_id: int) -> int | None:
    async with get_async_session() as session:
        return await _sandbox_container_id_for_project_in_tx(session, project_id)


async def _project_schema(
    session,
    project: WorkProject,
    *,
    user_id: int | None = None,
    user_role: SystemUserRole | None = None,
) -> WorkProjectSchema:
    project_id = project.id or 0
    assets = await _scope_assets_for_project(session, project_id)
    metrics = await _project_metrics(session, project_id)
    return WorkProjectSchema(**_project_schema_payload(
        project=project,
        owners=await _owners_for_project(session, project_id),
        sandbox_container=await _sandbox_container_for_project(
            session,
            project_id,
            user_id=user_id,
            user_role=user_role,
        ),
        assets=assets,
        metrics=metrics,
        session_count=await _session_count_in_tx(session, project_id),
    ))


async def _session_count_in_tx(session, project_id: int) -> int:
    if project_id <= 0:
        return 0
    return (await _session_counts(session, [project_id])).get(project_id, 0)


async def _next_project_session_title(session, project_id: int) -> str:
    title_number = cast(
        func.substring(AgentSessionMeta.title, _PROJECT_SESSION_TITLE_REGEX),
        Integer,
    )
    max_number = (await session.exec(
        select(func.max(title_number)).where(
            AgentSessionMeta.project_id == project_id,
            AgentSessionMeta.title.op("~")(_PROJECT_SESSION_TITLE_REGEX),
        )
    )).one() or 0
    return f"session {max_number + 1}"


async def _session_counts(session, project_ids: list[int]) -> dict[int, int]:
    ids = [project_id for project_id in project_ids if project_id > 0]
    if not ids:
        return {}
    rows = (await session.exec(
        select(AgentSessionMeta.project_id, func.count())
        .where(AgentSessionMeta.project_id.in_(ids))
        .group_by(AgentSessionMeta.project_id)
    )).all()
    return {int(project_id): int(count) for project_id, count in rows if project_id is not None}


async def _query_work_projects(
    page: int,
    size: int,
    keyword: str,
    owner_user_id: int | None = None,
    user_id: int | None = None,
    user_role: SystemUserRole | None = None,
) -> Page[WorkProjectSummarySchema]:
    statement = select(WorkProject).order_by(WorkProject.id)

    keyword = keyword.strip()
    if keyword:
        pattern = f"%{keyword}%"
        statement = statement.where(
            or_(
                WorkProject.name.ilike(pattern),
                WorkProject.description.ilike(pattern),
                cast(WorkProject.status, String).ilike(pattern),
                cast(WorkProject.type, String).ilike(pattern),
            )
        )
    if owner_user_id is not None:
        statement = statement.join(
            WorkProjectOwner,
            WorkProjectOwner.project_id == WorkProject.id,
        ).where(WorkProjectOwner.user_id == owner_user_id)
    page_result = await paginate_statement(statement, page=page, size=size)
    projects = page_result.items

    async with get_async_session() as session:
        counts = await _session_counts(session, [project.id or 0 for project in projects])
        owners = await _owners_by_project(session, [project.id or 0 for project in projects])
        sandbox_container_by_project = await _sandbox_container_by_project(
            session,
            [project.id or 0 for project in projects],
            user_id=user_id,
            user_role=user_role,
        )
        items = [
            WorkProjectSummarySchema(**_project_summary_payload(
                project=project,
                owners=owners.get(project.id or 0, []),
                sandbox_container=sandbox_container_by_project.get(project.id or 0),
                metrics=await _project_metrics(session, project.id or 0),
                session_count=counts.get(project.id or 0, 0),
            ))
            for project in projects
        ]
    return Page(page=page_result.page, size=page_result.size, total=page_result.total, items=items)


def _project_schema_payload(
    project: WorkProject,
    owners: list[WorkProjectOwnerSchema],
    sandbox_container: SandboxContainerSchema | None,
    assets: list[WorkProjectAsset],
    metrics: dict[str, int],
    session_count: int,
) -> dict[str, object]:
    return {
        **_project_summary_payload(
            project=project,
            owners=owners,
            sandbox_container=sandbox_container,
            metrics=metrics,
            session_count=session_count,
        ),
        "assets": assets,
    }


def _project_summary_payload(
    project: WorkProject,
    owners: list[WorkProjectOwnerSchema],
    sandbox_container: SandboxContainerSchema | None,
    metrics: dict[str, int],
    session_count: int,
) -> dict[str, object]:
    return {
        "id": project.id or 0,
        "name": project.name,
        "description": project.description,
        "owner_user_ids": [owner.id for owner in owners],
        "owners": owners,
        "sandbox_container_id": sandbox_container.id if sandbox_container is not None else None,
        "sandbox_container": sandbox_container,
        "asset_count": metrics["asset_count"],
        "in_scope_asset_count": metrics["in_scope_asset_count"],
        "untouched_asset_count": metrics["untouched_asset_count"],
        "work_item_count": metrics["work_item_count"],
        "active_work_item_count": metrics["active_work_item_count"],
        "blocked_work_item_count": metrics["blocked_work_item_count"],
        "validated_finding_count": metrics["validated_finding_count"],
        "active_attack_path_count": metrics["active_attack_path_count"],
        "session_count": session_count,
        "status": project.status,
        "can_create_session": can_create_work_project_session(project.status),
        "can_cancel": can_cancel_work_project(project.status),
        "can_retry": can_retry_work_project(project.status),
        "type": project.type,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


async def _owners_by_project(session, project_ids: list[int]) -> dict[int, list[WorkProjectOwnerSchema]]:
    ids = [project_id for project_id in project_ids if project_id > 0]
    if not ids:
        return {}
    rows = (await session.exec(
        select(WorkProjectOwner, SystemUser)
        .join(SystemUser, SystemUser.id == WorkProjectOwner.user_id)
        .where(WorkProjectOwner.project_id.in_(ids))
        .order_by(WorkProjectOwner.project_id, WorkProjectOwner.position, WorkProjectOwner.user_id)
    )).all()
    result: dict[int, list[WorkProjectOwnerSchema]] = {project_id: [] for project_id in ids}
    for owner, user in rows:
        if user.id is None:
            continue
        result.setdefault(owner.project_id, []).append(_owner_schema(user))
    return result


async def _owners_for_project(session, project_id: int) -> list[WorkProjectOwnerSchema]:
    return (await _owners_by_project(session, [project_id])).get(project_id, [])


async def _sandbox_container_by_project(
    session,
    project_ids: list[int],
    *,
    user_id: int | None = None,
    user_role: SystemUserRole | None = None,
) -> dict[int, SandboxContainerSchema | None]:
    ids = [project_id for project_id in project_ids if project_id > 0]
    if not ids:
        return {}
    rows = (await session.exec(
        select(
            WorkProject,
            SandboxContainer,
            SandboxImage.image_name,
            SandboxImage.supports_tor,
            SandboxImage.control_proxy_port,
            SystemUser.username,
            ManagedHost.ip_address,
            EgressProxy,
        )
        .join(SandboxContainer, SandboxContainer.id == WorkProject.sandbox_container_id)
        .join(SandboxImage, SandboxImage.id == SandboxContainer.image_id)
        .join(SystemUser, SystemUser.id == SandboxContainer.owner_id)
        .join(ManagedHost, ManagedHost.id == SandboxContainer.host_id)
        .outerjoin(EgressProxy, EgressProxy.id == SandboxContainer.egress_proxy_id)
        .where(WorkProject.id.in_(ids))
        .order_by(WorkProject.id)
    )).all()
    result: dict[int, SandboxContainerSchema | None] = dict.fromkeys(ids)
    for (
        project,
        container,
        image_name,
        supports_tor,
        control_proxy_port,
        owner_username,
        host_ip_address,
        egress_proxy,
    ) in rows:
        record = SandboxContainerRecord(
            container=container,
            image_name=image_name,
            supports_tor=supports_tor,
            control_proxy_port=control_proxy_port,
            owner_username=owner_username,
            host_ip_address=host_ip_address,
            egress_label=sandbox_egress_label(container, egress_proxy),
        )
        result[project.id or 0] = sandbox_container_schema(record, user_id=user_id, user_role=user_role)
    return result


async def _sandbox_container_for_project(
    session,
    project_id: int,
    *,
    user_id: int | None = None,
    user_role: SystemUserRole | None = None,
) -> SandboxContainerSchema | None:
    return (await _sandbox_container_by_project(
        session,
        [project_id],
        user_id=user_id,
        user_role=user_role,
    )).get(project_id)


async def _project_metrics(session, project_id: int) -> dict[str, int]:
    asset_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectAsset).where(WorkProjectAsset.project_id == project_id)
    )).one())
    in_scope_asset_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectAsset).where(
            WorkProjectAsset.project_id == project_id,
            WorkProjectAsset.scope == WorkProjectAssetScope.IN_SCOPE,
        )
    )).one())
    touched_asset_ids = select(WorkProjectWorkItemTarget.asset_id).join(
        WorkProjectWorkItem,
        WorkProjectWorkItem.id == WorkProjectWorkItemTarget.work_item_id,
    ).where(WorkProjectWorkItem.project_id == project_id)
    untouched_asset_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectAsset).where(
            WorkProjectAsset.project_id == project_id,
            WorkProjectAsset.scope == WorkProjectAssetScope.IN_SCOPE,
            WorkProjectAsset.id.not_in(touched_asset_ids),
        )
    )).one())
    work_item_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectWorkItem).where(WorkProjectWorkItem.project_id == project_id)
    )).one())
    active_work_item_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectWorkItem).where(
            WorkProjectWorkItem.project_id == project_id,
            WorkProjectWorkItem.status.in_({WorkProjectWorkItemStatus.ACTIVE, WorkProjectWorkItemStatus.REVIEW}),
        )
    )).one())
    blocked_work_item_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectWorkItem).where(
            WorkProjectWorkItem.project_id == project_id,
            WorkProjectWorkItem.status == WorkProjectWorkItemStatus.BLOCKED,
        )
    )).one())
    validated_finding_count = int((await session.exec(
        select(func.count()).select_from(WorkProjectFinding).where(
            WorkProjectFinding.project_id == project_id,
            WorkProjectFinding.verification == WorkProjectFindingVerification.VALIDATED,
        )
    )).one())
    paths = list((await session.exec(select(WorkProjectAttackPath).where(
        WorkProjectAttackPath.project_id == project_id
    ))).all())
    steps = list((await session.exec(select(WorkProjectAttackPathStep).where(
        WorkProjectAttackPathStep.project_id == project_id
    ))).all())
    steps_by_path: dict[int, list[WorkProjectAttackPathStepSchema]] = {}
    for step in steps:
        steps_by_path.setdefault(step.path_id, []).append(WorkProjectAttackPathStepSchema.model_validate(step))
    resolved_path_statuses = {
        WorkProjectAttackPathStatus.VALIDATED,
        WorkProjectAttackPathStatus.REFUTED,
        WorkProjectAttackPathStatus.ARCHIVED,
    }
    active_attack_path_count = sum(
        derive_attack_path_status(steps_by_path.get(path.id or 0, []), path.archived_at) not in resolved_path_statuses
        for path in paths
    )
    return {
        "asset_count": asset_count,
        "in_scope_asset_count": in_scope_asset_count,
        "untouched_asset_count": untouched_asset_count,
        "work_item_count": work_item_count,
        "active_work_item_count": active_work_item_count,
        "blocked_work_item_count": blocked_work_item_count,
        "validated_finding_count": validated_finding_count,
        "active_attack_path_count": active_attack_path_count,
    }


async def _scope_assets_for_project(session, project_id: int) -> list[WorkProjectAsset]:
    return list((await session.exec(
        select(WorkProjectAsset)
        .where(
            WorkProjectAsset.project_id == project_id,
            WorkProjectAsset.origin == WorkProjectAssetOrigin.DECLARED,
            WorkProjectAsset.scope == WorkProjectAssetScope.IN_SCOPE,
        )
        .order_by(WorkProjectAsset.id)
    )).all())


def _owner_schema(user: SystemUser) -> WorkProjectOwnerSchema:
    return WorkProjectOwnerSchema(
        id=user.id or 0,
        role=user.role,
        username=user.username,
    )


def _set_project_owner_rows(session, project_id: int, owner_user_ids: list[int]) -> None:
    for position, user_id in enumerate(owner_user_ids):
        session.add(WorkProjectOwner(project_id=project_id, user_id=user_id, position=position))


async def _replace_project_owners(session, project_id: int, owner_user_ids: list[int]) -> None:
    await session.execute(delete(WorkProjectOwner).where(WorkProjectOwner.project_id == project_id))
    _set_project_owner_rows(session, project_id, owner_user_ids)


def _validate_work_project_metadata_static(
    request: CreateWorkProjectRequest | UpdateWorkProjectMetadataRequest,
) -> str:
    if not request.assets:
        return "at least one asset is required"
    duplicate_asset = _duplicate_asset_identity(request.assets)
    if duplicate_asset:
        return f"duplicate asset: {duplicate_asset}"
    return ""


async def _validate_work_project_metadata_for_write(
    session,
    request: CreateWorkProjectRequest | UpdateWorkProjectMetadataRequest,
    *,
    user_id: int,
    user_role: SystemUserRole,
    project_id: int | None,
) -> str:
    static_error = _validate_work_project_metadata_static(request)
    if static_error:
        return static_error
    if request.owner_user_ids:
        for owner_id in sorted(set(request.owner_user_ids)):
            await lock_system_user_lifecycle(session, owner_id)
        users = (await session.exec(
            select(SystemUser.id).where(SystemUser.id.in_(request.owner_user_ids))
        )).all()
        missing_owner_ids = sorted(set(request.owner_user_ids) - set(users))
        if missing_owner_ids:
            return f"selected owners not found: {', '.join(str(id) for id in missing_owner_ids)}"

    if request.sandbox_container_id is None:
        return ""
    return await _validate_project_sandbox_container(
        session,
        request.sandbox_container_id,
        user_id=user_id,
        user_role=user_role,
        project_id=project_id,
    )


async def _validate_project_sandbox_container(
    session,
    sandbox_container_id: int,
    *,
    user_id: int,
    user_role: SystemUserRole,
    project_id: int | None,
) -> str:
    statement = (
        select(SandboxContainer)
        .where(SandboxContainer.id == sandbox_container_id)
        .with_for_update()
    )
    container = (await session.exec(statement)).first()
    if container is None:
        return "selected sandbox container not found"
    if user_role != SystemUserRole.ADMIN and container.owner_id != user_id:
        return "selected sandbox container is not available to current user"

    bound_to_current_project = project_id is not None and (await session.exec(
        select(WorkProject.id).where(
            WorkProject.id == project_id,
            WorkProject.sandbox_container_id == sandbox_container_id,
        )
    )).first() is not None

    binding_statement = (
        select(WorkProject.id)
        .where(WorkProject.sandbox_container_id == sandbox_container_id)
        .limit(1)
    )
    if project_id is not None:
        binding_statement = binding_statement.where(WorkProject.id != project_id)
    bound_project_id = (await session.exec(binding_statement)).first()
    if bound_project_id is not None and bound_project_id != project_id:
        return "selected sandbox container is already bound to another work project"
    if container.status != SandboxContainerStatus.RUNNING and not bound_to_current_project:
        return "selected sandbox container is not running"
    return ""


async def _sandbox_container_id_for_project_in_tx(session, project_id: int) -> int | None:
    project = await session.get(WorkProject, project_id)
    return project.sandbox_container_id if project is not None else None


async def _project_sandbox_selection_in_tx(session, project_id: int) -> tuple[int | None, int]:
    sandbox_container_id = await _sandbox_container_id_for_project_in_tx(session, project_id)
    if sandbox_container_id is None:
        return None, 0
    container = await session.get(SandboxContainer, sandbox_container_id)
    if container is None:
        return None, 0
    return sandbox_container_id, status_generation(container)


async def _sync_project_session_sandbox_selection(
    session,
    project_id: int,
    sandbox_container_id: int | None,
) -> None:
    generation = 0
    if sandbox_container_id is not None:
        container = await session.get(SandboxContainer, sandbox_container_id)
        if container is not None:
            generation = status_generation(container)
    await session.execute(
        update(AgentSessionMeta)
        .where(AgentSessionMeta.project_id == project_id)
        .values(
            selected_sandbox_container_id=sandbox_container_id,
            selected_sandbox_container_generation=generation,
        )
    )


def _set_project_asset_rows(session, project_id: int, assets: list[WorkProjectAssetRequest]) -> None:
    now = datetime.now()
    seen: set[tuple] = set()
    for request in assets:
        if request.identity in seen:
            continue
        seen.add(request.identity)
        asset = WorkProjectAsset(
            project_id=project_id,
            origin=WorkProjectAssetOrigin.DECLARED,
            created_at=now,
            updated_at=now,
        )
        apply_asset_request(asset, request.model_copy(update={"scope": WorkProjectAssetScope.IN_SCOPE}), now)
        session.add(asset)


async def _upsert_project_assets(session, project_id: int, assets: list[WorkProjectAssetRequest]) -> None:
    identities = [request.identity for request in assets]
    rows = (await session.exec(
        select(WorkProjectAsset).where(
            WorkProjectAsset.project_id == project_id,
            or_(
                WorkProjectAsset.origin == WorkProjectAssetOrigin.DECLARED,
                tuple_(WorkProjectAsset.kind, WorkProjectAsset.locator).in_(identities),
            ),
        )
    )).all()
    existing = {(asset.kind, asset.locator): asset for asset in rows}
    seen: set[tuple] = set()
    now = datetime.now()
    for request in assets:
        if request.identity in seen:
            continue
        seen.add(request.identity)
        asset = existing.get(request.identity)
        if asset is None:
            asset = WorkProjectAsset(project_id=project_id, created_at=now, updated_at=now)
            existing[request.identity] = asset
            session.add(asset)
            apply_asset_request(asset, request.model_copy(update={"scope": WorkProjectAssetScope.IN_SCOPE}), now)
        else:
            apply_asset_request(asset, request.model_copy(update={"scope": WorkProjectAssetScope.IN_SCOPE}), now)
        asset.origin = WorkProjectAssetOrigin.DECLARED
        asset.created_by_agent_code = ""
        asset.created_from_session_id = ""
    for asset in rows:
        if asset.origin != WorkProjectAssetOrigin.DECLARED or (asset.kind, asset.locator) in seen:
            continue
        asset.scope = WorkProjectAssetScope.OUT_OF_SCOPE
        asset.updated_at = now
        session.add(asset)


def _duplicate_asset_identity(assets: list[WorkProjectAssetRequest]) -> str:
    seen: set[tuple] = set()
    for asset in assets:
        if asset.identity in seen:
            return f"{asset.kind.value}:{asset.locator}"
        seen.add(asset.identity)
    return ""


async def can_access_work_project(
    project_id: int,
    user_id: int,
    user_role: SystemUserRole,
) -> bool:
    async with get_async_session() as session:
        return await _can_access_work_project_in_tx(session, project_id, user_id, user_role)


async def _can_access_work_project_in_tx(
    session,
    project_id: int,
    user_id: int,
    user_role: SystemUserRole,
) -> bool:
    if await session.get(WorkProject, project_id) is None:
        return False
    if user_role == SystemUserRole.ADMIN:
        return True
    return await session.get(WorkProjectOwner, (project_id, user_id)) is not None
