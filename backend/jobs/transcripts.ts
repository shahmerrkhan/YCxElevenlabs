import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";

const TRANSCRIPTS_DIR = new URL("../../data/transcripts/", import.meta.url);

/** File names of the usable transcripts: non-empty .txt files. */
export async function listTranscripts(): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(TRANSCRIPTS_DIR, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const found: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() || !entry.name.toLowerCase().endsWith(".txt")) continue;
    const text = await readFile(new URL(encodeURIComponent(entry.name), TRANSCRIPTS_DIR), "utf8");
    if (text.trim()) found.push(entry.name);
  }
  return found;
}

export async function hasTranscripts(): Promise<boolean> {
  return (await listTranscripts()).length > 0;
}
