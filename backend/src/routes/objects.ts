import { Router } from "express";
import { z } from "zod";
import type { AppDatabase } from "../database/database.js";
import { createRequireAuth, currentUser } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { ScopedStorage } from "../storage/scopedStorage.js";
import { normalizeObjectKey, normalizePrefix } from "../storage/s3Storage.js";
import type { StorageClient } from "../types.js";

const listQuerySchema = z.object({
  prefix: z.string().optional().default(""),
  continuationToken: z.string().optional()
});

const downloadBodySchema = z.object({ key: z.string().min(1) });

export const MAX_BATCH_DOWNLOAD_FILES = 20;

const batchDownloadBodySchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(MAX_BATCH_DOWNLOAD_FILES)
});

interface ObjectRouterOptions {
  database: AppDatabase;
  storage: StorageClient;
  signedUrlExpiresSeconds: number;
  absoluteTimeoutMs: number;
}

export function createObjectsRouter(options: ObjectRouterOptions): Router {
  const router = Router();
  router.use(createRequireAuth(options.database, options.absoluteTimeoutMs));

  router.get("/objects", async (req, res, next) => {
    try {
      const query = listQuerySchema.safeParse(req.query);
      if (!query.success) {
        throw new HttpError(400, "INVALID_LIST_REQUEST", "Invalid object list request.");
      }
      const storage = scopedStorage(options.storage, res);
      const result = await storage.listObjects({
        prefix: normalizePrefix(query.data.prefix),
        continuationToken: query.data.continuationToken
      });
      res.json(result);
    } catch (error) {
      next(mapStorageError(error, false));
    }
  });

  router.post("/download-urls", async (req, res, next) => {
    try {
      const body = downloadBodySchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(400, "INVALID_DOWNLOAD_REQUEST", "A file key is required.");
      }
      const storage = scopedStorage(options.storage, res);
      const key = normalizeObjectKey(body.data.key);
      const url = await storage.createDownloadUrl({ key, expiresInSeconds: options.signedUrlExpiresSeconds });
      options.database.recordDownloads(currentUser(res), [storage.resolveObjectKey(key)]);
      res.json({ url, expiresInSeconds: options.signedUrlExpiresSeconds });
    } catch (error) {
      next(mapStorageError(error, true));
    }
  });

  router.post("/download-urls/batch", async (req, res, next) => {
    try {
      const body = batchDownloadBodySchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(
          400,
          "INVALID_BATCH_DOWNLOAD_REQUEST",
          `Between 1 and ${MAX_BATCH_DOWNLOAD_FILES} file keys are required.`
        );
      }
      const storage = scopedStorage(options.storage, res);
      const keys = [...new Set(body.data.keys.map((key) => normalizeObjectKey(key)))];
      const downloads = await Promise.all(
        keys.map(async (key) => ({
          key,
          url: await storage.createDownloadUrl({ key, expiresInSeconds: options.signedUrlExpiresSeconds })
        }))
      );
      options.database.recordDownloads(currentUser(res), keys.map((key) => storage.resolveObjectKey(key)));
      res.json({ downloads, expiresInSeconds: options.signedUrlExpiresSeconds });
    } catch (error) {
      next(mapStorageError(error, true, true));
    }
  });

  return router;
}

function scopedStorage(storage: StorageClient, res: Parameters<typeof currentUser>[0]): ScopedStorage {
  const user = currentUser(res);
  if (user.role !== "admin" && !user.s3Prefix) {
    throw new HttpError(403, "S3_SCOPE_NOT_CONFIGURED", "權限設定錯誤，請聯絡管理員。");
  }
  return new ScopedStorage(storage, user.s3Prefix);
}

function mapStorageError(error: unknown, download: boolean, batch = false): unknown {
  if (error instanceof HttpError) return error;
  if (error instanceof Error && error.message === "INVALID_SCOPED_PATH") {
    return new HttpError(400, "INVALID_OBJECT_PATH", "Invalid object path.");
  }
  if (error instanceof Error && error.message === "S3_LIST_FAILED") {
    return new HttpError(502, "S3_LIST_FAILED", "Unable to list objects.");
  }
  if (download && error instanceof Error && error.message === "S3_DOWNLOAD_URL_FAILED") {
    return new HttpError(
      502,
      "S3_DOWNLOAD_URL_FAILED",
      batch ? "Unable to create download URLs." : "Unable to create download URL."
    );
  }
  return error;
}
