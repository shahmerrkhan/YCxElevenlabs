// STUB until A4/A5 replace it with the router from backend/posting/.
// Nothing is posted, so every account is "simulated" and every entry "scheduled",
// even where the mocks show "real" and "posted".
import express, { Router, type RequestHandler } from "express";
import accountsMock from "../../mocks/accounts.json" with { type: "json" };
import bestTimesMock from "../../mocks/best-times.json" with { type: "json" };
import scheduleMock from "../../mocks/schedule.json" with { type: "json" };
import type { JobStore } from "../jobs/store.js";
import { ApiError } from "./errors.js";

const POSTING_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;

const accounts = accountsMock.map((account) => ({ ...account, kind: "simulated" }));

interface Deps {
  jobs: JobStore;
  requireToolSecret: RequestHandler;
}

function selectAccounts(body: unknown) {
  if (body === undefined) return accounts;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError("invalid_request", "body must be a JSON object");
  }
  if (!("accountIds" in body)) return accounts;

  const ids = body.accountIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ApiError("invalid_request", "accountIds must be a non-empty list");
  }
  if (!ids.every((id) => accounts.some((account) => account.id === id))) {
    throw new ApiError("invalid_request", "unknown account ID");
  }
  return accounts.filter((account) => ids.includes(account.id));
}

export function createStubPostingRouter({ jobs, requireToolSecret }: Deps) {
  const router = Router();
  const schedule: typeof scheduleMock = [];

  // Every content type is parsed as JSON. Otherwise an unparsed accountIds would mean "all accounts".
  const readJson = express.json({ type: () => true });

  router.post("/jobs/:id/approve", requireToolSecret, readJson, (req, res) => {
    const id = String(req.params.id);
    if (!jobs.get(id)) throw new ApiError("not_found", "no such job");

    const selected = selectAccounts(req.body);
    const job = jobs.transition(id, "awaiting_approval", "posting");
    if (!job) throw new ApiError("invalid_status", "job is not awaiting approval");

    selected.forEach((account, i) => {
      schedule.push({
        id: `post_${String(schedule.length + 1).padStart(3, "0")}`,
        jobId: id,
        accountId: account.id,
        platform: account.platform,
        caption: job.caption ?? "",
        postAt: new Date(Date.now() + (i + 1) * HOUR_MS).toISOString(),
        status: "scheduled",
        kind: account.kind,
      });
    });
    setTimeout(() => jobs.transition(id, "posting", "posted"), POSTING_MS);

    res.status(202).json({ id, status: job.status });
  });

  router.get("/accounts", (_req, res) => {
    res.json(accounts);
  });

  router.get("/schedule", (_req, res) => {
    res.json(schedule);
  });

  router.get("/best-times", (_req, res) => {
    res.json(bestTimesMock);
  });

  return router;
}
