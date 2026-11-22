// The video: photos, voiceover and captions to a 9:16 mp4.
// Photos are prepared one at a time, then read as one stream, to keep memory low on Render.
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";
import { buildCaptions } from "./captions.js";

const FONT_NAME = "Poppins-ExtraBold.ttf";
const FONT_FILE = fileURLToPath(new URL(`./fonts/${FONT_NAME}`, import.meta.url));
const DEFAULT_SIZE = "720x1280"; // override with VIDEO_SIZE, like 540x960 on a weak server
const FPS = 24;
const SECONDS_PER_PHOTO = 2.5;
const ZOOM = 0.08; // how much closer each photo gets
const OVERSAMPLE = 1.5; // zooming a bigger photo jitters less
const TIMEOUT_MS = 300_000; // for the whole render, not each ffmpeg call
const PCM_RATE = 8000; // only used to measure the audio

/** The message is safe to show and to read out loud, so no final period. */
export class RenderFailedError extends Error {}

const timingsSchema = z.object({
  words: z
    .array(
      z
        .object({ word: z.string(), start: z.number().min(0), end: z.number().min(0) })
        .refine(({ start, end }) => end >= start),
    )
    .min(1),
});

export interface RenderOptions {
  photos: string[];
  audioPath: string;
  timingsPath: string;
  outPath: string;
}

function readSize(): { width: number; height: number } {
  const value = process.env.VIDEO_SIZE?.trim() || DEFAULT_SIZE;
  const [width, height] = (/^(\d+)x(\d+)$/.exec(value)?.slice(1) ?? []).map(Number);
  const valid = width * 16 === height * 9 && width % 2 === 0 && height % 2 === 0;
  if (!valid || width < 360 || width > 1080) {
    throw new RenderFailedError("VIDEO_SIZE must be 9:16, like 720x1280 or 540x960");
  }
  return { width, height };
}

async function requireFile(path: string, what: string) {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile() || !info.size) throw new RenderFailedError(`${what} is missing or empty`);
}

async function readTimings(path: string) {
  try {
    return timingsSchema.parse(JSON.parse(await readFile(path, "utf8"))).words;
  } catch {
    throw new RenderFailedError("the word timings file is not valid");
  }
}

/** Resolves with the number of bytes ffmpeg wrote to stdout. */
function runFfmpeg(options: {
  args: string[];
  cwd: string;
  deadline: number;
  failure: string;
}): Promise<number> {
  const { args, cwd, deadline, failure } = options;
  const binary = ffmpegPath as unknown as string | null;
  if (!binary) throw new RenderFailedError("ffmpeg is not available on this server");
  const msLeft = deadline - Date.now();
  if (msLeft <= 0) throw new RenderFailedError("the video took too long to render");

  return new Promise((done, fail) => {
    const child = spawn(binary, ["-nostdin", "-hide_banner", "-loglevel", "error", ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let bytes = 0;
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, msLeft);

    child.stdout.on("data", (chunk: Buffer) => (bytes += chunk.length));
    child.stderr.on("data", (chunk: Buffer) => (stderr = (stderr + chunk).slice(-2000)));
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      console.error(`[video] ffmpeg did not start code=${err.code ?? "unknown"}`);
      fail(new RenderFailedError("ffmpeg could not start, check that ffmpeg-static installed"));
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return done(bytes);
      console.error(`[video] ffmpeg stopped code=${code} signal=${signal} ${stderr.trim()}`);
      fail(new RenderFailedError(timedOut ? "the video took too long to render" : failure));
    });
  });
}

async function renderNow({ photos, audioPath, timingsPath, outPath }: RenderOptions) {
  if (!photos?.length) {
    throw new RenderFailedError("there are no photos to make a video from, add some to data/photos");
  }
  const { width, height } = readSize();
  const audio = resolve(audioPath);
  const videoPath = resolve(outPath);
  await requireFile(audio, "the voiceover");
  await requireFile(timingsPath, "the word timings file");
  const words = await readTimings(timingsPath);

  await mkdir(dirname(videoPath), { recursive: true });
  // Beside the output, so the last rename is instant. The dot keeps it out of /media.
  const work = await mkdtemp(join(dirname(videoPath), ".render-"));
  try {
    const deadline = Date.now() + TIMEOUT_MS;
    const ffmpeg = (failure: string, args: string[]) =>
      runFfmpeg({ args, cwd: work, deadline, failure });

    // Decoded, because mp3 headers can be wrong and there is no ffprobe on the server.
    const pcmBytes = await ffmpeg("the voiceover could not be read", [
      "-i", audio, "-map", "0:a:0", "-f", "s16le", "-ac", "1", "-ar", String(PCM_RATE), "pipe:1",
    ]);
    const durationSec = pcmBytes / (PCM_RATE * 2);
    if (!durationSec) throw new RenderFailedError("the voiceover has no sound in it");

    const shots = Math.max(1, Math.round(durationSec / SECONDS_PER_PHOTO));
    const framesPerShot = Math.ceil(Math.ceil(durationSec * FPS) / shots);
    const even = (value: number) => Math.ceil(value / 2) * 2;
    const [bigWidth, bigHeight] = [even(width * OVERSAMPLE), even(height * OVERSAMPLE)];
    const shotFile = (i: number) => `shot_${String(i).padStart(3, "0")}.jpg`;

    for (let i = 0; i < shots; i++) {
      if (i >= photos.length) {
        await copyFile(join(work, shotFile(i % photos.length)), join(work, shotFile(i)));
        continue;
      }
      const photo = resolve(photos[i]);
      await requireFile(photo, `the photo ${basename(photo)}`);
      await ffmpeg(`the photo ${basename(photo)} could not be read`, [
        "-threads", "1", "-i", photo,
        "-vf",
        `scale=${bigWidth}:${bigHeight}:force_original_aspect_ratio=increase:out_range=pc,` +
          `crop=${bigWidth}:${bigHeight},setsar=1,format=yuvj420p`,
        "-frames:v", "1", "-q:v", "3", "-threads", "1", "-update", "1", "-y", shotFile(i),
      ]);
    }

    await mkdir(join(work, "fonts"));
    await copyFile(FONT_FILE, join(work, "fonts", FONT_NAME));
    await writeFile(join(work, "captions.ass"), buildCaptions(words, durationSec));

    const filters = [
      "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709",
      "format=yuv420p",
      `zoompan=z='1+${ZOOM}*mod(on,${framesPerShot})/${framesPerShot}'` +
        `:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=${framesPerShot}:s=${width}x${height}:fps=${FPS}`,
      "setsar=1",
      "ass=captions.ass:fontsdir=fonts", // relative to cwd, so no path escaping
      "format=yuv420p",
    ].join(",");

    await ffmpeg("ffmpeg could not build the video", [
      "-filter_complex_threads", "1",
      "-threads", "1", "-framerate", "1", "-start_number", "0", "-i", "shot_%03d.jpg",
      "-i", audio,
      "-filter_complex", `[0:v]${filters}[v]`,
      "-map", "[v]", "-map", "1:a:0",
      // Render reports the host's cores, so the thread count is set by hand.
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-threads", "2",
      "-pix_fmt", "yuv420p", "-color_range", "tv",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
      "-t", durationSec.toFixed(3), "-movflags", "+faststart", "-y", "video.mp4",
    ]);

    await rename(join(work, "video.mp4"), videoPath);
    return { videoPath, durationSec };
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => undefined);
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** One render at a time. Only ever rejects with a RenderFailedError. */
export function renderVideo(
  options: RenderOptions,
): Promise<{ videoPath: string; durationSec: number }> {
  const result = queue
    .then(() => renderNow(options))
    .catch((err: unknown) => {
      if (err instanceof RenderFailedError) throw err;
      console.error("[video] unexpected error", err);
      throw new RenderFailedError("the video hit an unexpected error");
    });
  queue = result.catch(() => undefined);
  return result;
}
