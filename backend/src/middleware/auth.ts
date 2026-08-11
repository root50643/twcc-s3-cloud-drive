import type { NextFunction, Request, Response } from "express";
import type { AppDatabase } from "../database/database.js";
import type { AppUser } from "../types.js";

export function createRequireAuth(database: AppDatabase, absoluteTimeoutMs: number) {
  return function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const sessionUser = req.session.user;
    const expired = Boolean(
      req.session.authenticatedAt &&
        req.session.authenticatedAt + absoluteTimeoutMs <= Date.now()
    );
    const user = sessionUser && !expired ? database.getUserById(sessionUser.id) : null;

    if (!user) {
      if (sessionUser) {
        req.session.destroy(() => undefined);
      }
      res.status(401).json({
        error: {
          code: expired ? "SESSION_EXPIRED" : "UNAUTHENTICATED",
          message: expired ? "Your session has expired." : "Please sign in first."
        }
      });
      return;
    }

    res.locals.user = publicUser(user);
    next();
  };
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (currentUser(res).role !== "admin") {
    res.status(403).json({
      error: {
        code: "ADMIN_REQUIRED",
        message: "Administrator permission is required."
      }
    });
    return;
  }
  next();
}

export function currentUser(res: Response): AppUser {
  return res.locals.user as AppUser;
}

function publicUser(user: AppUser): AppUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    s3Prefix: user.s3Prefix
  };
}
