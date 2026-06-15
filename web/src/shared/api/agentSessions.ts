import { apiDelete, apiGet, apiPatch, apiPost, buildAuthenticatedWebSocketUrl } from "./client";
import type {
  CreateAgentSessionResponse,
  DeleteAgentSessionResponse,
  ListAgentEventsResponse,
  ListAgentSessionsResponse,
  UpdateAgentSessionSandboxContainerRequest,
  UpdateAgentSessionSandboxContainerResponse,
  UpdateAgentSessionTitleRequest,
  UpdateAgentSessionTitleResponse,
} from "./types";

const AGENT_SESSIONS_PATH = "/api/agent-sessions";

export function listAgentSessions(limit = 100) {
  return apiGet<ListAgentSessionsResponse>(`${AGENT_SESSIONS_PATH}?limit=${limit}`);
}

export function createAgentSession() {
  return apiPost<CreateAgentSessionResponse>(AGENT_SESSIONS_PATH);
}

export function listAgentEvents(
  sessionId: string,
  options: { beforeSeq?: number | null; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (options.beforeSeq) params.set("before_seq", String(options.beforeSeq));
  if (options.limit) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiGet<ListAgentEventsResponse>(
    `${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/events${query ? `?${query}` : ""}`,
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

export function buildAgentStreamUrl(sessionId: string, token: string) {
  return buildAuthenticatedWebSocketUrl(`${AGENT_SESSIONS_PATH}/${encodeURIComponent(sessionId)}/stream`, token);
}
