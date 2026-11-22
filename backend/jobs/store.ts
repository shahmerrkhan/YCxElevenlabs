import { randomUUID } from "node:crypto";
import getJobMock from "../../mocks/get-job.json" with { type: "json" };
import scheduleMock from "../../mocks/schedule.json" with { type: "json" };

export type JobStatus =
  | "queued"
  | "scripting"
  | "voicing"
  | "rendering"
  | "awaiting_approval"
  | "posting"
  | "posted"
  | "failed";

export interface Job {
  readonly id: string;
  readonly prompt: string;
  readonly status: JobStatus;
  readonly script: string | null;
  readonly caption: string | null; // for posting, not part of the GET /jobs/:id response
  readonly audioUrl: string | null;
  readonly videoUrl: string | null;
  readonly error: { code: string; message: string } | null;
}

type JobChanges = Partial<Omit<Job, "id" | "prompt">>;

export function createJobStore() {
  const seed: Job = {
    ...getJobMock,
    status: "awaiting_approval",
    prompt: "[sample] seeded test job",
    caption: scheduleMock[0].caption,
  };
  const jobs = new Map<string, Job>([[seed.id, seed]]);

  function get(id: string): Job | undefined {
    return jobs.get(id);
  }

  function create(prompt: string): Job {
    const job: Job = {
      // Random, so an ID from before a restart cannot point at a different job.
      id: `job_${randomUUID().slice(0, 8)}`,
      prompt,
      status: "queued",
      script: null,
      caption: null,
      audioUrl: null,
      videoUrl: null,
      error: null,
    };
    jobs.set(job.id, job);
    return job;
  }

  function update(id: string, changes: JobChanges): Job | undefined {
    const job = jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...changes };
    jobs.set(id, updated);
    return updated;
  }

  /** Changes status only if it is still `from`. Synchronous, so two approves cannot both win. */
  function transition(id: string, from: JobStatus, to: JobStatus): Job | undefined {
    return jobs.get(id)?.status === from ? update(id, { status: to }) : undefined;
  }

  return { get, create, update, transition };
}

export type JobStore = ReturnType<typeof createJobStore>;
