import express, { Router, type RequestHandler } from "express";
import { ApiError } from "../core/errors.js";
import { startPipeline } from "./pipeline.js";
import type { JobStore } from "./store.js";
import { hasTranscripts } from "./transcripts.js";

interface Deps {
  jobs: JobStore;
  requireToolSecret: RequestHandler;
}

export function createJobsRouter({ jobs, requireToolSecret }: Deps) {
  const router = Router();

  router.post("/jobs", requireToolSecret, express.json({ type: () => true }), async (req, res) => {
    const prompt = req.body?.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new ApiError("invalid_request", "prompt must be a non-empty string");
    }
    if (!(await hasTranscripts())) {
      throw new ApiError("no_transcripts", "no transcripts loaded");
    }

    const job = jobs.create(prompt.trim());
    startPipeline(jobs, job);
    res.status(202).json({ id: job.id, status: job.status });
  });

  router.get("/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) throw new ApiError("not_found", "no such job");

    const { id, status, script, audioUrl, videoUrl, error } = job;
    res.json({ id, status, script, audioUrl, videoUrl, error });
  });

  return router;
}
