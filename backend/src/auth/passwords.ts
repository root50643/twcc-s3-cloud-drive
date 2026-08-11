import * as argon2 from "argon2";

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
  saltLength: 16
} as const;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    if (password.length === 0) {
      throw new Error("EMPTY_PASSWORD");
    }
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    if (password.length === 0) {
      return false;
    }
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
