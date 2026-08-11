import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppConfig } from "../config/env.js";
import type { FileItem, FolderItem, ObjectListResult, StorageAdminClient } from "../types.js";

function basenameFromKey(key: string): string {
  const trimmed = key.endsWith("/") ? key.slice(0, -1) : key;
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || trimmed;
}

export function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) {
    return "";
  }
  const withoutLeadingSlash = prefix.replace(/^\/+/, "").replace(/\\/g, "/");
  return withoutLeadingSlash && !withoutLeadingSlash.endsWith("/")
    ? `${withoutLeadingSlash}/`
    : withoutLeadingSlash;
}

export function normalizeObjectKey(key: string): string {
  return key.replace(/^\/+/, "").replace(/\\/g, "/");
}

export class S3Storage implements StorageAdminClient {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: AppConfig) {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY
      }
    });
  }

  async listObjects(input: {
    prefix: string;
    continuationToken?: string;
  }): Promise<ObjectListResult> {
    const prefix = normalizePrefix(input.prefix);

    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Delimiter: "/",
          Prefix: prefix,
          ContinuationToken: input.continuationToken
        })
      );

      const folders: FolderItem[] = (response.CommonPrefixes ?? [])
        .map((item) => item.Prefix)
        .filter((folderPrefix): folderPrefix is string => Boolean(folderPrefix))
        .map((folderPrefix) => ({
          name: basenameFromKey(folderPrefix),
          prefix: folderPrefix
        }));

      const files: FileItem[] = (response.Contents ?? [])
        .filter((item) => item.Key && item.Key !== prefix && !item.Key.endsWith("/"))
        .map((item) => ({
          key: item.Key ?? "",
          name: basenameFromKey(item.Key ?? ""),
          size: item.Size ?? 0,
          lastModified: item.LastModified ? item.LastModified.toISOString() : null
        }));

      return {
        prefix,
        folders,
        files,
        nextContinuationToken: response.NextContinuationToken ?? null
      };
    } catch (error) {
      console.error("Failed to list S3 objects", summarizeAwsError(error));
      throw new Error("S3_LIST_FAILED");
    }
  }

  async createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const key = normalizeObjectKey(input.key);

    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
            basenameFromKey(key)
          )}"`
        }),
        { expiresIn: input.expiresInSeconds }
      );
    } catch (error) {
      console.error("Failed to create S3 download URL", summarizeAwsError(error));
      throw new Error("S3_DOWNLOAD_URL_FAILED");
    }
  }

  async prefixExists(inputPrefix: string): Promise<boolean> {
    const prefix = normalizePrefix(inputPrefix);
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          MaxKeys: 1
        })
      );
      return prefix === "" || (response.KeyCount ?? response.Contents?.length ?? 0) > 0;
    } catch (error) {
      console.error("Failed to validate S3 prefix", summarizeAwsError(error));
      throw new Error("S3_PATH_CHECK_FAILED");
    }
  }
}

function summarizeAwsError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { type: typeof error };
  }

  const withMetadata = error as Error & {
    code?: unknown;
    $metadata?: {
      httpStatusCode?: number;
      requestId?: string;
    };
  };

  return {
    name: error.name,
    code: withMetadata.code,
    httpStatusCode: withMetadata.$metadata?.httpStatusCode,
    requestId: withMetadata.$metadata?.requestId
  };
}
