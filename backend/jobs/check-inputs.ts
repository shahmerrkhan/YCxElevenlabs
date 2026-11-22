// npm run inputs: reports what the script and video steps have to work with. Read only.
import { readdir, readFile } from "node:fs/promises";
import { listTranscripts } from "./transcripts.js";

const DATA_DIR = new URL("../../data/", import.meta.url);
const IMAGE_NAME = /\.(jpe?g|png|webp)$/i;

function ifMissing<T>(fallback: T) {
  return (err: NodeJS.ErrnoException): T => {
    if (err.code === "ENOENT") return fallback;
    throw err;
  };
}

const company = await readFile(new URL("company.md", DATA_DIR), "utf8").catch(ifMissing(""));
const hasCompany = company.trim() !== "";
const transcripts = await listTranscripts();

const entries = await readdir(new URL("photos/", DATA_DIR), { withFileTypes: true }).catch(
  ifMissing([]),
);
const photoFiles = entries.filter(({ name }) => name !== "README.md" && !name.startsWith("."));
const photos = photoFiles.filter((file) => !file.isDirectory() && IMAGE_NAME.test(file.name));
const wrongType = photoFiles.filter((file) => !photos.includes(file));

console.log(`Company file: ${hasCompany ? "found" : "missing"}`);
console.log(`Transcripts:  ${transcripts.length}`);
console.log(`Photos:       ${photos.length}`);

const warnings: string[] = [];
if (!hasCompany) warnings.push("data/company.md is missing or empty.");
if (!transcripts.length) {
  warnings.push("No non-empty .txt in data/transcripts/. POST /jobs will return 422.");
}
if (!photos.length) warnings.push("No images in data/photos/. The video step has nothing to show.");
for (const file of wrongType) {
  warnings.push(`Not a jpg, png or webp: data/photos/${file.name}`);
}

for (const warning of warnings) console.log(`WARNING: ${warning}`);
if (!warnings.length) console.log("All inputs are in place.");
