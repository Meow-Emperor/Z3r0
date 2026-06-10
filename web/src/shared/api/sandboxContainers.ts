import { apiBlob, apiDelete, apiForm, apiGet, apiPost, buildAuthenticatedWebSocketUrl } from "./client";
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
  GenerateDefaultSandboxContainerPortMappingsParams,
  GenerateDefaultSandboxContainerPortMappingsResponse,
  ListContainerFilesParams,
  ListContainerFilesResponse,
  DownloadContainerFilesParams,
  QueryAvailableSandboxContainersParams,
  QueryAvailableSandboxContainersResponse,
  QuerySandboxContainersParams,
  QuerySandboxContainersResponse,
  ReadContainerFileParams,
  ReadContainerFileResponse,
  SandboxContainer,
  SandboxContainerPathParams,
  StartSandboxContainerPathParams,
  StartSandboxContainerResponse,
  StopSandboxContainerPathParams,
  StopSandboxContainerResponse,
} from "./types";

const SANDBOX_CONTAINERS_PATH = "/api/sandbox-containers";

export function querySandboxContainers(params: QuerySandboxContainersParams) {
  return apiGet<QuerySandboxContainersResponse>(`${SANDBOX_CONTAINERS_PATH}${buildQuery(params)}`);
}

export function queryAvailableSandboxContainers(params: QueryAvailableSandboxContainersParams) {
  return apiGet<QueryAvailableSandboxContainersResponse>(`${SANDBOX_CONTAINERS_PATH}/available${buildQuery(params)}`);
}

export function generateDefaultSandboxContainerPortMappings(params: GenerateDefaultSandboxContainerPortMappingsParams) {
  return apiGet<GenerateDefaultSandboxContainerPortMappingsResponse>(`${SANDBOX_CONTAINERS_PATH}/default-port-mappings${buildQuery(params)}`);
}

export function createSandboxContainer(payload: CreateSandboxContainerRequest) {
  return apiPost<CreateSandboxContainerResponse>(SANDBOX_CONTAINERS_PATH, payload);
}

export function startSandboxContainer(id: StartSandboxContainerPathParams["id"]) {
  return apiPost<StartSandboxContainerResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/start`);
}

export function stopSandboxContainer(id: StopSandboxContainerPathParams["id"]) {
  return apiPost<StopSandboxContainerResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/stop`);
}

export function deleteSandboxContainer(id: SandboxContainerPathParams["id"]) {
  return apiDelete<DeleteSandboxContainerResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}`);
}

export function buildContainerShellUrl(containerHash: string) {
  return buildAuthenticatedWebSocketUrl(`${SANDBOX_CONTAINERS_PATH}/${encodeURIComponent(containerHash)}/shell`);
}

export function getContainerNoVNCPortMapping(container: SandboxContainer) {
  if (!container.novnc_support || !container.novnc_port) return undefined;
  return container.port_mappings.find((item) => (
    item.protocol === "tcp" && item.container_port === container.novnc_port
  ));
}

export function canOpenContainerNoVNC(container: SandboxContainer) {
  return Boolean(getContainerNoVNCPortMapping(container));
}

export function buildContainerNoVNCUrl(container: SandboxContainer) {
  const mapping = getContainerNoVNCPortMapping(container);
  if (!mapping) {
    throw new Error("missing noVNC port mapping");
  }

  const url = new URL(window.location.href);
  url.port = String(mapping.host_port);
  url.pathname = "/novnc/vnc.html";
  url.search = "";
  url.hash = "";
  url.searchParams.set("autoconnect", "true");
  url.searchParams.set("resize", "remote");
  url.searchParams.set("path", "websockify");
  return url.toString();
}


// ── container file operations ──────────────────────────────────────────────

export function listContainerFiles(id: number, params: ListContainerFilesParams) {
  return apiGet<ListContainerFilesResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files${buildQuery(params)}`);
}

export function readContainerFile(id: number, params: ReadContainerFileParams) {
  return apiGet<ReadContainerFileResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/read${buildQuery(params)}`);
}

export function writeContainerFile(id: number, payload: ContainerFileWriteRequest) {
  return apiPost<ContainerFileWriteResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/write`, payload);
}

export function uploadContainerFiles(
  id: number,
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

export function downloadContainerFiles(id: number, params: DownloadContainerFilesParams) {
  const query = new URLSearchParams();
  params.path.forEach((path) => query.append("path", path));
  return apiBlob(`${SANDBOX_CONTAINERS_PATH}/${id}/files/download?${query.toString()}`);
}

export function copyContainerFiles(id: number, payload: ContainerFileCopyRequest) {
  return apiPost<ContainerFileCopyResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/copy`, payload);
}

export function moveContainerFiles(id: number, payload: ContainerFileMoveRequest) {
  return apiPost<ContainerFileMoveResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/move`, payload);
}

export function deleteContainerFiles(id: number, payload: ContainerFileDeleteRequest) {
  return apiPost<ContainerFileDeleteResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/delete`, payload);
}

export function createContainerDirectory(id: number, payload: ContainerFileMkdirRequest) {
  return apiPost<ContainerFileMkdirResponse>(`${SANDBOX_CONTAINERS_PATH}/${id}/files/mkdir`, payload);
}
