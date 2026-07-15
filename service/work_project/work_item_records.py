"""Complete WorkItem record projections without user or runtime dependencies."""

from sqlmodel import select

from database import get_async_session
from model.agent.subordinates import AgentSubordinateTask
from model.work_project.assets import WorkProjectAsset
from model.work_project.evidence import WorkProjectEvidence
from model.work_project.workflow import (
    WorkProjectWorkItem,
    WorkProjectWorkItemDependency,
    WorkProjectWorkItemTarget,
    WorkProjectWorkLog,
)
from schema.work_project.assets import WorkProjectAssetSchema
from schema.work_project.evidence import WorkProjectEvidenceSchema
from schema.work_project.records import WorkProjectWorkItemRecordSchema
from schema.work_project.workflow import (
    WorkProjectWorkItemSchema,
    WorkProjectWorkItemStatus,
    WorkProjectWorkItemTargetSchema,
    WorkProjectWorkLogSchema,
)
from service.common.pagination import Page
from service.work_project.workflow import query_work_project_work_items


async def query_work_project_work_item_records(
    project_id: int,
    *,
    page: int,
    size: int,
    keyword: str = "",
    status: WorkProjectWorkItemStatus | None = None,
    assignee_agent_code: str = "",
) -> Page[WorkProjectWorkItemRecordSchema]:
    result = await query_work_project_work_items(
        project_id,
        page=page,
        size=size,
        keyword=keyword,
        status=status,
        assignee_agent_code=assignee_agent_code,
    )
    items = await _work_item_records(result.items)
    return Page(page=result.page, size=result.size, total=result.total, items=items)


async def get_work_project_work_item_record(
    project_id: int,
    work_item_id: int,
) -> WorkProjectWorkItemRecordSchema | None:
    async with get_async_session() as session:
        item = await session.get(WorkProjectWorkItem, work_item_id)
    if item is None or item.project_id != project_id:
        return None
    records = await _work_item_records([WorkProjectWorkItemSchema.model_validate(item)])
    return records[0]


async def _work_item_records(
    items: list[WorkProjectWorkItemSchema],
) -> list[WorkProjectWorkItemRecordSchema]:
    ids = [item.id for item in items]
    async with get_async_session() as session:
        targets = list((await session.exec(select(WorkProjectWorkItemTarget).where(
            WorkProjectWorkItemTarget.work_item_id.in_(ids)
        ))).all()) if ids else []
        dependencies = list((await session.exec(select(WorkProjectWorkItemDependency).where(
            WorkProjectWorkItemDependency.work_item_id.in_(ids)
        ))).all()) if ids else []
        evidence = list((await session.exec(select(WorkProjectEvidence).where(
            WorkProjectEvidence.work_item_id.in_(ids)
        ))).all()) if ids else []
        logs = list((await session.exec(select(WorkProjectWorkLog).where(
            WorkProjectWorkLog.work_item_id.in_(ids)
        ).order_by(WorkProjectWorkLog.id.desc()))).all()) if ids else []
        runs = list((await session.exec(select(AgentSubordinateTask).where(
            AgentSubordinateTask.work_item_id.in_(ids)
        ))).all()) if ids else []
        asset_ids = {target.asset_id for target in targets}
        assets = {
            item.id: item
            for item in (await session.exec(select(WorkProjectAsset).where(
                WorkProjectAsset.id.in_(asset_ids)
            ))).all()
        } if asset_ids else {}
    return [
        _work_item_record(item, targets, dependencies, evidence, logs, runs, assets)
        for item in items
    ]


def _work_item_record(item, targets, dependencies, evidence, logs, runs, assets):
    item_targets = [value for value in targets if value.work_item_id == item.id]
    return WorkProjectWorkItemRecordSchema(
        work_item=item,
        targets=[WorkProjectWorkItemTargetSchema.model_validate(value) for value in item_targets],
        target_assets=[
            WorkProjectAssetSchema.model_validate(assets[value.asset_id])
            for value in item_targets
            if value.asset_id in assets
        ],
        dependency_ids=[value.depends_on_id for value in dependencies if value.work_item_id == item.id],
        evidence=[
            WorkProjectEvidenceSchema.model_validate(value)
            for value in evidence
            if value.work_item_id == item.id
        ],
        recent_logs=[
            WorkProjectWorkLogSchema.model_validate(value)
            for value in logs
            if value.work_item_id == item.id
        ][:20],
        work_log_total=sum(value.work_item_id == item.id for value in logs),
        subordinate_run_ids=[value.run_id for value in runs if value.work_item_id == item.id],
    )
