// npm run demo-cache:build: 3 real jobs, saved to data/demo-cache/1..3. Spends API credits.
// The old cache is only replaced if all 3 jobs succeed.
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { MEDIA_DIR } from "../../core/media.js";
import { startPipeline } from "../pipeline.js";
import { scriptPartsSchema, type ScriptParts } from "../script/checks.js";
import { createJobStore, type Job } from "../store.js";
import { CACHE_DIR, MEDIA_FILES, SCRIPT_FILE } from "./files.js";

const COUNT = 3;
const PROMPT = "make today's UGC";
const JOB_TIMEOUT_MS = 5 * 60_000;
const STAGING_DIR = new URL("../../../output/demo-cache-build/", import.meta.url);
const BACKUP_DIR = new URL("../../../data/fallback-scripts/", import.meta.url);

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.VIDEO_SIZE = "720x1280"; // this process only

/** The pipeline only logs when it used a backup script, so compare with the files. */
async function findBackup(parts: ScriptParts): Promise<string | undefined> {
  const names = await readdir(BACKUP_DIR).catch(() => []);
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const backup = scriptPartsSchema.safeParse(
      JSON.parse(await readFile(new URL(name, BACKUP_DIR), "utf8")),
    );
    if (backup.success && isDeepStrictEqual(backup.data, scriptPartsSchema.parse(parts))) return name;
  }
  return undefined;
}

async function runJob(): Promise<Job & { scriptParts: ScriptParts }> {
  const jobs = createJobStore();
  const { id } = jobs.create(PROMPT);
  startPipeline(jobs, jobs.get(id)!);

  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(500);
    const job = jobs.get(id)!;
    if (job.status === "failed") throw new Error(`${id} failed: ${job.error?.message}`);
    if (job.status === "awaiting_approval") return { ...job, scriptParts: job.scriptParts! };
  }
  throw new Error(`${id} timed out`);
}

await rm(STAGING_DIR, { recursive: true, force: true });
for (let n = 1; n <= COUNT; n++) {
  const { id, scriptParts } = await runJob();
  const dir = new URL(`${n}/`, STAGING_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(SCRIPT_FILE, dir), `${JSON.stringify(scriptParts, null, 2)}\n`);
  for (const file of MEDIA_FILES) {
    await copyFile(new URL(`${id}/${file}`, MEDIA_DIR), new URL(file, dir));
  }

  const backup = await findBackup(scriptParts);
  console.log(`[demo-cache] built item=${n} job=${id} script=${backup ?? "live"}`);
  if (backup) console.log(`WARNING: item ${n} used the backup script ${backup}, not live generation`);
}

await rm(CACHE_DIR, { recursive: true, force: true });
await cp(STAGING_DIR, CACHE_DIR, { recursive: true });
console.log(`[demo-cache] saved ${COUNT} items to data/demo-cache/`);
