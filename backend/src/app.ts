import "./auth/session.js";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import type { UserStore } from "./auth/userStore.js";
import type { AppConfig } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createAuthRouter } from "./routes/auth.js";
import { createObjectsRouter } from "./routes/objects.js";
import type { StorageClient } from "./types.js";

interface CreateAppOptions {
  config: Pick<AppConfig, "NODE_ENV" | "SESSION_SECRET" | "SIGNED_URL_EXPIRES_SECONDS">;
  userStore: UserStore;
  storage: StorageClient;
}

export function createApp(options: CreateAppOptions): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "64kb" }));
  app.use(
    session({
      name: "sid",
      secret: options.config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 1000 * 60 * 60 * 8
      }
    })
  );

  app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/v1/auth", createAuthRouter(options.userStore));
  app.use("/api/v1", createObjectsRouter(options.storage, options.config.SIGNED_URL_EXPIRES_SECONDS));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
