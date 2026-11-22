// STUB until A4/A5 replace it with the router from backend/posting/.
// These accounts are never posted to, so each is "simulated" and each entry "scheduled",
// even where the mocks show "real" and "posted". The one real account is kiln.study: it is
// added to /accounts and /schedule only after a Reel was really published.
import express, { Router, type RequestHandler } from "express";
import accountsMock from "../../mocks/accounts.json" with { type: "json" };
import bestTimesMock from "../../mocks/best-times.json" with { type: "json" };
import scheduleMock from "../../mocks/schedule.json" with { type: "json" };
import type { Job, JobStore } from "../jobs/store.js";
import { postReel } from "../posting/instagram.js";
import { ApiError } from "./errors.js";

const POSTING_MS = 3000;
const HOUR_MS = 60 * 60 * 1000;

const KILN = { id: "acct_kiln_study", platform: "instagram", handle: "@kiln.study", kind: "real" };
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
  const schedule: ((typeof scheduleMock)[number] & { permalink?: string })[] = [];
  let hasPosted = false;
  const nextId = () => `post_${String(schedule.length + 1).padStart(3, "0")}`;

  async function postToInstagram({ id, videoUrl, caption }: Job) {
    try {
      const permalink = await postReel({ videoUrl: videoUrl ?? "", caption: caption ?? "" });
      hasPosted = true;
      schedule.push({
        id: nextId(),
        jobId: id,
        accountId: KILN.id,
        platform: KILN.platform,
        caption: caption ?? "",
        postAt: new Date().toISOString(),
        status: "posted",
        kind: KILN.kind,
        permalink,
      });
      console.log(`[instagram] job=${id} posted ${permalink}`);
    } catch (err) {
      console.error(`[instagram] job=${id} not confirmed, simulated schedule stays:`, err);
    }
  }

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
        id: nextId(),
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
    // In the background. A chosen subset of simulated accounts, or the seeded sample job, never posts.
    if (selected.length === accounts.length && id !== "job_001") void postToInstagram(job);
  });

  router.get("/accounts", (_req, res) => {
    res.json(hasPosted ? [...accounts, KILN] : accounts);
  });

  router.get("/schedule", (_req, res) => {
    res.json(schedule);
  });

  router.get("/best-times", (_req, res) => {
    res.json(bestTimesMock);
  });

  return router;
}
