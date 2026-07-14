import { clearStoredAccessToken, getStoredAccessToken } from "../auth/session";
import { ACCESS_TOKEN_HEADER } from "./generated/constants";
import type { CommonResponsePayload } from "./types";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
};

type JsonRequestMethod = NonNullable<RequestOptions["method"]>;

type RawRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: HeadersInit;
  body?: BodyInit;
  auth?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly response?: CommonResponsePayload;

  constructor(status: number, response?: CommonResponsePayload) {
    super(response?.message || "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.response = response;
  }
}

function isCommonResponsePayload(value: unknown): value is CommonResponsePayload {
  return typeof value === "object"
    && value !== null
    && "code" in value
    && typeof value.code === "number"
    && "message" in value
    && typeof value.message === "string";
}

async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return response.json() as Promise<unknown>;
}

function parseCommonResponseError(response: Response, parsed: unknown) {
  const payload = isCommonResponsePayload(parsed) ? parsed : undefined;
  const payloadCode = typeof payload?.code === "number" ? payload.code : response.status;
  if (!response.ok || payloadCode >= 400) {
    handleAuthExpired(response.status, payloadCode);
    throw new ApiError(response.status, payload);
  }
}

export async function apiRequest<ResponsePayload>(path: string, options: RequestOptions = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  addAccessTokenHeader(headers, options.auth);

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new ApiError(0, {
      code: 0,
      message: error instanceof Error ? error.message : "Network request failed",
    });
  }

  const parsed = await parseJsonResponse(response);
  parseCommonResponseError(response, parsed);
  return parsed as ResponsePayload;
}

export function defineJsonEndpoint<Args extends unknown[], ResponsePayload>(
  method: JsonRequestMethod,
  path: (...args: Args) => string,
  body?: (...args: Args) => unknown,
  auth?: boolean,
) {
  return (...args: Args) => apiRequest<ResponsePayload>(path(...args), {
    method,
    body: body?.(...args),
    auth,
  });
}

async function rawApiRequest(path: string, options: RawRequestOptions = {}) {
  const headers = new Headers(options.headers);
  addAccessTokenHeader(headers, options.auth);

  try {
    return await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body,
    });
  } catch (error) {
    throw new ApiError(0, {
      code: 0,
      message: error instanceof Error ? error.message : "Network request failed",
    });
  }
}

export async function apiForm<ResponsePayload>(path: string, body: FormData, auth = true) {
  const response = await rawApiRequest(path, {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
    auth,
  });
  const parsed = await parseJsonResponse(response);
  parseCommonResponseError(response, parsed);
  return parsed as ResponsePayload;
}

export async function apiBlob(path: string, auth = true) {
  const response = await rawApiRequest(path, { auth });
  if (!response.ok) {
    const parsed = await parseJsonResponse(response);
    parseCommonResponseError(response, parsed);
    throw new ApiError(response.status);
  }
  return {
    blob: await response.blob(),
    filename: parseContentDispositionFilename(response.headers.get("content-disposition")),
  };
}

function handleAuthExpired(status: number, payloadCode: number) {
  if (status !== 401 && payloadCode !== 401) return;
  clearStoredAccessToken();
  window.dispatchEvent(new Event("z3r0:auth-expired"));
}

export function buildAuthenticatedWebSocketUrl(path: string, token = getStoredAccessToken()) {
  if (!token) throw new Error("missing access token");
  const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${wsScheme}://${window.location.host}${path}?token=${encodeURIComponent(token)}`;
}

function addAccessTokenHeader(headers: Headers, auth = true) {
  if (!auth) return;
  const token = getStoredAccessToken();
  if (token) {
    headers.set(ACCESS_TOKEN_HEADER, token);
  }
}

function parseContentDispositionFilename(header: string | null) {
  if (!header) return "download";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded?.[1]) return decodeURIComponent(encoded[1]);
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1];
  return "download";
}
