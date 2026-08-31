import { Tag } from "../../shared/ui/semi";
import type { WorkProjectAsset, WorkProjectSummary } from "../../shared/api/types";
import {
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

export function formatWorkProjectAsset(asset: WorkProjectAsset): string {
  return asset.name || asset.locator;
}
