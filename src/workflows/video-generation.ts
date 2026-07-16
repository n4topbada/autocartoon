import { sleep } from "workflow";
import {
  pollAndPersistVideo,
  startVideoOperation,
  timeoutVideoJob,
} from "@/lib/video-generation";

async function startVideo(jobId: string) {
  "use step";
  return startVideoOperation(jobId);
}

async function pollVideo(jobId: string, operationName: string) {
  "use step";
  return pollAndPersistVideo(jobId, operationName);
}

async function markVideoTimeout(jobId: string) {
  "use step";
  return timeoutVideoJob(jobId);
}

startVideo.maxRetries = 0;

export async function videoGenerationWorkflow(jobId: string) {
  "use workflow";

  const started = await startVideo(jobId);
  if (!started.operationName) return;

  if (started.done) {
    await pollVideo(jobId, started.operationName);
    return;
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep("15s");
    const done = await pollVideo(jobId, started.operationName);
    if (done) return;
  }

  await markVideoTimeout(jobId);
}
