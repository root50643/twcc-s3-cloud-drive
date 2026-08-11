import "./auth/session.js";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import type { PasswordHasher } from "./auth/passwords.js";
import { SQLiteSessionStore } from "./auth/sqliteSessionStore.js";
import type { AppConfig } from "./config/env.js";
import type { AppDatabase } from "./database/database.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createAdminRouter } from "./routes/admin.js";
import { createAuthRouter } from "./routes/auth.js";
import { createObjectsRouter } from "./routes/objects.js";
import type { StorageAdminClient } from "./types.js";

type RuntimeConfig = Pick<
  AppConfig,
  | "NODE_ENV"
  | "TRUST_PROXY_HOPS"
  | "SESSION_SECRET"
  | "COOKIE_SECURE"
  | "SESSION_IDLE_MINUTES"
  | "SESSION_ABSOLUTE_HOURS"
  | "LOGIN_RATE_LIMIT_WINDOW_MINUTES"
  | "LOGIN_RATE_LIMIT_PER_USERNAME"
  | "LOGIN_RATE_LIMIT_PER_IP"
  | "SIGNED_URL_EXPIRES_SECONDS"
>;

interface CreateAppOptions {
  config: RuntimeConfig;
  database: AppDatabase;
  passwordHasher: PasswordHasher;
  storage: StorageAdminClient;
}

export function cookieName(config: Pick<RuntimeConfig, "COOKIE_SECURE">): string {
  return config.COOKIE_SECURE ? "__Host-s3drive.sid" : "s3drive.sid";
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();
  const idleTimeoutMs = options.config.SESSION_IDLE_MINUTES * 60_000;
  const absoluteTimeoutMs = options.config.SESSION_ABSOLUTE_HOURS * 3_600_000;
  const sessionStore = new SQLiteSessionStore(
    options.database,
    idleTimeoutMs,
    absoluteTimeoutMs
  );
  const sessionCookieName = cookieName(options.config);

  app.disable("x-powered-by");
  app.set("trust proxy", options.config.TRUST_PROXY_HOPS);
  app.use(
    helmet({
      strictTransportSecurity: options.config.COOKIE_SECURE ? undefined : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      }
    })
  );
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "64kb" }));
  app.use(
    session({
      name: sessionCookieName,
      secret: options.config.SESSION_SECRET,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: options.config.COOKIE_SECURE,
        path: "/",
        maxAge: idleTimeoutMs
      }
    })
  );

  app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true, initialized: options.database.countUsers() > 0 });
  });

  app.use("/api/v1", csrfProtection);
  app.use(
    "/api/v1/auth",
    createAuthRouter({
      database: options.database,
      passwordHasher: options.passwordHasher,
      absoluteTimeoutMs,
      rateLimitWindowMs: options.config.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      rateLimitPerUsername: options.config.LOGIN_RATE_LIMIT_PER_USERNAME,
      rateLimitPerIp: options.config.LOGIN_RATE_LIMIT_PER_IP,
      cookieName: sessionCookieName
    })
  );
  app.use(
    "/api/v1/admin",
    createAdminRouter({
      database: options.database,
      passwordHasher: options.passwordHasher,
      storage: options.storage,
      absoluteTimeoutMs,
      cookieName: sessionCookieName
    })
  );
  app.use(
    "/api/v1",
    createObjectsRouter({
      database: options.database,
      storage: options.storage,
      signedUrlExpiresSeconds: options.config.SIGNED_URL_EXPIRES_SECONDS,
      absoluteTimeoutMs
    })
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
