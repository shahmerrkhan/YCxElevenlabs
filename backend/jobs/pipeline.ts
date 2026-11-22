// One job, start to finish: script, voiceover, video, then wait for approval.
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { MEDIA_DIR, mediaUrl } from "../core/media.js";
import type { Job, JobStore } from "./store.js";
import { spokenText, withDisclosure, type ScriptParts } from "./script/checks.js";
import { generateScript } from "./script/generate.js";
import { AllModelsFailedError, NotConfiguredError } from "./script/llm.js";
import { pickBackupScript } from "./script/safety-net.js";
import { readTranscripts } from "./transcripts.js";
import { preparePhotos } from "./video/photos.js";
import { RenderFailedError, renderVideo } from "./video/render.js";
import { AUDIO_FILE, makeVoiceover, VoiceFailedError } from "./voice/tts.js";

const QUEUED_MS = 500; // long enough to be seen by a poll right after POST
const VIDEO_FILE = "video.mp4";

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

  let text: string;
  try {
    const parts = await writeScript(job, log);
    text = spokenText(parts);
    jobs.update(id, {
      status: "voicing",
      script: text,
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

  const voiceLog: Log = (line) => console.log(`[voice] job=${id} ${line}`);
  let voiceover: Awaited<ReturnType<typeof makeVoiceover>>;
  try {
    voiceover = await makeVoiceover({ id, text, log: voiceLog });
    jobs.update(id, { status: "rendering", audioUrl: mediaUrl(id, AUDIO_FILE) });
  } catch (err) {
    const known = err instanceof VoiceFailedError;
    const message = known ? err.message : "the voiceover hit an unexpected error";
    voiceLog(`FAILED ${message}${known ? "" : ` (${err instanceof Error ? err.name : "unknown"})`}`);
    jobs.update(id, { status: "failed", error: { code: "voice_failed", message } });
    return;
  }

  const videoLog: Log = (line) => console.log(`[video] job=${id} ${line}`);
  try {
    const started = Date.now();
    const photos = await preparePhotos(videoLog);
    await renderVideo({
      photos,
      audioPath: fileURLToPath(voiceover.audioFile),
      timingsPath: fileURLToPath(voiceover.timingsFile),
      outPath: fileURLToPath(new URL(`${id}/${VIDEO_FILE}`, MEDIA_DIR)),
    });
    videoLog(`rendered photos=${photos.length} ms=${Date.now() - started}`);
    jobs.update(id, { status: "awaiting_approval", videoUrl: mediaUrl(id, VIDEO_FILE) });
  } catch (err) {
    const known = err instanceof RenderFailedError;
    const message = known ? err.message : "the video hit an unexpected error";
    videoLog(`FAILED ${message}${known ? "" : ` (${err instanceof Error ? err.name : "unknown"})`}`);
    jobs.update(id, { status: "failed", error: { code: "render_failed", message } });
  }
}

export function startPipeline(jobs: JobStore, job: Job) {
  runPipeline(jobs, job).catch((err: unknown) => {
    console.error(`[pipeline] job=${job.id} stopped: ${err instanceof Error ? err.name : "unknown"}`);
  });
}
