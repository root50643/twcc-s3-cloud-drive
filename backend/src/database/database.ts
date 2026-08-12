import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { AppUser, UserRole } from "../types.js";

export interface UserRecord extends AppUser {
  passwordHash: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type LoginOutcome = "success" | "failure" | "rate_limited";

export class DatabaseDomainError extends Error {
  constructor(public readonly code: "USERNAME_EXISTS" | "LAST_ADMIN" | "USER_NOT_FOUND") {
    super(code);
  }
}

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  s3_prefix: string;
  note: string;
  created_at: string;
  updated_at: string;
}

interface CountRow {
  count: number;
}

export interface AuditPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface LoginAuditItem {
  id: number;
  username: string;
  success: boolean;
  outcome: LoginOutcome;
  ipAddress: string;
  createdAt: string;
}

export interface DownloadAuditItem {
  id: number;
  username: string;
  objectKey: string;
  createdAt: string;
}

export interface AdminAuditItem {
  id: number;
  actorUsername: string;
  action: string;
  targetUsername: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: string;
}

export class AppDatabase {
  private readonly db: DatabaseSyncType;

  constructor(filePath: string) {
    mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
    this.db = new DatabaseSync(path.resolve(filePath));
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const version = (this.db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version;
    if (version < 1) {
      this.transaction(() => {
        this.db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
          s3_prefix TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE sessions (
          sid TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX sessions_expires_idx ON sessions(expires_at);
        CREATE INDEX sessions_user_idx ON sessions(user_id);

        CREATE TABLE login_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          username TEXT NOT NULL,
          outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'rate_limited')),
          ip_address TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX login_events_created_idx ON login_events(id DESC);
        CREATE INDEX login_events_username_idx ON login_events(username, created_at DESC);
        CREATE INDEX login_events_ip_idx ON login_events(ip_address, created_at DESC);

        CREATE TABLE download_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          username TEXT NOT NULL,
          object_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX download_events_created_idx ON download_events(id DESC);
        CREATE INDEX download_events_username_idx ON download_events(username, id DESC);

        CREATE TABLE admin_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          actor_username TEXT NOT NULL,
          action TEXT NOT NULL,
          target_username TEXT,
          details_json TEXT,
          ip_address TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX admin_events_created_idx ON admin_events(id DESC);
        CREATE INDEX admin_events_actor_idx ON admin_events(actor_username, id DESC);
        `);
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(1, nowIso());
      });
    }

    if (version < 2) {
      this.transaction(() => {
        this.db.exec("ALTER TABLE users ADD COLUMN note TEXT NOT NULL DEFAULT ''");
        this.db.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(2, nowIso());
      });
    }
  }

  transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  countUsers(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM users").get() as unknown as CountRow).count;
  }

  countAdmins(): number {
    return (this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as unknown as CountRow).count;
  }

  getUserById(id: number): UserRecord | null {
    return mapUser(this.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined);
  }

  getUserByUsername(username: string): UserRecord | null {
    return mapUser(this.db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username) as UserRow | undefined);
  }

  listUsers(): UserRecord[] {
    return (this.db.prepare("SELECT * FROM users ORDER BY username COLLATE NOCASE").all() as unknown as UserRow[]).map((row) => mapUser(row)!);
  }

  createUser(input: { username: string; passwordHash: string; role: UserRole; s3Prefix: string; note?: string }): UserRecord {
    const timestamp = nowIso();
    try {
      const result = this.db.prepare(`
        INSERT INTO users(username, password_hash, role, s3_prefix, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.username, input.passwordHash, input.role, input.s3Prefix, input.note ?? "", timestamp, timestamp);
      return this.getUserById(Number(result.lastInsertRowid))!;
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) {
        throw new DatabaseDomainError("USERNAME_EXISTS");
      }
      throw error;
    }
  }

  updateUserAccess(id: number, role: UserRole, s3Prefix: string, note: string): { user: UserRecord; roleChanged: boolean } {
    return this.transaction(() => {
      const current = this.getUserById(id);
      if (!current) {
        throw new DatabaseDomainError("USER_NOT_FOUND");
      }
      if (current.role === "admin" && role !== "admin" && this.countAdmins() === 1) {
        throw new DatabaseDomainError("LAST_ADMIN");
      }
      this.db.prepare("UPDATE users SET role = ?, s3_prefix = ?, note = ?, updated_at = ? WHERE id = ?")
        .run(role, s3Prefix, note, nowIso(), id);
      return { user: this.getUserById(id)!, roleChanged: current.role !== role };
    });
  }

  updatePassword(id: number, passwordHash: string): UserRecord {
    const result = this.db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(passwordHash, nowIso(), id);
    if (result.changes === 0) {
      throw new DatabaseDomainError("USER_NOT_FOUND");
    }
    return this.getUserById(id)!;
  }

  deleteUser(id: number): UserRecord {
    return this.transaction(() => {
      const current = this.getUserById(id);
      if (!current) {
        throw new DatabaseDomainError("USER_NOT_FOUND");
      }
      if (current.role === "admin" && this.countAdmins() === 1) {
        throw new DatabaseDomainError("LAST_ADMIN");
      }
      this.db.prepare("DELETE FROM users WHERE id = ?").run(id);
      return current;
    });
  }

  getSession(sid: string): { data: string; expiresAt: number } | null {
    const row = this.db.prepare("SELECT data, expires_at AS expiresAt FROM sessions WHERE sid = ?").get(sid) as { data: string; expiresAt: number } | undefined;
    if (!row) return null;
    if (row.expiresAt <= Date.now()) {
      this.deleteSession(sid);
      return null;
    }
    return row;
  }

  setSession(sid: string, data: string, expiresAt: number, userId: number | null): void {
    this.db.prepare(`
      INSERT INTO sessions(sid, data, expires_at, user_id) VALUES (?, ?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at, user_id = excluded.user_id
    `).run(sid, data, expiresAt, userId);
  }

  deleteSession(sid: string): void {
    this.db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
  }

  deleteSessionsForUser(userId: number): void {
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  cleanupExpiredSessions(): number {
    return Number(this.db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now()).changes);
  }

  recordLogin(input: { userId: number | null; username: string; outcome: LoginOutcome; ipAddress: string }): void {
    this.db.prepare(`
      INSERT INTO login_events(user_id, username, outcome, ip_address, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(input.userId, input.username, input.outcome, input.ipAddress, nowIso());
  }

  recentLoginFailures(input: { username: string; ipAddress: string; since: string }): { username: number; ip: number } {
    const username = (this.db.prepare(`
      SELECT COUNT(*) AS count FROM login_events
      WHERE username = ? COLLATE NOCASE AND outcome = 'failure' AND created_at >= ?
    `).get(input.username, input.since) as unknown as CountRow).count;
    const ip = (this.db.prepare(`
      SELECT COUNT(*) AS count FROM login_events
      WHERE ip_address = ? AND outcome = 'failure' AND created_at >= ?
    `).get(input.ipAddress, input.since) as unknown as CountRow).count;
    return { username, ip };
  }

  recordDownloads(user: AppUser, objectKeys: string[]): void {
    this.transaction(() => {
      const statement = this.db.prepare(`
        INSERT INTO download_events(user_id, username, object_key, created_at) VALUES (?, ?, ?, ?)
      `);
      const timestamp = nowIso();
      for (const objectKey of objectKeys) {
        statement.run(user.id, user.username, objectKey, timestamp);
      }
    });
  }

  recordAdminEvent(input: {
    actor: AppUser;
    action: string;
    targetUsername?: string | null;
    details?: Record<string, unknown> | null;
    ipAddress: string;
  }): void {
    const actorUserId = this.getUserById(input.actor.id) ? input.actor.id : null;
    this.db.prepare(`
      INSERT INTO admin_events(actor_user_id, actor_username, action, target_username, details_json, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      actorUserId,
      input.actor.username,
      input.action,
      input.targetUsername ?? null,
      input.details ? JSON.stringify(input.details) : null,
      input.ipAddress,
      nowIso()
    );
  }

  listLoginEvents(input: { cursor?: number; limit: number; username?: string }): AuditPage<LoginAuditItem> {
    const rows = this.auditRows("login_events", input) as Array<{ id: number; username: string; outcome: LoginOutcome; ip_address: string; created_at: string }>;
    return pageRows(rows, input.limit, (row) => ({
      id: row.id,
      username: row.username,
      success: row.outcome === "success",
      outcome: row.outcome,
      ipAddress: row.ip_address,
      createdAt: row.created_at
    }));
  }

  listDownloadEvents(input: { cursor?: number; limit: number; username?: string }): AuditPage<DownloadAuditItem> {
    const rows = this.auditRows("download_events", input) as Array<{ id: number; username: string; object_key: string; created_at: string }>;
    return pageRows(rows, input.limit, (row) => ({ id: row.id, username: row.username, objectKey: row.object_key, createdAt: row.created_at }));
  }

  listAdminEvents(input: { cursor?: number; limit: number; username?: string }): AuditPage<AdminAuditItem> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (input.cursor) { clauses.push("id < ?"); params.push(input.cursor); }
    if (input.username) { clauses.push("actor_username = ? COLLATE NOCASE"); params.push(input.username); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(input.limit + 1);
    const rows = this.db.prepare(`SELECT * FROM admin_events ${where} ORDER BY id DESC LIMIT ?`).all(...params) as unknown as Array<{
      id: number; actor_username: string; action: string; target_username: string | null; details_json: string | null; ip_address: string; created_at: string;
    }>;
    return pageRows(rows, input.limit, (row) => ({
      id: row.id,
      actorUsername: row.actor_username,
      action: row.action,
      targetUsername: row.target_username,
      details: parseDetails(row.details_json),
      ipAddress: row.ip_address,
      createdAt: row.created_at
    }));
  }

  purgeAuditBefore(before: string): number {
    return this.transaction(() => {
      let removed = 0;
      for (const table of ["login_events", "download_events", "admin_events"]) {
        removed += Number(this.db.prepare(`DELETE FROM ${table} WHERE created_at < ?`).run(before).changes);
      }
      return removed;
    });
  }

  private auditRows(table: "login_events" | "download_events", input: { cursor?: number; limit: number; username?: string }): unknown[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (input.cursor) { clauses.push("id < ?"); params.push(input.cursor); }
    if (input.username) { clauses.push("username = ? COLLATE NOCASE"); params.push(input.username); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(input.limit + 1);
    return this.db.prepare(`SELECT * FROM ${table} ${where} ORDER BY id DESC LIMIT ?`).all(...params) as unknown[];
  }
}

function mapUser(row: UserRow | undefined): UserRecord | null {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    s3Prefix: row.s3_prefix,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function pageRows<T extends { id: number }, R>(rows: T[], limit: number, map: (row: T) => R): AuditPage<R> {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  return {
    items: selected.map(map),
    nextCursor: hasMore && selected.length ? String(selected[selected.length - 1].id) : null
  };
}

function parseDetails(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
