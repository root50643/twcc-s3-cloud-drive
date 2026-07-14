import { promises as fs } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { AppUser, StoredUser } from "../types.js";

interface UsersFile {
  users: StoredUser[];
}

export class UserStore {
  private readonly usersByName: Map<string, StoredUser>;

  private constructor(users: StoredUser[]) {
    this.usersByName = new Map(users.map((user) => [user.username, user]));
  }

  static async fromFile(filePath: string): Promise<UserStore> {
    const absolutePath = path.resolve(filePath);
    const raw = await fs.readFile(absolutePath, "utf8");
    const data = JSON.parse(raw) as UsersFile;
    const users = Array.isArray(data.users) ? data.users : [];

    for (const user of users) {
      if (!user.username || !user.passwordHash) {
        throw new Error("Invalid users file: each user needs username and passwordHash");
      }
    }

    if (users.length === 0) {
      throw new Error("Invalid users file: at least one user is required");
    }

    return new UserStore(users);
  }

  async verify(username: string, password: string): Promise<AppUser | null> {
    const user = this.usersByName.get(username);
    if (!user) {
      return null;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return null;
    }

    return { username: user.username };
  }
}
