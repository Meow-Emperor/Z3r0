import { apiBlob, apiDelete, apiGet, apiPatch, apiPost, buildAuthenticatedWebSocketUrl } from "./client";
import { buildQuery } from "./query";
import type {
  AgentTurnRequest,
  CancelAllAgentSessionTasksResponse,
  CreateAgentSessionTurnResponse,
  DeleteAgentSessionResponse,
  DownloadAgentReportPathParams,
  InterruptAgentSessionResponse,
  ListAgentEventsParams,
  ListAgentEventsResponse,
  ListAgentSessionsParams,
  ListAgentSessionsResponse,
  SubmitAgentSessionTurnResponse,
  UpdateAgentSessionSandboxContainerRequest,
  UpdateAgentSessionSandboxContainerResponse,
  UpdateAgentSessionTitleRequest,
  UpdateAgentSessionTitleResponse,
} from "./types";

const AGENT_SESSIONS_PATH = "/api/agent-sessions";

export function listAgentSessions(params: ListAgentSessionsParams) {
  return apiGet<ListAgentSessionsResponse>(`${AGENT_SESSIONS_PATH}${buildQuery(params)}`);
}

export function createAgentSessionTurn(payload: AgentTurnRequest) {
  return apiPost<CreateAgentSessionTurnResponse>(`${AGENT_SESSIONS_PATH}/turns`, payload);
}

export function submitAgentSessionTurn(sessionId: string, payload: AgentTurnRequest) {
  return apiPost<SubmitAgentSessionTurnResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/turns`,
    payload,
  );
}

export function interruptAgentSession(sessionId: string) {
  return apiPost<InterruptAgentSessionResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/interrupt`,
  );
}

export function cancelAllAgentSessionTasks(sessionId: string) {
  return apiPost<CancelAllAgentSessionTasksResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/cancel-all`,
  );
}

export function listAgentEvents(
  sessionId: string,
  params: ListAgentEventsParams = {},
) {
  return apiGet<ListAgentEventsResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/events${buildQuery(params)}`,
  );
}

export function updateAgentSessionTitle(sessionId: string, payload: UpdateAgentSessionTitleRequest) {
  return apiPatch<UpdateAgentSessionTitleResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/title`,
    payload,
  );
}

export function updateAgentSessionSandboxContainer(
  sessionId: string,
  payload: UpdateAgentSessionSandboxContainerRequest,
) {
  return apiPatch<UpdateAgentSessionSandboxContainerResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/sandbox-container`,
    payload,
  );
}

export function deleteAgentSession(sessionId: string) {
  return apiDelete<DeleteAgentSessionResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`,
  );
}

export function downloadAgentReport(reportId: DownloadAgentReportPathParams["report_id"]) {
  return apiBlob(`${AGENT_SESSIONS_PATH}/reports/${encodeURIComponent(reportId)}/download`);
}

export function buildAgentStreamUrl(sessionId: string, token: string) {
  return buildAuthenticatedWebSocketUrl(`${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/stream`, token);
}
