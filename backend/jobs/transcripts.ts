import { readdir, readFile } from "node:fs/promises";

const TRANSCRIPTS_DIR = new URL("../../data/transcripts/", import.meta.url);

export async function hasTranscripts(): Promise<boolean> {
  let names: string[];
  try {
    names = await readdir(TRANSCRIPTS_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }

  for (const name of names) {
    if (!name.toLowerCase().endsWith(".txt")) continue;
    const text = await readFile(new URL(encodeURIComponent(name), TRANSCRIPTS_DIR), "utf8");
    if (text.trim()) return true;
  }
  return false;
}
