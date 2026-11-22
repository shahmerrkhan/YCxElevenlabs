// npm run fallbacks: writes drafts to output/. Only ones a human approves move to data/fallback-scripts/.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { readTranscripts } from "../transcripts.js";
import { spokenText, withDisclosure } from "./checks.js";
import { generateScript } from "./generate.js";

const COUNT = 3;
const DRAFTS = new URL("../../../output/fallback-drafts/", import.meta.url);

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const transcripts = await readTranscripts();
if (!transcripts.length) {
  console.error("No transcripts in data/transcripts/. Backups are only made from real ones.");
  process.exit(1);
}

await mkdir(DRAFTS, { recursive: true });
let made = 0;
for (let n = 1; n <= COUNT; n++) {
  try {
    const parts = await generateScript({
      request: "make today's UGC",
      transcripts,
      log: (line) => console.log(`[backup ${n}] ${line}`),
    });
    const file = new URL(`backup-${n}.json`, DRAFTS);
    await writeFile(file, `${JSON.stringify(parts, null, 2)}\n`);
    made++;
    console.log(`\n${fileURLToPath(file)}\n${spokenText(parts)}\n${withDisclosure(parts.caption)}\n`);
  } catch (err) {
    console.error(`[backup ${n}] failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}
console.log(`${made} of ${COUNT} drafts written. Nothing is served until approved.`);
if (made < COUNT) process.exitCode = 1;
