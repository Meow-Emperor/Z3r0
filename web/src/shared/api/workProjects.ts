import { defineJsonEndpoint } from "./client";
import { buildQuery } from "./query";
import type {
  CancelWorkProjectPathParams,
  CancelWorkProjectResponse,
  CreateWorkProjectRequest,
  CreateWorkProjectResponse,
  CreateWorkProjectSessionResponse,
  DeleteWorkProjectSessionResponse,
  DeleteWorkProjectResponse,
  GetWorkProjectGraphResponse,
  GetWorkProjectOverviewResponse,
  GetWorkProjectResponse,
  ListWorkProjectSessionsParams,
  ListWorkProjectSessionsResponse,
  QueryWorkProjectsParams,
  QueryWorkProjectsResponse,
  QueryWorkProjectAssetsParams,
  QueryWorkProjectAssetsResponse,
  QueryWorkProjectAttackPathsParams,
  QueryWorkProjectAttackPathsResponse,
  QueryWorkProjectActivityParams,
  QueryWorkProjectActivityResponse,
  QueryWorkProjectEvidenceParams,
  QueryWorkProjectEvidenceResponse,
  QueryWorkProjectFindingsParams,
  QueryWorkProjectFindingsResponse,
  QueryWorkProjectWorkItemsParams,
  QueryWorkProjectWorkItemsResponse,
  RetryWorkProjectPathParams,
  RetryWorkProjectResponse,
  UpdateWorkProjectMetadataRequest,
  UpdateWorkProjectMetadataResponse,
  WorkProjectPathParams,
} from "./types";

const WORK_PROJECTS_PATH = "/api/work-projects";

type WorkProjectId = WorkProjectPathParams["id"];

export const queryWorkProjects = defineJsonEndpoint<[params: QueryWorkProjectsParams], QueryWorkProjectsResponse>(
  "GET", (params) => `${WORK_PROJECTS_PATH}${buildQuery(params)}`,
);
export const getWorkProject = defineJsonEndpoint<[id: WorkProjectId], GetWorkProjectResponse>(
  "GET", (id) => `${WORK_PROJECTS_PATH}/${id}`,
);
export const createWorkProject = defineJsonEndpoint<[payload: CreateWorkProjectRequest], CreateWorkProjectResponse>(
  "POST", () => WORK_PROJECTS_PATH, (payload) => payload,
);
export const updateWorkProjectMetadata = defineJsonEndpoint<
  [id: WorkProjectId, payload: UpdateWorkProjectMetadataRequest], UpdateWorkProjectMetadataResponse
>("PATCH", (id) => `${WORK_PROJECTS_PATH}/${id}/metadata`, (_, payload) => payload);
export const queryWorkProjectAssets = defineJsonEndpoint<
  [id: WorkProjectId, params: QueryWorkProjectAssetsParams], QueryWorkProjectAssetsResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/assets${buildQuery(params)}`);
export const getWorkProjectOverview = defineJsonEndpoint<[id: WorkProjectId], GetWorkProjectOverviewResponse>(
  "GET", (id) => `${WORK_PROJECTS_PATH}/${id}/overview`,
);
export const queryWorkProjectEvidence = defineJsonEndpoint<
  [id: WorkProjectId, params: QueryWorkProjectEvidenceParams], QueryWorkProjectEvidenceResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/evidence${buildQuery(params)}`);
export const queryWorkProjectFindings = defineJsonEndpoint<
  [id: WorkProjectId, params: QueryWorkProjectFindingsParams], QueryWorkProjectFindingsResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/findings${buildQuery(params)}`);
export const queryWorkProjectAttackPaths = defineJsonEndpoint<
  [id: WorkProjectId, params: QueryWorkProjectAttackPathsParams], QueryWorkProjectAttackPathsResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/attack-paths${buildQuery(params)}`);
export const queryWorkProjectWorkItems = defineJsonEndpoint<
  [id: WorkProjectId, params: QueryWorkProjectWorkItemsParams], QueryWorkProjectWorkItemsResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/work-items${buildQuery(params)}`);
export const queryWorkProjectActivity = defineJsonEndpoint<
  [id: WorkProjectId, params: QueryWorkProjectActivityParams], QueryWorkProjectActivityResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/activity${buildQuery(params)}`);
export const getWorkProjectGraph = defineJsonEndpoint<[id: WorkProjectId], GetWorkProjectGraphResponse>(
  "GET", (id) => `${WORK_PROJECTS_PATH}/${id}/graph`,
);
export const listWorkProjectSessions = defineJsonEndpoint<
  [id: WorkProjectId, params: ListWorkProjectSessionsParams], ListWorkProjectSessionsResponse
>("GET", (id, params) => `${WORK_PROJECTS_PATH}/${id}/sessions${buildQuery(params)}`);
export const createWorkProjectSession = defineJsonEndpoint<[id: WorkProjectId], CreateWorkProjectSessionResponse>(
  "POST", (id) => `${WORK_PROJECTS_PATH}/${id}/sessions`,
);
export const deleteWorkProjectSession = defineJsonEndpoint<
  [id: WorkProjectId, sessionId: string], DeleteWorkProjectSessionResponse
>("DELETE", (id, sessionId) => `${WORK_PROJECTS_PATH}/${id}/sessions/${encodeURIComponent(sessionId)}`);
export const cancelWorkProject = defineJsonEndpoint<
  [id: CancelWorkProjectPathParams["id"]], CancelWorkProjectResponse
>("POST", (id) => `${WORK_PROJECTS_PATH}/${id}/cancel`);
export const retryWorkProject = defineJsonEndpoint<
  [id: RetryWorkProjectPathParams["id"]], RetryWorkProjectResponse
>("POST", (id) => `${WORK_PROJECTS_PATH}/${id}/retry`);
export const deleteWorkProject = defineJsonEndpoint<[id: WorkProjectId], DeleteWorkProjectResponse>(
  "DELETE", (id) => `${WORK_PROJECTS_PATH}/${id}`,
);
