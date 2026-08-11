import process from "node:process";
import dotenv from "dotenv";
import { Argon2PasswordHasher } from "../src/auth/passwords.js";
import { loadConfig } from "../src/config/env.js";
import { AppDatabase } from "../src/database/database.js";
import { normalizeRootPrefix } from "../src/storage/scopedStorage.js";
import { S3Storage } from "../src/storage/s3Storage.js";

dotenv.config();

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";
    stdout.write(prompt);
    stdin.resume();
    stdin.setEncoding("utf8");
    const rawMode = Boolean(stdin.isTTY && stdin.setRawMode);
    if (rawMode) stdin.setRawMode(true);
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") process.exit(130);
        if (char === "\r" || char === "\n") {
          stdout.write("\n");
          stdin.off("data", onData);
          if (rawMode) stdin.setRawMode(false);
          stdin.pause();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  if (hasArg("password-stdin")) {
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) input += chunk;
    return input.replace(/\r?\n$/, "");
  }
  const password = await askHidden("Password: ");
  const confirmation = await askHidden("Confirm password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  return password;
}

async function main(): Promise<void> {
  const username = getArg("username")?.trim();
  if (!username) {
    throw new Error("Usage: npm run db:init -- --username admin [--s3-prefix uploads/]");
  }
  const config = loadConfig();
  const database = new AppDatabase(config.DATABASE_FILE);
  try {
    if (database.countUsers() > 0) {
      throw new Error("The database is already initialized. Manage accounts in the web interface.");
    }
    const s3Prefix = normalizeRootPrefix(getArg("s3-prefix") ?? "");
    const storage = new S3Storage(config);
    if (!(await storage.prefixExists(s3Prefix))) {
      throw new Error("The configured S3 path does not exist.");
    }
    const password = await readPassword();
    if (password.length === 0) throw new Error("Password cannot be empty.");
    const passwordHash = await new Argon2PasswordHasher().hash(password);
    database.createUser({ username, passwordHash, role: "admin", s3Prefix });
    console.log(`Initialized administrator ${username}.`);
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
