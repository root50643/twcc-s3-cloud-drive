import session from "express-session";
import type { AppDatabase } from "../database/database.js";

export class SQLiteSessionStore extends session.Store {
  constructor(
    private readonly database: AppDatabase,
    private readonly idleTimeoutMs: number,
    private readonly absoluteTimeoutMs: number
  ) {
    super();
  }

  get(sid: string, callback: (error: unknown, session?: session.SessionData | null) => void): void {
    try {
      const stored = this.database.getSession(sid);
      callback(null, stored ? (JSON.parse(stored.data) as session.SessionData) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    try {
      const expiresAt = this.expiryFor(value);
      this.database.setSession(sid, JSON.stringify(value), expiresAt, value.user?.id ?? null);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (error?: unknown) => void): void {
    try {
      this.database.deleteSession(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, value: session.SessionData, callback?: (error?: unknown) => void): void {
    this.set(sid, value, callback);
  }

  private expiryFor(value: session.SessionData): number {
    const idleExpiry = Date.now() + this.idleTimeoutMs;
    const absoluteExpiry = value.authenticatedAt
      ? value.authenticatedAt + this.absoluteTimeoutMs
      : idleExpiry;
    return Math.min(idleExpiry, absoluteExpiry);
  }
}
