import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import bcrypt from "bcryptjs";

interface StoredUser {
  username: string;
  passwordHash: string;
}

interface UsersFile {
  users: StoredUser[];
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

async function readUsers(filePath: string): Promise<UsersFile> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as UsersFile;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { users: [] };
    }
    throw error;
  }
}

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = "";

    stdout.write(prompt);
    stdin.resume();
    stdin.setEncoding("utf8");

    const canUseRawMode = Boolean(stdin.isTTY && stdin.setRawMode);
    if (canUseRawMode) {
      stdin.setRawMode(true);
    }

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          stdout.write("\n");
          stdin.off("data", onData);
          if (canUseRawMode) {
            stdin.setRawMode(false);
          }
          stdin.pause();
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const username = getArg("username");
  if (!username) {
    throw new Error("Usage: npm run user:add -- --username alice");
  }

  const usersFile = path.resolve(getArg("file") ?? process.env.USERS_FILE ?? "../users.json");
  const password = await askHidden("Password: ");
  const confirmPassword = await askHidden("Confirm password: ");

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (password !== confirmPassword) {
    throw new Error("Passwords do not match.");
  }

  const usersFileData = await readUsers(usersFile);
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = usersFileData.users.find((user) => user.username === username);

  if (existing) {
    existing.passwordHash = passwordHash;
  } else {
    usersFileData.users.push({ username, passwordHash });
  }

  await fs.mkdir(path.dirname(usersFile), { recursive: true });
  await fs.writeFile(usersFile, `${JSON.stringify(usersFileData, null, 2)}\n`, "utf8");
  console.log(`Updated ${usersFile}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
