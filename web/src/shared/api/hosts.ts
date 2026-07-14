import { buildAuthenticatedWebSocketUrl, defineJsonEndpoint } from "./client";
import { buildQuery } from "./query";
import type {
  CreateManagedHostRequest,
  CreateManagedHostResponse,
  DeleteManagedHostImageRequest,
  DeleteManagedHostImageResponse,
  DeleteManagedHostResponse,
  ListManagedHostImagesResponse,
  ManagedHostPathParams,
  PullManagedHostImagesRequest,
  PullManagedHostImagesResponse,
  QueryManagedHostsParams,
  QueryManagedHostsResponse,
  UpdateManagedHostRequest,
  UpdateManagedHostResponse,
} from "./types";

const HOSTS_PATH = "/api/hosts";

export const queryManagedHosts = defineJsonEndpoint<[params: QueryManagedHostsParams], QueryManagedHostsResponse>(
  "GET", (params) => `${HOSTS_PATH}${buildQuery(params)}`,
);
export const createManagedHost = defineJsonEndpoint<[payload: CreateManagedHostRequest], CreateManagedHostResponse>(
  "POST", () => HOSTS_PATH, (payload) => payload,
);
export const updateManagedHost = defineJsonEndpoint<
  [id: ManagedHostPathParams["id"], payload: UpdateManagedHostRequest], UpdateManagedHostResponse
>("PATCH", (id) => `${HOSTS_PATH}/${id}`, (_, payload) => payload);
export const deleteManagedHost = defineJsonEndpoint<[id: ManagedHostPathParams["id"]], DeleteManagedHostResponse>(
  "DELETE", (id) => `${HOSTS_PATH}/${id}`,
);
export const listManagedHostImages = defineJsonEndpoint<[id: ManagedHostPathParams["id"]], ListManagedHostImagesResponse>(
  "GET", (id) => `${HOSTS_PATH}/${id}/images`,
);
export const pullManagedHostImages = defineJsonEndpoint<
  [id: ManagedHostPathParams["id"], payload: PullManagedHostImagesRequest], PullManagedHostImagesResponse
>("POST", (id) => `${HOSTS_PATH}/${id}/images/pull`, (_, payload) => payload);
export const removeManagedHostImage = defineJsonEndpoint<
  [id: ManagedHostPathParams["id"], payload: DeleteManagedHostImageRequest], DeleteManagedHostImageResponse
>("POST", (id) => `${HOSTS_PATH}/${id}/images/remove`, (_, payload) => payload);

export function buildHostShellUrl(id: ManagedHostPathParams["id"]) {
  return buildAuthenticatedWebSocketUrl(`${HOSTS_PATH}/${id}/shell`);
}
