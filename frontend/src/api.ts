import type { ApiErrorBody, ObjectListResponse, User } from "./types";

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  let message = "Request failed.";
  try {
    const body = (await response.json()) as ApiErrorBody;
    message = body.error?.message ?? message;
  } catch {
    // Keep the generic message.
  }
  throw new ApiError(response.status, message);
}

export async function getCurrentUser(): Promise<User | null> {
  const response = await fetch("/api/v1/auth/me", {
    credentials: "include"
  });

  if (response.status === 401) {
    return null;
  }

  const body = await parseResponse<{ user: User }>(response);
  return body.user;
}

export async function login(username: string, password: string): Promise<User> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ username, password })
  });
  const body = await parseResponse<{ user: User }>(response);
  return body.user;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/v1/auth/logout", {
    method: "POST",
    credentials: "include"
  });
  await parseResponse<void>(response);
}

export async function listObjects(
  prefix: string,
  continuationToken?: string
): Promise<ObjectListResponse> {
  const params = new URLSearchParams();
  if (prefix) {
    params.set("prefix", prefix);
  }
  if (continuationToken) {
    params.set("continuationToken", continuationToken);
  }

  const response = await fetch(`/api/v1/objects?${params.toString()}`, {
    credentials: "include"
  });
  return parseResponse<ObjectListResponse>(response);
}

export async function createDownloadUrl(key: string): Promise<string> {
  const response = await fetch("/api/v1/download-urls", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    credentials: "include",
    body: JSON.stringify({ key })
  });
  const body = await parseResponse<{ url: string }>(response);
  return body.url;
}
