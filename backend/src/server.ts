import dotenv from "dotenv";
import { Argon2PasswordHasher } from "./auth/passwords.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { AppDatabase } from "./database/database.js";
import { S3Storage } from "./storage/s3Storage.js";

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new AppDatabase(config.DATABASE_FILE);
  const storage = new S3Storage(config);
  const app = createApp({
    config,
    database,
    passwordHasher: new Argon2PasswordHasher(),
    storage
  });

  runCleanup(database, config.AUDIT_RETENTION_DAYS);
  const cleanupTimer = setInterval(
    () => runCleanup(database, config.AUDIT_RETENTION_DAYS),
    24 * 60 * 60 * 1000
  );
  cleanupTimer.unref();

  const server = app.listen(config.PORT, () => {
    console.log(`Backend listening on port ${config.PORT}`);
    if (database.countUsers() === 0) {
      console.warn("Database has no users. Run the db:init command before signing in.");
    }
  });

  const shutdown = () => {
    clearInterval(cleanupTimer);
    server.close(() => {
      database.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

function runCleanup(database: AppDatabase, retentionDays: number): void {
  const before = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const auditRows = database.purgeAuditBefore(before);
  const sessions = database.cleanupExpiredSessions();
  if (auditRows || sessions) {
    console.log("Expired data cleanup complete", { auditRows, sessions });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
