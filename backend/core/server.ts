import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const secret = process.env.DEMO_TOOL_SECRET?.trim();
if (!secret) {
  console.error("DEMO_TOOL_SECRET is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
createApp(secret).listen(port, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Backend listening on http://localhost:${port}`);
});
