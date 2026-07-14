export interface AppUser {
  username: string;
}

export interface StoredUser {
  username: string;
  passwordHash: string;
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

export interface ObjectListResult {
  prefix: string;
  folders: FolderItem[];
  files: FileItem[];
  nextContinuationToken: string | null;
}

export interface StorageClient {
  listObjects(input: {
    prefix: string;
    continuationToken?: string;
  }): Promise<ObjectListResult>;
  createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;
}
