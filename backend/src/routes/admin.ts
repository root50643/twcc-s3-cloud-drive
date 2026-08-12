import { Router, type Request } from "express";
import { z } from "zod";
import type { PasswordHasher } from "../auth/passwords.js";
import {
  type AppDatabase,
  DatabaseDomainError,
  type UserRecord
} from "../database/database.js";
import { createRequireAuth, currentUser, requireAdmin } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { normalizeRootPrefix } from "../storage/scopedStorage.js";
import type { StorageAdminClient, UserRole } from "../types.js";

const usernameSchema = z.string().trim().min(1).max(128).refine(
  (value) => !/[\u0000-\u001f\u007f]/.test(value),
  "Username contains invalid characters."
);
const passwordSchema = z.string().min(1);
const roleSchema = z.enum(["admin", "user"]);
const noteSchema = z.string().max(1_000);

const createUserSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: roleSchema,
  s3Prefix: z.string(),
  note: noteSchema.default("")
});
const updateUserSchema = z.object({ role: roleSchema, s3Prefix: z.string(), note: noteSchema.optional() });
const resetPasswordSchema = z.object({ password: passwordSchema });
const validatePathSchema = z.object({ s3Prefix: z.string() });
const auditQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  username: z.string().trim().min(1).max(128).optional()
});

interface AdminRouterOptions {
  database: AppDatabase;
  passwordHasher: PasswordHasher;
  storage: StorageAdminClient;
  absoluteTimeoutMs: number;
  cookieName: string;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();
  router.use(createRequireAuth(options.database, options.absoluteTimeoutMs), requireAdmin);

  router.get("/users", (_req, res) => {
    res.json({ users: options.database.listUsers().map(publicUser) });
  });

  router.post("/users", async (req, res, next) => {
    try {
      const body = createUserSchema.safeParse(req.body);
      if (!body.success) throw invalidAccountRequest();
      const s3Prefix = await validatedPrefix(options.storage, body.data.role, body.data.s3Prefix);
      const passwordHash = await options.passwordHasher.hash(body.data.password);
      const user = options.database.createUser({
        username: body.data.username,
        passwordHash,
        role: body.data.role,
        s3Prefix,
        note: body.data.note
      });
      options.database.recordAdminEvent({
        actor: currentUser(res),
        action: "user.created",
        targetUsername: user.username,
        details: { role: user.role, s3Prefix: user.s3Prefix, hasNote: user.note.length > 0 },
        ipAddress: requestIp(req.ip)
      });
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      next(mapAdminError(error));
    }
  });

  router.patch("/users/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const body = updateUserSchema.safeParse(req.body);
      if (!body.success) throw invalidAccountRequest();
      const existing = options.database.getUserById(id);
      if (!existing) throw new DatabaseDomainError("USER_NOT_FOUND");
      const s3Prefix = await validatedPrefix(options.storage, body.data.role, body.data.s3Prefix);
      const note = body.data.note ?? existing.note;
      const result = options.database.updateUserAccess(id, body.data.role, s3Prefix, note);
      if (result.roleChanged) options.database.deleteSessionsForUser(id);
      options.database.recordAdminEvent({
        actor: currentUser(res),
        action: "user.access_updated",
        targetUsername: result.user.username,
        details: {
          previousRole: existing.role,
          role: result.user.role,
          previousS3Prefix: existing.s3Prefix,
          s3Prefix: result.user.s3Prefix,
          noteChanged: existing.note !== result.user.note
        },
        ipAddress: requestIp(req.ip)
      });
      const signedOut = result.roleChanged && id === currentUser(res).id;
      if (signedOut) {
        await destroySession(req);
        res.clearCookie(options.cookieName, { path: "/" });
      }
      res.json({ user: publicUser(result.user), signedOut });
    } catch (error) {
      next(mapAdminError(error));
    }
  });

  router.post("/users/:id/reset-password", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const body = resetPasswordSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "INVALID_PASSWORD_REQUEST", "A new password is required.");
      const passwordHash = await options.passwordHasher.hash(body.data.password);
      const user = options.database.updatePassword(id, passwordHash);
      options.database.deleteSessionsForUser(id);
      options.database.recordAdminEvent({
        actor: currentUser(res),
        action: "user.password_reset",
        targetUsername: user.username,
        ipAddress: requestIp(req.ip)
      });
      const signedOut = id === currentUser(res).id;
      if (signedOut) {
        await destroySession(req);
        res.clearCookie(options.cookieName, { path: "/" });
      }
      res.json({ signedOut });
    } catch (error) {
      next(mapAdminError(error));
    }
  });

  router.delete("/users/:id", async (req, res, next) => {
    try {
      const id = parseId(req.params.id);
      const actor = currentUser(res);
      const deleted = options.database.deleteUser(id);
      options.database.recordAdminEvent({
        actor,
        action: "user.deleted",
        targetUsername: deleted.username,
        details: { role: deleted.role, s3Prefix: deleted.s3Prefix, hadNote: deleted.note.length > 0 },
        ipAddress: requestIp(req.ip)
      });
      const signedOut = id === actor.id;
      if (signedOut) {
        await destroySession(req);
        res.clearCookie(options.cookieName, { path: "/" });
      }
      res.json({ deleted: true, signedOut });
    } catch (error) {
      next(mapAdminError(error));
    }
  });

  router.post("/s3-paths/validate", async (req, res, next) => {
    try {
      const body = validatePathSchema.safeParse(req.body);
      if (!body.success) throw new HttpError(400, "INVALID_S3_PATH", "Invalid S3 path.");
      const normalizedPrefix = normalizeRootPrefix(body.data.s3Prefix);
      const exists = await options.storage.prefixExists(normalizedPrefix);
      res.json({ normalizedPrefix, exists, wholeBucket: normalizedPrefix === "" });
    } catch (error) {
      next(mapAdminError(error));
    }
  });

  router.get("/audit/logins", (req, res, next) => {
    try {
      const query = parseAuditQuery(req.query);
      res.json(options.database.listLoginEvents(query));
    } catch (error) { next(error); }
  });
  router.get("/audit/downloads", (req, res, next) => {
    try {
      const query = parseAuditQuery(req.query);
      res.json(options.database.listDownloadEvents(query));
    } catch (error) { next(error); }
  });
  router.get("/audit/admin-actions", (req, res, next) => {
    try {
      const query = parseAuditQuery(req.query);
      res.json(options.database.listAdminEvents(query));
    } catch (error) { next(error); }
  });

  return router;
}

async function validatedPrefix(storage: StorageAdminClient, role: UserRole, input: string): Promise<string> {
  let normalized: string;
  try {
    normalized = normalizeRootPrefix(input);
  } catch {
    throw new HttpError(400, "INVALID_S3_PATH", "Invalid S3 path.");
  }
  if (role !== "admin" && normalized === "") {
    throw new HttpError(400, "S3_SCOPE_REQUIRED", "A storage path is required for regular users.");
  }
  if (!(await storage.prefixExists(normalized))) {
    throw new HttpError(400, "S3_PATH_NOT_FOUND", "The storage path does not exist.");
  }
  return normalized;
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    s3Prefix: user.s3Prefix,
    note: user.note,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, "INVALID_USER_ID", "Invalid user ID.");
  return id;
}

function parseAuditQuery(query: unknown) {
  const parsed = auditQuerySchema.safeParse(query);
  if (!parsed.success) throw new HttpError(400, "INVALID_AUDIT_QUERY", "Invalid audit query.");
  return parsed.data;
}

function invalidAccountRequest(): HttpError {
  return new HttpError(400, "INVALID_ACCOUNT_REQUEST", "Invalid account details.");
}

function mapAdminError(error: unknown): unknown {
  if (error instanceof HttpError) return error;
  if (error instanceof DatabaseDomainError) {
    if (error.code === "USERNAME_EXISTS") return new HttpError(409, error.code, "That username is already in use.");
    if (error.code === "LAST_ADMIN") return new HttpError(409, error.code, "The final administrator cannot be deleted or demoted.");
    return new HttpError(404, error.code, "User not found.");
  }
  if (error instanceof Error && error.message === "INVALID_SCOPED_PATH") {
    return new HttpError(400, "INVALID_S3_PATH", "Invalid S3 path.");
  }
  if (error instanceof Error && error.message === "S3_PATH_CHECK_FAILED") {
    return new HttpError(502, "S3_PATH_CHECK_FAILED", "Unable to validate the storage path.");
  }
  return error;
}

function requestIp(value: string | undefined): string {
  return (value || "unknown").replace(/^::ffff:/, "");
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
}
