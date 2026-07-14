import { apiBlob, buildAuthenticatedWebSocketUrl, defineJsonEndpoint } from "./client";
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

export const listAgentSessions = defineJsonEndpoint<[params: ListAgentSessionsParams], ListAgentSessionsResponse>(
  "GET", (params) => `${AGENT_SESSIONS_PATH}${buildQuery(params)}`,
);
export const createAgentSessionTurn = defineJsonEndpoint<[payload: AgentTurnRequest], CreateAgentSessionTurnResponse>(
  "POST", () => `${AGENT_SESSIONS_PATH}/turns`, (payload) => payload,
);
export const submitAgentSessionTurn = defineJsonEndpoint<
  [sessionId: string, payload: AgentTurnRequest], SubmitAgentSessionTurnResponse
>("POST", (sessionId) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/turns`, (_, payload) => payload);
export const interruptAgentSession = defineJsonEndpoint<[sessionId: string], InterruptAgentSessionResponse>(
  "POST", (sessionId) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/interrupt`,
);
export const cancelAllAgentSessionTasks = defineJsonEndpoint<[sessionId: string], CancelAllAgentSessionTasksResponse>(
  "POST", (sessionId) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/cancel-all`,
);

export function listAgentEvents(
  sessionId: string,
  params: ListAgentEventsParams = {},
) {
  return listAgentEventsEndpoint(sessionId, params);
}

const listAgentEventsEndpoint = defineJsonEndpoint<
  [sessionId: string, params: ListAgentEventsParams], ListAgentEventsResponse
>("GET", (sessionId, params) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/events${buildQuery(params)}`);

export const updateAgentSessionTitle = defineJsonEndpoint<
  [sessionId: string, payload: UpdateAgentSessionTitleRequest], UpdateAgentSessionTitleResponse
>("PATCH", (sessionId) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/title`, (_, payload) => payload);
export const updateAgentSessionSandboxContainer = defineJsonEndpoint<
  [sessionId: string, payload: UpdateAgentSessionSandboxContainerRequest], UpdateAgentSessionSandboxContainerResponse
>("PATCH", (sessionId) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/sandbox-container`, (_, payload) => payload);
export const deleteAgentSession = defineJsonEndpoint<[sessionId: string], DeleteAgentSessionResponse>(
  "DELETE", (sessionId) => `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}`,
);

export function downloadAgentReport(reportId: DownloadAgentReportPathParams["report_id"]) {
  return apiBlob(`${AGENT_SESSIONS_PATH}/reports/${encodeURIComponent(reportId)}/download`);
}

export function buildAgentStreamUrl(sessionId: string, token: string) {
  return buildAuthenticatedWebSocketUrl(`${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/stream`, token);
}
