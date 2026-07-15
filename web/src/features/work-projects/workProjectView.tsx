import { Tag } from "@douyinfe/semi-ui";
import type { ReactNode } from "react";
import type { WorkProject, WorkProjectAsset, WorkProjectSummary } from "../../shared/api/types";
import {
  WORK_PROJECT_ASSET_KIND_LABEL,
  WORK_PROJECT_ASSET_SCOPE_COLOR,
  WORK_PROJECT_ASSET_SCOPE_LABEL,
  WORK_PROJECT_STATUS_COLOR,
  WORK_PROJECT_STATUS_LABEL,
  WORK_PROJECT_TYPE_COLOR,
  WORK_PROJECT_TYPE_LABEL,
} from "../../shared/lib/labels";

export function workProjectOwnerNames(project: WorkProjectSummary): string {
  return project.owners.map((owner) => owner.username).join(", ") || "No owners";
}

export function WorkProjectTypeTag({ project }: { project: WorkProjectSummary }) {
  return <Tag color={WORK_PROJECT_TYPE_COLOR[project.type]}>{WORK_PROJECT_TYPE_LABEL[project.type]}</Tag>;
}

export function WorkProjectStatusTag({ project }: { project: WorkProjectSummary }) {
  return <Tag color={WORK_PROJECT_STATUS_COLOR[project.status]}>{WORK_PROJECT_STATUS_LABEL[project.status]}</Tag>;
}

export function WorkProjectAssets({ project }: { project: WorkProject }) {
  return <div className="work-project-asset-list">{project.assets.map((asset) => (
    <div key={asset.id}>
      <strong>{formatWorkProjectAsset(asset)}</strong>
      <span>{WORK_PROJECT_ASSET_KIND_LABEL[asset.kind]}</span>
      <Tag color={WORK_PROJECT_ASSET_SCOPE_COLOR[asset.scope]}>{WORK_PROJECT_ASSET_SCOPE_LABEL[asset.scope]}</Tag>
    </div>
  ))}</div>;
}

export function formatWorkProjectAsset(asset: WorkProjectAsset): string {
  return asset.name || asset.locator;
}

export function WorkProjectPanel({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return <section className="work-project-panel"><header><strong>{title}</strong></header>{empty ? <div className="work-project-panel-empty">{empty}</div> : children}</section>;
}
