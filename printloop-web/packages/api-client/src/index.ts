import createClient, { type Client, type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";
import { ApiError } from "./errors";

export type { components, paths };
export type Schemas = components["schemas"];
export type ApiClient = Client<paths>;

export { ApiError, isApiError, errorMessage } from "./errors";

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  const b = (body ?? {}) as { message?: string; code?: string };
  const message =
    b.message ||
    (response.status === 401
      ? "Please sign in to continue."
      : response.status === 403
        ? "You don't have access to this."
        : response.status === 404
          ? "Not found."
          : response.status === 429
            ? "Too many requests. Please wait a moment."
            : response.status >= 500
              ? "PrintLoop is having trouble right now. Please try again."
              : response.statusText || "Request failed");
  return new ApiError(response.status, message, b.code, body);
}

const throwOnError: Middleware = {
  async onResponse({ response }) {
    if (!response.ok) throw await toApiError(response);
    return undefined;
  },
};

export interface CreateApiClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
  credentials?: RequestCredentials;
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    headers: options.headers,
    fetch: options.fetch,
    credentials: options.credentials,
  });
  client.use(throwOnError);
  return client;
}

type Envelope<T> = T extends { success: boolean; data?: infer D } ? D : T;

export function unwrapEnvelope<T>(body: T): Envelope<T> {
  if (body && typeof body === "object" && "success" in (body as object)) {
    return (body as { data?: unknown }).data as Envelope<T>;
  }
  return body as Envelope<T>;
}

export async function unwrap<T>(request: Promise<{ data?: T; response: Response }>): Promise<Envelope<T>> {
  const { data } = await request;
  return unwrapEnvelope(data as T);
}

export { uploadDirect, type UploadPurpose, type DirectUploadOptions } from "./upload";
export { JOB_STATUSES, type JobStatus } from "./constants";
