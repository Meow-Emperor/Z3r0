import { defineJsonEndpoint } from "./client";
import { buildQuery } from "./query";
import type {
  CreateEgressProxyRequest,
  CreateEgressProxyResponse,
  DeleteEgressProxyResponse,
  EgressProxyPathParams,
  QueryEgressProxiesParams,
  QueryEgressProxiesResponse,
  TestEgressProxyPathParams,
  TestEgressProxyResponse,
  UpdateEgressProxyRequest,
  UpdateEgressProxyResponse,
} from "./types";

const EGRESS_PROXIES_PATH = "/api/egress-proxies";

export const queryEgressProxies = defineJsonEndpoint<[params: QueryEgressProxiesParams], QueryEgressProxiesResponse>(
  "GET", (params) => `${EGRESS_PROXIES_PATH}${buildQuery(params)}`,
);
export const createEgressProxy = defineJsonEndpoint<[payload: CreateEgressProxyRequest], CreateEgressProxyResponse>(
  "POST", () => EGRESS_PROXIES_PATH, (payload) => payload,
);
export const updateEgressProxy = defineJsonEndpoint<
  [id: EgressProxyPathParams["id"], payload: UpdateEgressProxyRequest], UpdateEgressProxyResponse
>("PATCH", (id) => `${EGRESS_PROXIES_PATH}/${id}`, (_, payload) => payload);
export const deleteEgressProxy = defineJsonEndpoint<[id: EgressProxyPathParams["id"]], DeleteEgressProxyResponse>(
  "DELETE", (id) => `${EGRESS_PROXIES_PATH}/${id}`,
);
export const testEgressProxy = defineJsonEndpoint<[id: TestEgressProxyPathParams["id"]], TestEgressProxyResponse>(
  "POST", (id) => `${EGRESS_PROXIES_PATH}/${id}/test`,
);
