import type {
  AdminAuditItem,
  AdminUser,
  ApiErrorBody,
  AuditPage,
  BatchDownloadResponse,
  DownloadAuditItem,
  LoginAuditItem,
  ObjectListResponse,
  User
} from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
const sessionEndedListeners = new Set<() => void>();

export function clearApiSessionState(): void {
  csrfToken = null;
}

export function subscribeSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
  let message = "Request failed.";
  let code = "REQUEST_FAILED";
  try {
    const body = (await response.json()) as ApiErrorBody;
    message = body.error?.message ?? message;
    code = body.error?.code ?? code;
  } catch {
    // Keep the generic response.
  }
  throw new ApiError(response.status, code, message);
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/v1/auth/csrf", { credentials: "include" });
  const body = await parseResponse<{ csrfToken: string }>(response);
  csrfToken = body.csrfToken;
  return csrfToken;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers.set("X-CSRF-Token", await ensureCsrfToken());
  }
  const response = await fetch(path, { ...init, headers, credentials: "include" });
  const expectedUnauthenticatedCheck = path === "/api/v1/auth/me";
  if (
    response.status === 401 &&
    path !== "/api/v1/auth/login" &&
    !expectedUnauthenticatedCheck
  ) {
    clearApiSessionState();
    for (const listener of sessionEndedListeners) listener();
  }
  return response;
}

function jsonBody(value: unknown): Pick<RequestInit, "headers" | "body"> {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  };
}

export async function getCurrentUser(): Promise<User | null> {
  await ensureCsrfToken();
  const response = await apiFetch("/api/v1/auth/me");
  if (response.status === 401) return null;
  return (await parseResponse<{ user: User }>(response)).user;
}

export async function login(username: string, password: string): Promise<User> {
  const response = await apiFetch("/api/v1/auth/login", {
    method: "POST",
    ...jsonBody({ username, password })
  });
  const body = await parseResponse<{ user: User; csrfToken: string }>(response);
  csrfToken = body.csrfToken;
  return body.user;
}

export async function logout(): Promise<void> {
  const response = await apiFetch("/api/v1/auth/logout", { method: "POST" });
  await parseResponse<void>(response);
  clearApiSessionState();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const response = await apiFetch("/api/v1/auth/change-password", {
    method: "POST",
    ...jsonBody({ currentPassword, newPassword })
  });
  await parseResponse<void>(response);
  clearApiSessionState();
}

export async function listObjects(prefix: string, continuationToken?: string): Promise<ObjectListResponse> {
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  if (continuationToken) params.set("continuationToken", continuationToken);
  return parseResponse<ObjectListResponse>(await apiFetch(`/api/v1/objects?${params.toString()}`));
}

export async function createDownloadUrl(key: string): Promise<string> {
  const response = await apiFetch("/api/v1/download-urls", {
    method: "POST",
    ...jsonBody({ key })
  });
  return (await parseResponse<{ url: string }>(response)).url;
}

export async function createBatchDownloadUrls(keys: string[]): Promise<BatchDownloadResponse> {
  return parseResponse<BatchDownloadResponse>(await apiFetch("/api/v1/download-urls/batch", {
    method: "POST",
    ...jsonBody({ keys })
  }));
}

export async function listUsers(): Promise<AdminUser[]> {
  return (await parseResponse<{ users: AdminUser[] }>(await apiFetch("/api/v1/admin/users"))).users;
}

export async function createUser(input: { username: string; password: string; role: User["role"]; s3Prefix: string }): Promise<AdminUser> {
  const response = await apiFetch("/api/v1/admin/users", { method: "POST", ...jsonBody(input) });
  return (await parseResponse<{ user: AdminUser }>(response)).user;
}

export async function updateUser(id: number, input: { role: User["role"]; s3Prefix: string }): Promise<{ user: AdminUser; signedOut: boolean }> {
  return parseResponse(await apiFetch(`/api/v1/admin/users/${id}`, { method: "PATCH", ...jsonBody(input) }));
}

export async function resetUserPassword(id: number, password: string): Promise<{ signedOut: boolean }> {
  return parseResponse(await apiFetch(`/api/v1/admin/users/${id}/reset-password`, {
    method: "POST",
    ...jsonBody({ password })
  }));
}

export async function deleteUser(id: number): Promise<{ deleted: boolean; signedOut: boolean }> {
  return parseResponse(await apiFetch(`/api/v1/admin/users/${id}`, { method: "DELETE" }));
}

export async function validateS3Path(s3Prefix: string): Promise<{ normalizedPrefix: string; exists: boolean; wholeBucket: boolean }> {
  return parseResponse(await apiFetch("/api/v1/admin/s3-paths/validate", {
    method: "POST",
    ...jsonBody({ s3Prefix })
  }));
}

export type AuditKind = "logins" | "downloads" | "admin-actions";
export type AuditItemFor<K extends AuditKind> = K extends "logins"
  ? LoginAuditItem
  : K extends "downloads"
    ? DownloadAuditItem
    : AdminAuditItem;

export async function listAudit<K extends AuditKind>(kind: K, input: { cursor?: string; username?: string }): Promise<AuditPage<AuditItemFor<K>>> {
  const params = new URLSearchParams({ limit: "50" });
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.username) params.set("username", input.username);
  return parseResponse(await apiFetch(`/api/v1/admin/audit/${kind}?${params.toString()}`));
}
