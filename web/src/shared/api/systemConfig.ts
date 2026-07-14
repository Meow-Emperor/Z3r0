import { defineJsonEndpoint } from "./client";
import type {
  GetInstanceConfigResponse,
  UpdateInstanceConfigRequest,
  UpdateInstanceConfigResponse,
} from "./types";

const SYSTEM_CONFIG_PATH = "/api/system-config";

export const getInstanceConfig = defineJsonEndpoint<[], GetInstanceConfigResponse>(
  "GET", () => `${SYSTEM_CONFIG_PATH}/instance`,
);
export const updateInstanceConfig = defineJsonEndpoint<[payload: UpdateInstanceConfigRequest], UpdateInstanceConfigResponse>(
  "PATCH", () => `${SYSTEM_CONFIG_PATH}/instance`, (payload) => payload,
);
