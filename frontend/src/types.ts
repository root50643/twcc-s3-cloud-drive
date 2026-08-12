export interface User {
  id: number;
  username: string;
  role: "admin" | "user";
  s3Prefix: string;
}

export interface AdminUser extends User {
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface FolderItem {
  name: string;
  prefix: string;
}

export interface FileItem {
  key: string;
  name: string;
  size: number;
  lastModified: string | null;
}

export interface ObjectListResponse {
  prefix: string;
  folders: FolderItem[];
  files: FileItem[];
  nextContinuationToken: string | null;
}

export interface BatchDownloadItem {
  key: string;
  url: string;
}

export interface BatchDownloadResponse {
  downloads: BatchDownloadItem[];
  expiresInSeconds: number;
}

export interface ApiErrorBody {
  error?: {
    code: string;
    message: string;
  };
}

export interface AuditPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LoginAuditItem {
  id: number;
  username: string;
  success: boolean;
  outcome: "success" | "failure" | "rate_limited";
  ipAddress: string;
  createdAt: string;
}

export interface DownloadAuditItem {
  id: number;
  username: string;
  objectKey: string;
  createdAt: string;
}

export interface AdminAuditItem {
  id: number;
  actorUsername: string;
  action: string;
  targetUsername: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: string;
}
