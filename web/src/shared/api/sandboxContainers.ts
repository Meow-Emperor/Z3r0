import { apiBlob, apiForm, buildAuthenticatedWebSocketUrl, defineJsonEndpoint } from "./client";
import { SANDBOX_CONTAINER_STATUS } from "./generated/constants";
import { getStoredAccessToken } from "../auth/session";
import { buildQuery } from "./query";
import type {
  ContainerFileCopyRequest,
  ContainerFileCopyResponse,
  ContainerFileDeleteRequest,
  ContainerFileDeleteResponse,
  ContainerFileMkdirRequest,
  ContainerFileMkdirResponse,
  ContainerFileMoveRequest,
  ContainerFileMoveResponse,
  ContainerFileUploadRequest,
  ContainerFileUploadResponse,
  ContainerFileWriteRequest,
  ContainerFileWriteResponse,
  CreateSandboxContainerRequest,
  CreateSandboxContainerResponse,
  DeleteSandboxContainerResponse,
  ListContainerFilesParams,
  ListContainerFilesResponse,
  DownloadContainerFilesParams,
  PauseSandboxContainerPathParams,
  PauseSandboxContainerResponse,
  QueryAvailableSandboxContainersParams,
  QueryAvailableSandboxContainersResponse,
  QuerySandboxContainerHostOptionsParams,
  QuerySandboxContainerHostOptionsResponse,
  QuerySandboxContainerImageOptionsParams,
  QuerySandboxContainerImageOptionsResponse,
  QuerySandboxContainersParams,
  QuerySandboxContainersResponse,
  ReadContainerFileParams,
  ReadContainerFileResponse,
  ResumeSandboxContainerPathParams,
  ResumeSandboxContainerResponse,
  SandboxContainer,
  SandboxContainerPathParams,
  StartSandboxContainerPathParams,
  StartSandboxContainerResponse,
  StopSandboxContainerPathParams,
  StopSandboxContainerResponse,
  UpdateSandboxContainerEgressPathParams,
  UpdateSandboxContainerEgressRequest,
  UpdateSandboxContainerEgressResponse,
} from "./types";

const SANDBOX_CONTAINERS_PATH = "/api/sandbox-containers";
type SandboxContainerId = SandboxContainerPathParams["id"];

export const querySandboxContainers = defineJsonEndpoint<
  [params: QuerySandboxContainersParams], QuerySandboxContainersResponse
>("GET", (params) => `${SANDBOX_CONTAINERS_PATH}${buildQuery(params)}`);
export const queryAvailableSandboxContainers = defineJsonEndpoint<
  [params: QueryAvailableSandboxContainersParams], QueryAvailableSandboxContainersResponse
>("GET", (params) => `${SANDBOX_CONTAINERS_PATH}/available${buildQuery(params)}`);
export const createSandboxContainer = defineJsonEndpoint<
  [payload: CreateSandboxContainerRequest], CreateSandboxContainerResponse
>("POST", () => SANDBOX_CONTAINERS_PATH, (payload) => payload);
export const querySandboxContainerHostOptions = defineJsonEndpoint<
  [params: QuerySandboxContainerHostOptionsParams], QuerySandboxContainerHostOptionsResponse
>("GET", (params) => `${SANDBOX_CONTAINERS_PATH}/create-options/hosts${buildQuery(params)}`);
export const querySandboxContainerImageOptions = defineJsonEndpoint<
  [params: QuerySandboxContainerImageOptionsParams], QuerySandboxContainerImageOptionsResponse
>("GET", (params) => `${SANDBOX_CONTAINERS_PATH}/create-options/images${buildQuery(params)}`);
export const startSandboxContainer = defineJsonEndpoint<
  [id: StartSandboxContainerPathParams["id"]], StartSandboxContainerResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/start`);
export const stopSandboxContainer = defineJsonEndpoint<
  [id: StopSandboxContainerPathParams["id"]], StopSandboxContainerResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/stop`);
export const pauseSandboxContainer = defineJsonEndpoint<
  [id: PauseSandboxContainerPathParams["id"]], PauseSandboxContainerResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/pause`);
export const resumeSandboxContainer = defineJsonEndpoint<
  [id: ResumeSandboxContainerPathParams["id"]], ResumeSandboxContainerResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/resume`);
export const updateSandboxContainerEgress = defineJsonEndpoint<
  [id: UpdateSandboxContainerEgressPathParams["id"], payload: UpdateSandboxContainerEgressRequest],
  UpdateSandboxContainerEgressResponse
>("PATCH", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/egress`, (_, payload) => payload);
export const deleteSandboxContainer = defineJsonEndpoint<[id: SandboxContainerId], DeleteSandboxContainerResponse>(
  "DELETE", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}`,
);

export function buildContainerShellUrl(containerId: SandboxContainerId) {
  return buildAuthenticatedWebSocketUrl(`${SANDBOX_CONTAINERS_PATH}/${containerId}/shell`);
}

export function canOpenContainerNoVNC(container: SandboxContainer) {
  return Boolean(container.control_proxy_host_port > 0 && container.status === SANDBOX_CONTAINER_STATUS.RUNNING);
}

export function canManageSandboxContainer(container: SandboxContainer | null | undefined) {
  return Boolean(container?.can_manage);
}

export function buildContainerNoVNCUrl(container: SandboxContainer) {
  if (!canOpenContainerNoVNC(container)) {
    throw new Error("container control port is not ready");
  }

  const token = getStoredAccessToken();
  if (!token) throw new Error("missing access token");

  const wsPath = `../novnc-ws?token=${encodeURIComponent(token)}`;
  const base = `${window.location.origin}/api/sandbox-containers/${container.id}/novnc/vnc.html`;

  const url = new URL(base);
  url.searchParams.set("autoconnect", "true");
  url.searchParams.set("resize", "remote");
  url.searchParams.set("path", wsPath);
  url.searchParams.set("token", token);
  return url.toString();
}

export const listContainerFiles = defineJsonEndpoint<
  [id: SandboxContainerId, params: ListContainerFilesParams], ListContainerFilesResponse
>("GET", (id, params) => `${SANDBOX_CONTAINERS_PATH}/${id}/files${buildQuery(params)}`);
export const readContainerFile = defineJsonEndpoint<
  [id: SandboxContainerId, params: ReadContainerFileParams], ReadContainerFileResponse
>("GET", (id, params) => `${SANDBOX_CONTAINERS_PATH}/${id}/files/read${buildQuery(params)}`);
export const writeContainerFile = defineJsonEndpoint<
  [id: SandboxContainerId, payload: ContainerFileWriteRequest], ContainerFileWriteResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/files/write`, (_, payload) => payload);

export function uploadContainerFiles(
  id: SandboxContainerId,
  path: ContainerFileUploadRequest["path"],
  files: File[],
  overwrite: ContainerFileUploadRequest["overwrite"] = true,
) {
  const form = new FormData();
  form.set("path", path);
  form.set("overwrite", String(overwrite));
  files.forEach((file) => form.append("files", file));
  return apiForm<ContainerFileUploadResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/upload`, form);
}

export function downloadContainerFiles(id: SandboxContainerId, params: DownloadContainerFilesParams) {
  const query = new URLSearchParams();
  params.path.forEach((path) => query.append("path", path));
  return apiBlob(`${SANDBOX_CONTAINERS_PATH}/${id}/files/download?${query.toString()}`);
}

export const copyContainerFiles = defineJsonEndpoint<
  [id: SandboxContainerId, payload: ContainerFileCopyRequest], ContainerFileCopyResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/files/copy`, (_, payload) => payload);
export const moveContainerFiles = defineJsonEndpoint<
  [id: SandboxContainerId, payload: ContainerFileMoveRequest], ContainerFileMoveResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/files/move`, (_, payload) => payload);
export const deleteContainerFiles = defineJsonEndpoint<
  [id: SandboxContainerId, payload: ContainerFileDeleteRequest], ContainerFileDeleteResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/files/delete`, (_, payload) => payload);
export const createContainerDirectory = defineJsonEndpoint<
  [id: SandboxContainerId, payload: ContainerFileMkdirRequest], ContainerFileMkdirResponse
>("POST", (id) => `${SANDBOX_CONTAINERS_PATH}/${id}/files/mkdir`, (_, payload) => payload);
