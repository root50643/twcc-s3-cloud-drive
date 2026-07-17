import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { normalizeObjectKey, normalizePrefix } from "../storage/s3Storage.js";
import type { StorageClient } from "../types.js";

const listQuerySchema = z.object({
  prefix: z.string().optional().default(""),
  continuationToken: z.string().optional()
});

const downloadBodySchema = z.object({
  key: z.string().min(1)
});

export const MAX_BATCH_DOWNLOAD_FILES = 20;

const batchDownloadBodySchema = z.object({
  keys: z.array(z.string().min(1)).min(1).max(MAX_BATCH_DOWNLOAD_FILES)
});

export function createObjectsRouter(
  storage: StorageClient,
  signedUrlExpiresSeconds: number
): Router {
  const router = Router();

  router.get("/objects", requireAuth, async (req, res, next) => {
    try {
      const query = listQuerySchema.safeParse(req.query);
      if (!query.success) {
        throw new HttpError(400, "INVALID_LIST_REQUEST", "Invalid object list request.");
      }

      const result = await storage.listObjects({
        prefix: normalizePrefix(query.data.prefix),
        continuationToken: query.data.continuationToken
      });
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_SCOPED_PATH") {
        next(new HttpError(400, "INVALID_OBJECT_PATH", "Invalid object path."));
        return;
      }
      if (error instanceof Error && error.message === "S3_LIST_FAILED") {
        next(new HttpError(502, "S3_LIST_FAILED", "Unable to list objects."));
        return;
      }
      next(error);
    }
  });

  router.post("/download-urls", requireAuth, async (req, res, next) => {
    try {
      const body = downloadBodySchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(400, "INVALID_DOWNLOAD_REQUEST", "A file key is required.");
      }

      const key = normalizeObjectKey(body.data.key);
      const url = await storage.createDownloadUrl({
        key,
        expiresInSeconds: signedUrlExpiresSeconds
      });

      res.json({
        url,
        expiresInSeconds: signedUrlExpiresSeconds
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_SCOPED_PATH") {
        next(new HttpError(400, "INVALID_OBJECT_PATH", "Invalid object path."));
        return;
      }
      if (error instanceof Error && error.message === "S3_DOWNLOAD_URL_FAILED") {
        next(new HttpError(502, "S3_DOWNLOAD_URL_FAILED", "Unable to create download URL."));
        return;
      }
      next(error);
    }
  });

  router.post("/download-urls/batch", requireAuth, async (req, res, next) => {
    try {
      const body = batchDownloadBodySchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(
          400,
          "INVALID_BATCH_DOWNLOAD_REQUEST",
          `Between 1 and ${MAX_BATCH_DOWNLOAD_FILES} file keys are required.`
        );
      }

      const keys = [...new Set(body.data.keys.map((key) => normalizeObjectKey(key)))];
      const downloads = await Promise.all(
        keys.map(async (key) => ({
          key,
          url: await storage.createDownloadUrl({
            key,
            expiresInSeconds: signedUrlExpiresSeconds
          })
        }))
      );

      res.json({
        downloads,
        expiresInSeconds: signedUrlExpiresSeconds
      });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_SCOPED_PATH") {
        next(new HttpError(400, "INVALID_OBJECT_PATH", "Invalid object path."));
        return;
      }
      if (error instanceof Error && error.message === "S3_DOWNLOAD_URL_FAILED") {
        next(new HttpError(502, "S3_DOWNLOAD_URL_FAILED", "Unable to create download URLs."));
        return;
      }
      next(error);
    }
  });

  return router;
}
