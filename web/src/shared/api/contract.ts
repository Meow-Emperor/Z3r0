import {
  SYSTEM_USER_ROLE_VALUES,
  WORK_PROJECT_ASSET_KIND,
  WORK_PROJECT_ASSET_KIND_VALUES,
  WORK_PROJECT_ASSET_SCOPE,
  WORK_PROJECT_RELATION_CATEGORY,
  WORK_PROJECT_RELATION_CATEGORY_VALUES,
  WORK_PROJECT_STATUS,
  WORK_PROJECT_TYPE_VALUES,
} from "./generated/constants";
import type {
  SystemUserRole,
  WorkProjectAssetKind,
  WorkProjectRelationType,
  WorkProjectType,
} from "./types";

export {
  WORK_PROJECT_ASSET_KIND,
  WORK_PROJECT_ASSET_KIND_VALUES,
  WORK_PROJECT_ASSET_SCOPE,
  WORK_PROJECT_RELATION_CATEGORY_VALUES,
  WORK_PROJECT_STATUS,
};

export type WorkProjectRelationCategory = (typeof WORK_PROJECT_RELATION_CATEGORY)[WorkProjectRelationType];

export function workProjectRelationCategory(type: WorkProjectRelationType): WorkProjectRelationCategory {
  return WORK_PROJECT_RELATION_CATEGORY[type];
}

const SYSTEM_USER_ROLE_SET = new Set<string>(SYSTEM_USER_ROLE_VALUES);
const WORK_PROJECT_TYPE_SET = new Set<string>(WORK_PROJECT_TYPE_VALUES);
const WORK_PROJECT_ASSET_KIND_SET = new Set<string>(WORK_PROJECT_ASSET_KIND_VALUES);

export function getSystemUserRoles(): SystemUserRole[] {
  return [...SYSTEM_USER_ROLE_VALUES];
}

export function isSystemUserRole(value: unknown): value is SystemUserRole {
  return typeof value === "string" && SYSTEM_USER_ROLE_SET.has(value);
}

export function getWorkProjectTypes(): WorkProjectType[] {
  return [...WORK_PROJECT_TYPE_VALUES];
}

export function isWorkProjectType(value: unknown): value is WorkProjectType {
  return typeof value === "string" && WORK_PROJECT_TYPE_SET.has(value);
}

export function getWorkProjectAssetKinds(): WorkProjectAssetKind[] {
  return [...WORK_PROJECT_ASSET_KIND_VALUES];
}

export function isWorkProjectAssetKind(value: unknown): value is WorkProjectAssetKind {
  return typeof value === "string" && WORK_PROJECT_ASSET_KIND_SET.has(value);
}
