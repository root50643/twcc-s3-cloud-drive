import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { UserStore } from "../auth/userStore.js";
import { createApp } from "../app.js";
import type { ObjectListResult, StorageClient } from "../types.js";

class MockStorage implements StorageClient {
  listError: Error | null = null;
  downloadError: Error | null = null;

  async listObjects(): Promise<ObjectListResult> {
    if (this.listError) {
      throw this.listError;
    }
    return {
      prefix: "",
      folders: [{ name: "reports", prefix: "reports/" }],
      files: [
        {
          key: "readme.txt",
          name: "readme.txt",
          size: 42,
          lastModified: "2026-07-14T00:00:00.000Z"
        }
      ],
      nextContinuationToken: null
    };
  }

  async createDownloadUrl(): Promise<string> {
    if (this.downloadError) {
      throw this.downloadError;
    }
    return "https://storage.example.test/bucket/readme.txt?signature=short";
  }
}

async function createTestUserStore(): Promise<UserStore> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "twcc-s3-users-"));
  const usersFile = path.join(tempDir, "users.json");
  const passwordHash = await bcrypt.hash("password-one", 4);
  const secondPasswordHash = await bcrypt.hash("password-two", 4);
  await fs.writeFile(
    usersFile,
    JSON.stringify({
      users: [
        { username: "alice", passwordHash },
        { username: "bob", passwordHash: secondPasswordHash }
      ]
    }),
    "utf8"
  );
  return UserStore.fromFile(usersFile);
}

describe("backend API", () => {
  let storage: MockStorage;

  async function testApp() {
    storage = new MockStorage();
    const userStore = await createTestUserStore();
    return createApp({
      config: {
        NODE_ENV: "test",
        SESSION_SECRET: "test-session-secret-at-least-24-chars",
        SIGNED_URL_EXPIRES_SECONDS: 300
      },
      userStore,
      storage
    });
  }

  beforeEach(() => {
    storage = new MockStorage();
  });

  it("rejects object listing before login", async () => {
    const app = await testApp();
    const response = await request(app).get("/api/v1/objects");
    expect(response.status).toBe(401);
  });

  it("allows multiple configured users to log in", async () => {
    const app = await testApp();
    const alice = request.agent(app);
    const bob = request.agent(app);

    expect(
      (await alice.post("/api/v1/auth/login").send({ username: "alice", password: "password-one" }))
        .status
    ).toBe(200);
    expect(
      (await bob.post("/api/v1/auth/login").send({ username: "bob", password: "password-two" }))
        .status
    ).toBe(200);
  });

  it("rejects invalid passwords", async () => {
    const app = await testApp();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ username: "alice", password: "wrong-password" });
    expect(response.status).toBe(401);
  });

  it("lists objects for an authenticated session", async () => {
    const app = await testApp();
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ username: "alice", password: "password-one" });

    const response = await agent.get("/api/v1/objects");
    expect(response.status).toBe(200);
    expect(response.body.folders[0]).toEqual({ name: "reports", prefix: "reports/" });
    expect(response.body.files[0].key).toBe("readme.txt");
  });

  it("creates a short-lived download URL for an authenticated session", async () => {
    const app = await testApp();
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ username: "alice", password: "password-one" });

    const response = await agent.post("/api/v1/download-urls").send({ key: "readme.txt" });
    expect(response.status).toBe(200);
    expect(response.body.url).toContain("signature=short");
    expect(response.body.expiresInSeconds).toBe(300);
  });

  it("does not leak secret-like text from storage errors", async () => {
    const app = await testApp();
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ username: "alice", password: "password-one" });
    storage.listError = new Error("S3_LIST_FAILED with AKIASECRET and SECRET_ACCESS_KEY");

    const response = await agent.get("/api/v1/objects");
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("AKIASECRET");
    expect(JSON.stringify(response.body)).not.toContain("SECRET_ACCESS_KEY");
  });
});
