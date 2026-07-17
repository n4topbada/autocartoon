import { NextRequest, NextResponse } from "next/server";
import { scheduleVideoPoll, verifyTasksToken } from "@/lib/job-engine";
import { pollAndPersistVideo, timeoutVideoJob } from "@/lib/video-generation";
import { cloudTaskLogFields, logEvent } from "@/lib/observability";

// Cloud Tasks → Cloud Run 영상 폴링 핸들러. 한 번 폴하고, 미완이면 15초 뒤 재큐한다.
const MAX_ATTEMPTS = 120; // 120 × 15초 ≈ 30분 (기존 워크플로와 동일)
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!verifyTasksToken(req)) {
    logEvent("WARNING", "generation.task.unauthorized", "Unauthorized video poll request", cloudTaskLogFields(req), req);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    jobId?: unknown;
    operationName?: unknown;
    attempt?: unknown;
  };
  if (typeof body.jobId !== "string" || typeof body.operationName !== "string") {
    logEvent("WARNING", "generation.task.invalid", "Video poll task is missing required fields", cloudTaskLogFields(req), req);
    return NextResponse.json({ error: "jobId, operationName required" }, { status: 400 });
  }
  const done = await pollAndPersistVideo(body.jobId, body.operationName);
  if (done) {
    logEvent("NOTICE", "generation.video.succeeded", "Video generation succeeded", {
      ...cloudTaskLogFields(req),
      jobId: body.jobId,
      attempt: typeof body.attempt === "number" ? body.attempt : 0,
    }, req);
    return NextResponse.json({ ok: true, done: true });
  }
  const next = (typeof body.attempt === "number" ? body.attempt : 0) + 1;
  if (next >= MAX_ATTEMPTS) {
    await timeoutVideoJob(body.jobId);
    logEvent("ERROR", "generation.video.timeout", "Video generation timed out", {
      ...cloudTaskLogFields(req),
      jobId: body.jobId,
      attempt: next,
    }, req);
    return NextResponse.json({ ok: true, timeout: true });
  }
  await scheduleVideoPoll(body.jobId, body.operationName, next, 15);
  if (next % 10 === 0) {
    logEvent("INFO", "generation.video.poll_pending", "Video generation is still pending", {
      ...cloudTaskLogFields(req),
      jobId: body.jobId,
      attempt: next,
    }, req);
  }
  return NextResponse.json({ ok: true, scheduled: next });
}
