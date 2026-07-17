export interface User {
  username: string;
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
