// STUB until S3-S5: no script, voice or video is generated, it only walks the statuses.
import getJobMock from "../../mocks/get-job.json" with { type: "json" };
import scheduleMock from "../../mocks/schedule.json" with { type: "json" };
import type { JobStore } from "./store.js";

const STEP_MS = 3000;

export function startStubPipeline(jobs: JobStore, id: string) {
  const steps = [
    () => jobs.update(id, { status: "scripting" }),
    () =>
      jobs.update(id, {
        status: "voicing",
        script: getJobMock.script,
        caption: scheduleMock[0].caption,
      }),
    () =>
      jobs.update(id, {
        status: "rendering",
        audioUrl: getJobMock.audioUrl.replace(getJobMock.id, id),
      }),
    () =>
      jobs.update(id, {
        status: "awaiting_approval",
        videoUrl: getJobMock.videoUrl.replace(getJobMock.id, id),
      }),
  ];
  steps.forEach((step, i) => setTimeout(step, STEP_MS * (i + 1)));
}
