import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../auth/passwords.js";

describe("Argon2 password hashing", () => {
  it("uses the RFC 9106 memory-constrained Argon2id parameters", async () => {
    const hasher = new Argon2PasswordHasher();
    const password = "長密碼 with spaces and symbols !";
    const hash = await hasher.hash(password);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,p=4,t=3\$/);
    expect(await hasher.verify(hash, password)).toBe(true);
    expect(await hasher.verify(hash, `${password}x`)).toBe(false);
  });
});
