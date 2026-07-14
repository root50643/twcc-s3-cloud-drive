import dotenv from "dotenv";
import { UserStore } from "./auth/userStore.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { S3Storage } from "./storage/s3Storage.js";
import { ScopedStorage } from "./storage/scopedStorage.js";

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();
  const userStore = await UserStore.fromFile(config.USERS_FILE);
  const storage = new ScopedStorage(new S3Storage(config), config.S3_ROOT_PREFIX);
  const app = createApp({ config, userStore, storage });

  app.listen(config.PORT, () => {
    console.log(`Backend listening on port ${config.PORT}`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
