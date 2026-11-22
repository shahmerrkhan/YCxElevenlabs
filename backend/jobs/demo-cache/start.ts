// DEMO_MODE=cache: replay an item made earlier by `npm run demo-cache:build`, from real runs.
// The prompt is ignored in this mode. Anything missing or broken runs the normal pipeline.
import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { MEDIA_DIR, mediaUrl } from "../../core/media.js";
import { startPipeline } from "../pipeline.js";
import { scriptPartsSchema, spokenText, withDisclosure, type ScriptParts } from "../script/checks.js";
import type { Job, JobStore } from "../store.js";
import { AUDIO_FILE } from "../voice/tts.js";
import { CACHE_DIR, MEDIA_FILES, SCRIPT_FILE, VIDEO_FILE } from "./files.js";

// 6.5 seconds in all. Each step outlasts the frontend's 2 second poll plus its round trip.
const QUEUED_MS = 200;
const STEP_MS = 2100;

interface CachedItem {
  name: string;
  dir: URL;
  parts: ScriptParts;
}

let turn = 0;

async function loadItems(): Promise<CachedItem[]> {
  const names = await readdir(CACHE_DIR).catch(() => []);
  const items: CachedItem[] = [];

  for (const name of names.filter((n) => /^\d+$/.test(n)).sort((a, b) => Number(a) - Number(b))) {
    const dir = new URL(`${name}/`, CACHE_DIR);
    try {
      const parts = scriptPartsSchema.parse(JSON.parse(await readFile(new URL(SCRIPT_FILE, dir), "utf8")));
      for (const file of MEDIA_FILES) {
        if (!(await stat(new URL(file, dir))).size) throw new Error(`${file} is empty`);
      }
      items.push({ name, dir, parts });
    } catch {
      console.log(`[demo-cache] item=${name} skipped, incomplete or unreadable`);
    }
  }
  return items;
}

/** Copies the next item to where /media serves it. Undefined means use the normal pipeline. */
async function prepareItem(id: string): Promise<CachedItem | undefined> {
  const items = await loadItems();
  if (!items.length) {
    console.log(`[demo-cache] job=${id} cache is empty, running the normal pipeline`);
    return undefined;
  }

  const item = items[turn++ % items.length];
  const out = new URL(`${id}/`, MEDIA_DIR);
  await mkdir(out, { recursive: true });
  await Promise.all(MEDIA_FILES.map((file) => copyFile(new URL(file, item.dir), new URL(file, out))));
  return item;
}

async function replay(jobs: JobStore, { id }: Job, { name, parts }: CachedItem) {
  console.log(`DEMO_CACHE job=${id} item=${name} pre-rendered from a real run, not live generation`);

  await sleep(QUEUED_MS);
  jobs.update(id, { status: "scripting" });
  await sleep(STEP_MS);
  jobs.update(id, {
    status: "voicing",
    script: spokenText(parts),
    scriptParts: parts,
    caption: withDisclosure(parts.caption),
  });
  await sleep(STEP_MS);
  jobs.update(id, { status: "rendering", audioUrl: mediaUrl(id, AUDIO_FILE) });
  await sleep(STEP_MS);
  jobs.update(id, { status: "awaiting_approval", videoUrl: mediaUrl(id, VIDEO_FILE) });
}

export function startJob(jobs: JobStore, job: Job) {
  // Read on each call, because .env loads after the imports.
  if (process.env.DEMO_MODE?.trim() !== "cache") return startPipeline(jobs, job);

  prepareItem(job.id)
    .then((item) => (item ? replay(jobs, job, item) : startPipeline(jobs, job)))
    .catch((err: unknown) => {
      console.error(`[demo-cache] job=${job.id} failed, running the normal pipeline: ${err}`);
      startPipeline(jobs, job);
    });
}
