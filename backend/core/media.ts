// Generated files live in output/media/<jobId>/ and are served at /media.
export const MEDIA_DIR = new URL("../../output/media/", import.meta.url);

/** Absolute, as the contract needs. Read on each call, because .env loads after the imports. */
export function mediaUrl(jobId: string, file: string): string {
  const base = process.env.PUBLIC_BASE_URL?.trim() || `http://localhost:${process.env.PORT || 3000}`;
  return `${base.replace(/\/+$/, "")}/media/${jobId}/${file}`;
}
