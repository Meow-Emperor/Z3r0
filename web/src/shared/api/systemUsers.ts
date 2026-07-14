import { defineJsonEndpoint } from "./client";
import { buildQuery } from "./query";
import type {
  CreateSystemUserRequest,
  CreateSystemUserResponse,
  DeleteSystemUserResponse,
  LoginRequest,
  LoginResponse,
  QuerySystemUsersParams,
  QuerySystemUsersResponse,
  SystemUserPathParams,
  UpdateSystemUserRequest,
  UpdateSystemUserResponse,
} from "./types";

const SYSTEM_USERS_PATH = "/api/system-users";

export const login = defineJsonEndpoint<[payload: LoginRequest], LoginResponse>(
  "POST", () => `${SYSTEM_USERS_PATH}/login`, (payload) => payload, false,
);
export const querySystemUsers = defineJsonEndpoint<[params: QuerySystemUsersParams], QuerySystemUsersResponse>(
  "GET", (params) => `${SYSTEM_USERS_PATH}${buildQuery(params)}`,
);
export const createSystemUser = defineJsonEndpoint<[payload: CreateSystemUserRequest], CreateSystemUserResponse>(
  "POST", () => SYSTEM_USERS_PATH, (payload) => payload,
);
export const updateSystemUser = defineJsonEndpoint<
  [id: SystemUserPathParams["id"], payload: UpdateSystemUserRequest], UpdateSystemUserResponse
>("PATCH", (id) => `${SYSTEM_USERS_PATH}/${id}`, (_, payload) => payload);
export const deleteSystemUser = defineJsonEndpoint<[id: SystemUserPathParams["id"]], DeleteSystemUserResponse>(
  "DELETE", (id) => `${SYSTEM_USERS_PATH}/${id}`,
);
