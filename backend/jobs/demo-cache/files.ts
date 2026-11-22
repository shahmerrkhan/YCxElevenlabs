// One cached item is data/demo-cache/<n>/ with these four files.
import { AUDIO_FILE, TIMINGS_FILE } from "../voice/tts.js";

export const CACHE_DIR = new URL("../../../data/demo-cache/", import.meta.url);
export const SCRIPT_FILE = "script.json";
export const VIDEO_FILE = "video.mp4"; // same name as in pipeline.ts
export const MEDIA_FILES = [AUDIO_FILE, TIMINGS_FILE, VIDEO_FILE];
