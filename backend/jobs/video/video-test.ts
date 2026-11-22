// npm run video-test: placeholder photos, a tone and fake timings to a video in output/video-test/.
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { RenderFailedError, renderVideo } from "./render.js";

const DIR = fileURLToPath(new URL("../../../output/video-test/", import.meta.url));
const AUDIO_SEC = 15;
const TEXT =
  "I almost didn't post this. I had three lectures of biology notes and an exam on Friday. " +
  "So I dropped them into Kiln and it made flashcards before my coffee got cold. " +
  "Then it quizzed me on the stuff I kept skipping. Go try it tonight.";

// Different shapes and formats. The white one is the hardest background for white text.
const PLACEHOLDERS = [
  { name: "1.jpg", source: "testsrc2=size=1600x1200" },
  { name: "2.png", source: "color=c=white:size=900x900,drawgrid=w=90:h=90:color=silver" },
  { name: "3.webp", source: "color=c=0x2a6f97:size=1080x1920,drawgrid=w=120:h=120:color=white" },
  { name: "4.jpg", source: "smptebars=size=1280x720" },
  { name: "5.png", source: "color=c=0x202020:size=800x1400,drawgrid=w=100:h=100:color=orange" },
];

const run = promisify(execFile);
const binary = ffmpegPath as unknown as string;
const ffmpeg = (...args: string[]) => run(binary, ["-hide_banner", "-loglevel", "error", ...args]);

await mkdir(DIR, { recursive: true });

const photos: string[] = [];
for (const { name, source } of PLACEHOLDERS) {
  await ffmpeg("-f", "lavfi", "-i", source, "-frames:v", "1", "-update", "1", "-y", DIR + name);
  photos.push(DIR + name);
}

const audioPath = `${DIR}voice.mp3`;
await ffmpeg(
  "-f", "lavfi", "-i", `sine=frequency=330:duration=${AUDIO_SEC}`,
  "-c:a", "libmp3lame", "-y", audioPath,
);

const spoken = TEXT.split(" ");
const step = (AUDIO_SEC - 0.4) / spoken.length;
const words = spoken.map((word, i) => ({
  word,
  start: 0.2 + i * step,
  end: 0.2 + (i + 0.85) * step,
}));
const timingsPath = `${DIR}timings.json`;
await writeFile(timingsPath, JSON.stringify({ words }, null, 2));

try {
  await renderVideo({ photos: [], audioPath, timingsPath, outPath: `${DIR}none.mp4` });
  console.log("Zero photos: FAILED, it should have been rejected");
  process.exitCode = 1;
} catch (err) {
  const clean = err instanceof RenderFailedError;
  console.log(`Zero photos: ${clean ? "clean error" : "FAILED"}: ${(err as Error).message}`);
  if (!clean) process.exitCode = 1;
}

try {
  const started = Date.now();
  const outPath = `${DIR}video.mp4`;
  const { videoPath, durationSec } = await renderVideo({ photos, audioPath, timingsPath, outPath });
  console.log(`Video:       ${videoPath}`);
  console.log(`Duration:    ${durationSec.toFixed(3)}s`);
  console.log(`Render time: ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (err) {
  console.log(`Render FAILED: ${(err as Error).message}`);
  process.exitCode = 1;
}
