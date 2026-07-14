import type { WorkProjectGraphEdgeCategory } from "../api/contract";
import {
  SANDBOX_CONTAINER_EGRESS_MODE_VALUES,
  SANDBOX_CONTAINER_STATUS_VALUES,
  SYSTEM_USER_ROLE_VALUES,
  WORK_PROJECT_ASSET_ORIGIN_VALUES,
  WORK_PROJECT_ASSET_TYPE_VALUES,
  WORK_PROJECT_ATTACK_PATH_STATUS_VALUES,
  WORK_PROJECT_FINDING_SEVERITY_VALUES,
  WORK_PROJECT_FINDING_STATUS_VALUES,
  WORK_PROJECT_GRAPH_EDGE_CATEGORY_VALUES,
  WORK_PROJECT_GRAPH_EDGE_TYPE_VALUES,
  WORK_PROJECT_STATUS_VALUES,
  WORK_PROJECT_TASK_STATUS_VALUES,
  WORK_PROJECT_TYPE_VALUES,
} from "../api/generated/constants";
import type {
  SandboxContainerEgressMode,
  SandboxContainerStatus,
  SystemUserRole,
  WorkProjectAssetOrigin,
  WorkProjectAssetType,
  WorkProjectAttackPathStatus,
  WorkProjectFindingSeverity,
  WorkProjectFindingStatus,
  WorkProjectGraphEdgeType,
  WorkProjectStatus,
  WorkProjectTaskStatus,
  WorkProjectType,
} from "../api/types";

export type SemiTagColor = "amber" | "green" | "red" | "grey" | "blue" | "cyan";

export const SYSTEM_USER_ROLE_LABEL = labelsFromEnum<SystemUserRole>(SYSTEM_USER_ROLE_VALUES);
export const WORK_PROJECT_TYPE_LABEL = labelsFromEnum<WorkProjectType>(WORK_PROJECT_TYPE_VALUES, { source_code_audit: "Source Code Audit" });
export const WORK_PROJECT_STATUS_LABEL = labelsFromEnum<WorkProjectStatus>(WORK_PROJECT_STATUS_VALUES);
export const WORK_PROJECT_TASK_STATUS_LABEL = labelsFromEnum<WorkProjectTaskStatus>(WORK_PROJECT_TASK_STATUS_VALUES);
export const WORK_PROJECT_ASSET_TYPE_LABEL = labelsFromEnum<WorkProjectAssetType>(WORK_PROJECT_ASSET_TYPE_VALUES);
export const WORK_PROJECT_ASSET_ORIGIN_LABEL = labelsFromEnum<WorkProjectAssetOrigin>(WORK_PROJECT_ASSET_ORIGIN_VALUES);
export const WORK_PROJECT_FINDING_SEVERITY_LABEL = labelsFromEnum<WorkProjectFindingSeverity>(WORK_PROJECT_FINDING_SEVERITY_VALUES);
export const WORK_PROJECT_FINDING_STATUS_LABEL = labelsFromEnum<WorkProjectFindingStatus>(WORK_PROJECT_FINDING_STATUS_VALUES);
export const WORK_PROJECT_GRAPH_EDGE_TYPE_LABEL = labelsFromEnum<WorkProjectGraphEdgeType>(WORK_PROJECT_GRAPH_EDGE_TYPE_VALUES);
export const WORK_PROJECT_GRAPH_EDGE_CATEGORY_LABEL = labelsFromEnum<WorkProjectGraphEdgeCategory>(WORK_PROJECT_GRAPH_EDGE_CATEGORY_VALUES);
export const WORK_PROJECT_ATTACK_PATH_STATUS_LABEL = labelsFromEnum<WorkProjectAttackPathStatus>(WORK_PROJECT_ATTACK_PATH_STATUS_VALUES);
export const SANDBOX_CONTAINER_EGRESS_MODE_LABEL = labelsFromEnum<SandboxContainerEgressMode>(SANDBOX_CONTAINER_EGRESS_MODE_VALUES);
export const SANDBOX_CONTAINER_STATUS_LABEL = labelsFromEnum<SandboxContainerStatus>(SANDBOX_CONTAINER_STATUS_VALUES);

export const SYSTEM_USER_ROLE_COLOR = colorsFromEnum<SystemUserRole>(SYSTEM_USER_ROLE_VALUES, {
  admin: "red",
  user: "blue",
});

export const WORK_PROJECT_STATUS_COLOR = colorsFromEnum<WorkProjectStatus>(WORK_PROJECT_STATUS_VALUES, {
  working: "amber",
  completed: "green",
  canceled: "grey",
});

export const WORK_PROJECT_TYPE_COLOR = colorsFromEnum<WorkProjectType>(WORK_PROJECT_TYPE_VALUES, {
  penetration_test: "blue",
  source_code_audit: "cyan",
});

export const WORK_PROJECT_TASK_STATUS_COLOR = colorsFromEnum<WorkProjectTaskStatus>(WORK_PROJECT_TASK_STATUS_VALUES, {
  todo: "grey",
  in_progress: "blue",
  blocked: "amber",
  done: "green",
});

export const WORK_PROJECT_FINDING_SEVERITY_COLOR = colorsFromEnum<WorkProjectFindingSeverity>(WORK_PROJECT_FINDING_SEVERITY_VALUES, {
  info: "grey",
  low: "blue",
  medium: "amber",
  high: "red",
  critical: "red",
});

export const WORK_PROJECT_FINDING_STATUS_COLOR = colorsFromEnum<WorkProjectFindingStatus>(WORK_PROJECT_FINDING_STATUS_VALUES, {
  suspected: "amber",
  validated: "red",
  false_positive: "grey",
});

export const WORK_PROJECT_ATTACK_PATH_STATUS_COLOR = colorsFromEnum<WorkProjectAttackPathStatus>(WORK_PROJECT_ATTACK_PATH_STATUS_VALUES, {
  suspected: "amber",
  validated: "red",
  blocked: "grey",
  closed: "green",
});

export const WORK_PROJECT_ASSET_ORIGIN_COLOR = colorsFromEnum<WorkProjectAssetOrigin>(WORK_PROJECT_ASSET_ORIGIN_VALUES, {
  scope: "blue",
  discovered: "cyan",
});

export const WORK_PROJECT_GRAPH_EDGE_CATEGORY_COLOR: Record<WorkProjectGraphEdgeCategory, SemiTagColor> = {
  structural: "blue",
  offensive: "red",
};

export const SANDBOX_CONTAINER_STATUS_COLOR = colorsFromEnum<SandboxContainerStatus>(SANDBOX_CONTAINER_STATUS_VALUES, {
  created: "blue",
  running: "green",
  paused: "amber",
  stopped: "grey",
  error: "red",
});

function labelsFromEnum<T extends string>(
  values: readonly T[],
  overrides: Partial<Record<T, string>> = {},
): Record<T, string> {
  return Object.fromEntries(values.map((value) => [value, overrides[value] ?? formatEnumLabel(value)])) as Record<T, string>;
}

function colorsFromEnum<T extends string>(
  values: readonly T[],
  colors: Partial<Record<T, SemiTagColor>>,
): Record<T, SemiTagColor> {
  return Object.fromEntries(values.map((value) => [value, colors[value] ?? "grey"])) as Record<T, SemiTagColor>;
}

export function formatEnumLabel(value: string): string {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
