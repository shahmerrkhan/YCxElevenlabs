// npm run voice-test: voices one short line, so it can be heard without running the pipeline.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { makeVoiceover, VoiceFailedError } from "./tts.js";

const LINE = "Okay, midterms are next week and my notes are a mess. Kiln turns them into flashcards.";

const envFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

try {
  const { audioFile, timingsFile, words } = await makeVoiceover({
    id: "voice-test",
    text: LINE,
    log: (line) => console.log(`[voice] ${line}`),
  });
  const path = fileURLToPath(audioFile);
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  );

  console.log(`Audio:    ${path}`);
  console.log(`Size:     ${(await stat(audioFile)).size} bytes`);
  console.log(
    probe.status === 0
      ? `Duration: ${Number(probe.stdout).toFixed(2)} seconds`
      : "Duration: unknown, ffprobe did not run",
  );
  console.log(`Timings:  ${fileURLToPath(timingsFile)} (${words.length} words)`);
  for (const word of words.slice(0, 3)) console.log(`  ${JSON.stringify(word)}`);
} catch (err) {
  const message = err instanceof VoiceFailedError ? err.message : "unexpected error";
  console.error(`Voice test failed: ${message}`);
  process.exitCode = 1;
}
