import { Progress, Tag } from "@douyinfe/semi-ui";
import { ClipboardList, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { WORK_PROJECT_ASSET_TYPE } from "../../shared/api/contract";
import type { WorkProject, WorkProjectAsset } from "../../shared/api/types";
import { formatDateTime } from "../../shared/lib/date";
import {
  WORK_PROJECT_ASSET_TYPE_LABEL,
  WORK_PROJECT_STATUS_COLOR,
  WORK_PROJECT_STATUS_LABEL,
  WORK_PROJECT_TASK_STATUS_COLOR,
  WORK_PROJECT_TASK_STATUS_LABEL,
  WORK_PROJECT_TYPE_COLOR,
  WORK_PROJECT_TYPE_LABEL,
} from "../../shared/lib/labels";

export function workProjectOwnerNames(project: WorkProject): string {
  return project.owners.map((owner) => owner.username).join(", ") || "No owners";
}

export function WorkProjectTypeTag({ project }: { project: WorkProject }) {
  return <Tag color={WORK_PROJECT_TYPE_COLOR[project.type]}>{WORK_PROJECT_TYPE_LABEL[project.type]}</Tag>;
}

export function WorkProjectStatusTag({ project }: { project: WorkProject }) {
  return <Tag color={WORK_PROJECT_STATUS_COLOR[project.status]}>{WORK_PROJECT_STATUS_LABEL[project.status]}</Tag>;
}

export function WorkProjectAssets({ project, className }: { project: WorkProject; className: string }) {
  return (
    <div className={className}>
      {project.assets.map((asset) => (
        <div key={asset.id}>
          <strong>{formatWorkProjectAsset(asset)}</strong>
          <span>{WORK_PROJECT_ASSET_TYPE_LABEL[asset.type]}</span>
        </div>
      ))}
    </div>
  );
}

export function formatWorkProjectAsset(asset: WorkProjectAsset): string {
  if (asset.type === WORK_PROJECT_ASSET_TYPE.BINARY) return asset.path || WORK_PROJECT_ASSET_TYPE_LABEL[asset.type];
  const host = asset.host || WORK_PROJECT_ASSET_TYPE_LABEL[asset.type];
  const port = asset.port ? `:${asset.port}` : "";
  return `${host}${port}`;
}

export function WorkProjectTasks({
  project,
  className,
  rowClassName,
  showIcon = false,
}: {
  project: WorkProject;
  className: string;
  rowClassName: string;
  showIcon?: boolean;
}) {
  return (
    <div className={className}>
      {project.tasks.map((task) => {
        const taskRowClassName = showIcon ? rowClassName : `${rowClassName} work-project-task-row-no-icon`;
        return (
          <div key={task.id ?? task.title} className={taskRowClassName}>
            {showIcon ? <ClipboardList size={14} /> : null}
            <span className="work-project-task-title">{task.title}</span>
            <Tag color={WORK_PROJECT_TASK_STATUS_COLOR[task.status]}>{WORK_PROJECT_TASK_STATUS_LABEL[task.status]}</Tag>
            <Progress percent={task.progress} size="small" showInfo={false} />
          </div>
        );
      })}
    </div>
  );
}

export function WorkProjectSummaries({
  project,
  className,
  rowClassName,
  progressClassName,
  blockClassName,
  showIcon = false,
}: {
  project: WorkProject;
  className: string;
  rowClassName: string;
  progressClassName: string;
  blockClassName: string;
  showIcon?: boolean;
}) {
  return (
    <div className={className}>
      {project.agent_summaries.map((summary) => (
        <article key={summary.agent_code} className={rowClassName}>
          <header>
            {showIcon ? <UserRound size={14} /> : null}
            <strong>{summary.agent_code}</strong>
            {summary.updated_at ? <span>{formatDateTime(summary.updated_at)}</span> : null}
          </header>
          {summary.summary?.task_id || summary.summary?.task_title ? (
            <div className={progressClassName}>
              <span>{summary.summary.task_id || summary.summary.task_title}</span>
              <Progress percent={summary.summary.progress ?? 0} size="small" showInfo />
            </div>
          ) : null}
          <SummaryBlock className={blockClassName} label="Status" value={summary.summary?.status} />
          <SummaryList className={blockClassName} label="Findings" values={summary.summary?.findings ?? []} />
          <SummaryList className={blockClassName} label="Decisions" values={summary.summary?.decisions ?? []} />
          <SummaryList className={blockClassName} label="Blockers" values={summary.summary?.blockers ?? []} />
          <SummaryList className={blockClassName} label="Next Steps" values={summary.summary?.next_steps ?? []} />
          <SummaryBlock className={blockClassName} label="Notes" value={summary.summary?.notes} />
        </article>
      ))}
    </div>
  );
}

export function WorkProjectPanel({
  title,
  empty,
  className,
  emptyClassName,
  icon,
  children,
}: {
  title: string;
  empty: string;
  className: string;
  emptyClassName: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <header>
        {icon}
        <strong>{title}</strong>
      </header>
      {empty ? <div className={emptyClassName}>{empty}</div> : children}
    </section>
  );
}

function SummaryBlock({ className, label, value }: { className: string; label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className={className}>
      <span>{label}</span>
      <p>{value}</p>
    </div>
  );
}

function SummaryList({ className, label, values }: { className: string; label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className={className}>
      <span>{label}</span>
      <ul>
        {values.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}
      </ul>
    </div>
  );
}
