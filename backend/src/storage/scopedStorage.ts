import type { ObjectListResult, StorageClient } from "../types.js";
import { normalizeObjectKey, normalizePrefix } from "./s3Storage.js";

function assertSafeSegments(path: string): void {
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("INVALID_SCOPED_PATH");
  }
}

export function normalizeRootPrefix(prefix: string | undefined): string {
  const normalized = normalizePrefix(prefix);
  assertSafeSegments(normalized);
  return normalized;
}

export class ScopedStorage implements StorageClient {
  private readonly rootPrefix: string;

  constructor(
    private readonly storage: StorageClient,
    rootPrefix: string
  ) {
    this.rootPrefix = normalizeRootPrefix(rootPrefix);
  }

  async listObjects(input: {
    prefix: string;
    continuationToken?: string;
  }): Promise<ObjectListResult> {
    const relativePrefix = normalizePrefix(input.prefix);
    assertSafeSegments(relativePrefix);

    const result = await this.storage.listObjects({
      prefix: `${this.rootPrefix}${relativePrefix}`,
      continuationToken: input.continuationToken
    });

    return {
      prefix: this.stripRoot(result.prefix),
      folders: result.folders
        .filter((folder) => folder.prefix.startsWith(this.rootPrefix))
        .map((folder) => ({ ...folder, prefix: this.stripRoot(folder.prefix) })),
      files: result.files
        .filter((file) => file.key.startsWith(this.rootPrefix))
        .map((file) => ({ ...file, key: this.stripRoot(file.key) })),
      nextContinuationToken: result.nextContinuationToken
    };
  }

  async createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const relativeKey = normalizeObjectKey(input.key);
    assertSafeSegments(relativeKey);

    return this.storage.createDownloadUrl({
      key: `${this.rootPrefix}${relativeKey}`,
      expiresInSeconds: input.expiresInSeconds
    });
  }

  private stripRoot(value: string): string {
    return value.startsWith(this.rootPrefix) ? value.slice(this.rootPrefix.length) : "";
  }
}
