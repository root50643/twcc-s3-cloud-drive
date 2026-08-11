import { randomBytes } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import type { PasswordHasher } from "../auth/passwords.js";
import type { AppDatabase } from "../database/database.js";
import { createRequireAuth, currentUser } from "../middleware/auth.js";
import { rotateCsrfToken } from "../middleware/csrf.js";
import { HttpError } from "../middleware/errors.js";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1)
});

interface AuthRouterOptions {
  database: AppDatabase;
  passwordHasher: PasswordHasher;
  absoluteTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitPerUsername: number;
  rateLimitPerIp: number;
  cookieName: string;
}

export function createAuthRouter(options: AuthRouterOptions): Router {
  const router = Router();
  const requireAuth = createRequireAuth(options.database, options.absoluteTimeoutMs);
  const dummyHash = options.passwordHasher.hash(randomBytes(32).toString("base64url"));

  router.get("/csrf", (req, res, next) => {
    const csrfToken = req.session.csrfToken ?? rotateCsrfToken(req);
    req.session.save((error) => {
      if (error) {
        next(error);
        return;
      }
      res.json({ csrfToken });
    });
  });

  router.post("/login", async (req, res, next) => {
    try {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(400, "INVALID_LOGIN_REQUEST", "Username and password are required.");
      }

      const username = body.data.username;
      const ipAddress = clientIp(req.ip, req.socket.remoteAddress);
      const since = new Date(Date.now() - options.rateLimitWindowMs).toISOString();
      const failures = options.database.recentLoginFailures({ username, ipAddress, since });
      if (
        failures.username >= options.rateLimitPerUsername ||
        failures.ip >= options.rateLimitPerIp
      ) {
        options.database.recordLogin({ userId: null, username, outcome: "rate_limited", ipAddress });
        throw new HttpError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Try again later.");
      }

      const user = options.database.getUserByUsername(username);
      const passwordHash = user?.passwordHash ?? (await dummyHash);
      const matches = await options.passwordHasher.verify(passwordHash, body.data.password);
      if (!user || !matches) {
        options.database.recordLogin({ userId: user?.id ?? null, username, outcome: "failure", ipAddress });
        throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid username or password.");
      }

      options.database.recordLogin({ userId: user.id, username: user.username, outcome: "success", ipAddress });
      await regenerateSession(req);
      req.session.user = { id: user.id };
      req.session.authenticatedAt = Date.now();
      const csrfToken = rotateCsrfToken(req);
      await saveSession(req);
      res.json({
        user: { id: user.id, username: user.username, role: user.role, s3Prefix: user.s3Prefix },
        csrfToken
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", requireAuth, (req, res, next) => {
    req.session.destroy((error) => {
      if (error) {
        next(error);
        return;
      }
      res.clearCookie(options.cookieName, { path: "/" });
      res.status(204).send();
    });
  });

  router.get("/me", requireAuth, (_req, res) => {
    res.json({ user: currentUser(res) });
  });

  router.post("/change-password", requireAuth, async (req, res, next) => {
    try {
      const body = changePasswordSchema.safeParse(req.body);
      if (!body.success) {
        throw new HttpError(400, "INVALID_PASSWORD_REQUEST", "Current and new passwords are required.");
      }
      const user = options.database.getUserById(currentUser(res).id)!;
      const matches = await options.passwordHasher.verify(user.passwordHash, body.data.currentPassword);
      if (!matches) {
        throw new HttpError(400, "INVALID_CURRENT_PASSWORD", "The current password is incorrect.");
      }
      const passwordHash = await options.passwordHasher.hash(body.data.newPassword);
      options.database.updatePassword(user.id, passwordHash);
      options.database.deleteSessionsForUser(user.id);
      await destroySession(req);
      res.clearCookie(options.cookieName, { path: "/" });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
}

function clientIp(primary: string | undefined, fallback: string | undefined): string {
  return (primary || fallback || "unknown").replace(/^::ffff:/, "");
}
