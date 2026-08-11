import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const expected = req.session.csrfToken;
  const provided = req.get("X-CSRF-Token");
  if (!expected || !provided || !safeEqual(expected, provided)) {
    res.status(403).json({
      error: {
        code: "INVALID_CSRF_TOKEN",
        message: "The security token is invalid. Refresh the page and try again."
      }
    });
    return;
  }

  next();
}

export function rotateCsrfToken(req: Request): string {
  const token = randomBytes(32).toString("base64url");
  req.session.csrfToken = token;
  return token;
}

function safeEqual(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}
