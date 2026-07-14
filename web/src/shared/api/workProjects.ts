import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
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
  GetWorkProjectResponse,
  ListWorkProjectSessionsParams,
  ListWorkProjectSessionsResponse,
  QueryWorkProjectsParams,
  QueryWorkProjectsResponse,
  QueryWorkProjectAssetsParams,
  QueryWorkProjectAssetsResponse,
  QueryWorkProjectAttackPathsParams,
  QueryWorkProjectAttackPathsResponse,
  QueryWorkProjectFindingsParams,
  QueryWorkProjectFindingsResponse,
  RetryWorkProjectPathParams,
  RetryWorkProjectResponse,
  UpdateWorkProjectMetadataRequest,
  UpdateWorkProjectMetadataResponse,
  WorkProjectPathParams,
} from "./types";

const WORK_PROJECTS_PATH = "/api/work-projects";

export function queryWorkProjects(params: QueryWorkProjectsParams) {
  return apiGet<QueryWorkProjectsResponse>(`${WORK_PROJECTS_PATH}${buildQuery(params)}`);
}

export function getWorkProject(id: WorkProjectPathParams["id"]) {
  return apiGet<GetWorkProjectResponse>(`${WORK_PROJECTS_PATH}/${id}`);
}

export function createWorkProject(payload: CreateWorkProjectRequest) {
  return apiPost<CreateWorkProjectResponse>(WORK_PROJECTS_PATH, payload);
}

export function updateWorkProjectMetadata(id: WorkProjectPathParams["id"], payload: UpdateWorkProjectMetadataRequest) {
  return apiPatch<UpdateWorkProjectMetadataResponse>(`${WORK_PROJECTS_PATH}/${id}/metadata`, payload);
}

export function queryWorkProjectAssets(id: WorkProjectPathParams["id"], params: QueryWorkProjectAssetsParams) {
  return apiGet<QueryWorkProjectAssetsResponse>(`${WORK_PROJECTS_PATH}/${id}/assets${buildQuery(params)}`);
}

export function queryWorkProjectFindings(id: WorkProjectPathParams["id"], params: QueryWorkProjectFindingsParams) {
  return apiGet<QueryWorkProjectFindingsResponse>(`${WORK_PROJECTS_PATH}/${id}/findings${buildQuery(params)}`);
}

export function queryWorkProjectAttackPaths(id: WorkProjectPathParams["id"], params: QueryWorkProjectAttackPathsParams) {
  return apiGet<QueryWorkProjectAttackPathsResponse>(`${WORK_PROJECTS_PATH}/${id}/attack-paths${buildQuery(params)}`);
}

export function getWorkProjectGraph(id: WorkProjectPathParams["id"]) {
  return apiGet<GetWorkProjectGraphResponse>(`${WORK_PROJECTS_PATH}/${id}/graph`);
}

export function listWorkProjectSessions(
  id: WorkProjectPathParams["id"],
  params: ListWorkProjectSessionsParams,
) {
  return apiGet<ListWorkProjectSessionsResponse>(`${WORK_PROJECTS_PATH}/${id}/sessions${buildQuery(params)}`);
}

export function createWorkProjectSession(id: WorkProjectPathParams["id"]) {
  return apiPost<CreateWorkProjectSessionResponse>(`${WORK_PROJECTS_PATH}/${id}/sessions`);
}

export function deleteWorkProjectSession(id: WorkProjectPathParams["id"], sessionId: string) {
  return apiDelete<DeleteWorkProjectSessionResponse>(
    `${WORK_PROJECTS_PATH}/${id}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function cancelWorkProject(id: CancelWorkProjectPathParams["id"]) {
  return apiPost<CancelWorkProjectResponse>(`${WORK_PROJECTS_PATH}/${id}/cancel`);
}

export function retryWorkProject(id: RetryWorkProjectPathParams["id"]) {
  return apiPost<RetryWorkProjectResponse>(`${WORK_PROJECTS_PATH}/${id}/retry`);
}

export function deleteWorkProject(id: WorkProjectPathParams["id"]) {
  return apiDelete<DeleteWorkProjectResponse>(`${WORK_PROJECTS_PATH}/${id}`);
}
