import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { createJobsRouter } from "../jobs/routes.js";
import { createJobStore } from "../jobs/store.js";
import { createToolAuth } from "./auth.js";
import { handleError, notFound } from "./errors.js";
import { MEDIA_DIR } from "./media.js";
import { createStubPostingRouter } from "./stub-posting.js";

export function createApp(toolSecret: string) {
  const app = express();
  const deps = { jobs: createJobStore(), requireToolSecret: createToolAuth(toolSecret) };

  // The browser only reads. Not allowing x-tool-secret keeps the secret POSTs server to server.
  app.use(cors({ origin: "*", methods: ["GET"], allowedHeaders: ["content-type"] }));

  app.use("/media", express.static(fileURLToPath(MEDIA_DIR), { redirect: false }));
  app.use(createJobsRouter(deps));
  app.use(createStubPostingRouter(deps)); // A4: swap this line for the router from backend/posting/

  app.use(notFound);
  app.use(handleError);
  return app;
}
