// Last resort when every model fails: scripts made by `npm run fallbacks` and approved by a human.
import { readdir, readFile } from "node:fs/promises";
import { checkScript, scriptPartsSchema, type ScriptParts } from "./checks.js";

const DIR = new URL("../../../data/fallback-scripts/", import.meta.url);

export async function pickBackupScript(
  transcripts: string[],
  log: (line: string) => void,
): Promise<{ file: string; parts: ScriptParts } | undefined> {
  const names = await readdir(DIR).catch(() => []);
  const usable: { file: string; parts: ScriptParts }[] = [];

  for (const file of names.filter((name) => name.endsWith(".json"))) {
    try {
      const text = await readFile(new URL(encodeURIComponent(file), DIR), "utf8");
      const parts = scriptPartsSchema.parse(JSON.parse(text));
      const problems = checkScript(parts, transcripts);
      if (problems.length) log(`backup ${file} rejected ${JSON.stringify(problems)}`);
      else usable.push({ file, parts });
    } catch {
      log(`backup ${file} is unreadable or the wrong shape`);
    }
  }

  return usable[Math.floor(Math.random() * usable.length)];
}
