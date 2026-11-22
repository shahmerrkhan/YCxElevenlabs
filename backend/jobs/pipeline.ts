// Scripting is real. Voicing and rendering are STUBS until S4 and S5.
import { setTimeout as sleep } from "node:timers/promises";
import getJobMock from "../../mocks/get-job.json" with { type: "json" };
import type { Job, JobStore } from "./store.js";
import { spokenText, withDisclosure, type ScriptParts } from "./script/checks.js";
import { generateScript } from "./script/generate.js";
import { AllModelsFailedError, NotConfiguredError } from "./script/llm.js";
import { pickBackupScript } from "./script/safety-net.js";
import { readTranscripts } from "./transcripts.js";

const QUEUED_MS = 500; // long enough to be seen by a poll right after POST
const STUB_STEP_MS = 3000;

type Log = (line: string) => void;

class ScriptFailedError extends Error {}

async function writeScript(job: Job, log: Log): Promise<ScriptParts> {
  const transcripts = await readTranscripts();
  if (!transcripts.length) throw new ScriptFailedError("no transcripts loaded");

  try {
    return await generateScript({ request: job.prompt, transcripts, log });
  } catch (err) {
    if (!(err instanceof AllModelsFailedError)) throw err;

    const backup = await pickBackupScript(transcripts, log);
    if (!backup) throw err;
    log(`SAFETY_NET job=${job.id} file=${backup.file} not live generation, cause="${err.message}"`);
    return backup.parts;
  }
}

async function runPipeline(jobs: JobStore, job: Job) {
  const { id } = job;
  const log: Log = (line) => console.log(`[script] job=${id} ${line}`);

  await sleep(QUEUED_MS);
  jobs.update(id, { status: "scripting" });

  try {
    const parts = await writeScript(job, log);
    jobs.update(id, {
      status: "voicing",
      script: spokenText(parts),
      scriptParts: parts,
      caption: withDisclosure(parts.caption),
    });
  } catch (err) {
    // Only our own errors are shown. The agent reads the message out, so no final period.
    const known =
      err instanceof ScriptFailedError ||
      err instanceof NotConfiguredError ||
      err instanceof AllModelsFailedError;
    const message = known ? err.message : "script generation hit an unexpected error";
    log(`FAILED ${message}${known ? "" : ` (${err instanceof Error ? err.name : "unknown"})`}`);
    jobs.update(id, { status: "failed", error: { code: "script_failed", message } });
    return;
  }

  await sleep(STUB_STEP_MS);
  jobs.update(id, { status: "rendering", audioUrl: getJobMock.audioUrl.replace(getJobMock.id, id) });
  await sleep(STUB_STEP_MS);
  jobs.update(id, {
    status: "awaiting_approval",
    videoUrl: getJobMock.videoUrl.replace(getJobMock.id, id),
  });
}

export function startPipeline(jobs: JobStore, job: Job) {
  runPipeline(jobs, job).catch((err: unknown) => {
    console.error(`[pipeline] job=${job.id} stopped: ${err instanceof Error ? err.name : "unknown"}`);
  });
}
