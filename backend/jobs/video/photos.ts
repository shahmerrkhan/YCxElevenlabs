// Photos for one job: up to 12 from data/photos/, as smaller cached copies. Originals are only read.
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { RenderFailedError } from "./render.js";

const PHOTOS_DIR = fileURLToPath(new URL("../../../data/photos/", import.meta.url));
const CACHE_DIR = fileURLToPath(new URL("../../../output/photo-cache/", import.meta.url));
const IMAGE_NAME = /^[^.].*\.(jpe?g|png|webp)$/i;
const MAX_PHOTOS = 12; // a 30 second video, one every 2.5 seconds
const SHORT_SIDE = 1080; // landscape keeps its height for the 9:16 crop
const TIMEOUT_MS = 60_000; // for each photo

const run = promisify(execFile);

async function cachedCopy(name: string): Promise<string> {
  const original = PHOTOS_DIR + name;
  const { size, mtimeMs } = await stat(original);
  const key = createHash("sha1").update(`${name}:${size}:${mtimeMs}`).digest("hex");
  const copy = `${CACHE_DIR}${key}.jpg`;
  if (await stat(copy).catch(() => undefined)) return copy;

  const binary = ffmpegPath as unknown as string | null;
  if (!binary) throw new RenderFailedError("ffmpeg is not available on this server");
  const partial = `${CACHE_DIR}${randomUUID()}.part.jpg`;
  const short = `min(${SHORT_SIDE},min(iw,ih))`;
  const scale = `scale=w='if(gt(iw,ih),-2,${short})':h='if(gt(iw,ih),${short},-2)':out_range=pc`;
  try {
    await run(
      binary,
      [
        "-nostdin", "-v", "error",
        "-xerror", "-err_detect", "explode", // both, or a half-downloaded photo passes as a grey one
        "-threads", "1", "-i", original,
        "-vf", `${scale},format=yuvj420p`,
        "-frames:v", "1", "-q:v", "3", "-threads", "1", "-update", "1", "-y", partial,
      ],
      { timeout: TIMEOUT_MS, killSignal: "SIGKILL" },
    );
    await rename(partial, copy);
    return copy;
  } catch (err) {
    await rm(partial, { force: true }).catch(() => undefined);
    if ((err as NodeJS.ErrnoException).syscall?.startsWith("spawn")) {
      throw new RenderFailedError("ffmpeg could not start, check that ffmpeg-static installed");
    }
    throw err;
  }
}

/** An empty folder gives an empty list, which renderVideo turns into the "no photos" error. */
export async function preparePhotos(log: (line: string) => void): Promise<string[]> {
  const names = (
    await readdir(PHOTOS_DIR).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return [];
      throw new RenderFailedError("the photos folder could not be read");
    })
  ).filter((name) => IMAGE_NAME.test(name));
  if (!names.length) return [];

  // Shuffled, so each video looks different.
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }

  await mkdir(CACHE_DIR, { recursive: true });
  const ready: string[] = [];
  for (const name of names) {
    if (ready.length === MAX_PHOTOS) break;
    try {
      ready.push(await cachedCopy(name));
    } catch (err) {
      if (err instanceof RenderFailedError) throw err;
      log(`skipped unreadable photo ${name}`);
    }
  }
  if (!ready.length) throw new RenderFailedError("none of the photos in data/photos could be read");
  return ready;
}
