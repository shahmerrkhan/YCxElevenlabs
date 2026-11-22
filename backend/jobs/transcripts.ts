import { readdir, readFile } from "node:fs/promises";
import type { Dirent } from "node:fs";

const TRANSCRIPTS_DIR = new URL("../../data/transcripts/", import.meta.url);
// The "source:" and "views:" lines at the top of a file are for humans, not the model.
const HEADER = /^(?:(?:source|views):[^\n]*(?:\n|$))+/;

/** The usable transcripts: non-empty .txt files. */
async function loadTranscripts(): Promise<{ name: string; text: string }[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(TRANSCRIPTS_DIR, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const found: { name: string; text: string }[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() || !entry.name.toLowerCase().endsWith(".txt")) continue;
    const raw = await readFile(new URL(encodeURIComponent(entry.name), TRANSCRIPTS_DIR), "utf8");
    const text = raw.replace(HEADER, "");
    if (text.trim()) found.push({ name: entry.name, text });
  }
  return found;
}

export async function listTranscripts(): Promise<string[]> {
  return (await loadTranscripts()).map(({ name }) => name);
}

/** Texts only: file names hold creator names, which the model never sees. */
export async function readTranscripts(): Promise<string[]> {
  return (await loadTranscripts()).map(({ text }) => text);
}

export async function hasTranscripts(): Promise<boolean> {
  return (await listTranscripts()).length > 0;
}
