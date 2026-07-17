import { NextRequest, NextResponse } from "next/server";
import { scheduleVideoPoll, verifyTasksToken } from "@/lib/job-engine";
import { pollAndPersistVideo, startVideoOperation } from "@/lib/video-generation";
import { cloudTaskLogFields, logEvent } from "@/lib/observability";

// Cloud Tasks → Cloud Run 영상 시작 핸들러. Veo 작업을 시작하고 첫 폴을 예약한다.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyTasksToken(req)) {
    logEvent("WARNING", "generation.task.unauthorized", "Unauthorized video task request", cloudTaskLogFields(req), req);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown };
  if (typeof body.jobId !== "string") {
    logEvent("WARNING", "generation.task.invalid", "Video task is missing jobId", cloudTaskLogFields(req), req);
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  logEvent("INFO", "generation.video.task_started", "Video task started", {
    ...cloudTaskLogFields(req),
    jobId: body.jobId,
  }, req);
  const started = await startVideoOperation(body.jobId);
  if (!started.operationName) {
    logEvent("INFO", "generation.video.skipped", "Video task skipped", { jobId: body.jobId }, req);
    return NextResponse.json({ ok: true, status: "no-op" });
  }
  if (started.done) {
    await pollAndPersistVideo(body.jobId, started.operationName);
    logEvent("NOTICE", "generation.video.succeeded", "Video generation succeeded", { jobId: body.jobId }, req);
    return NextResponse.json({ ok: true, done: true });
  }
  await scheduleVideoPoll(body.jobId, started.operationName, 0, 15);
  logEvent("INFO", "generation.video.poll_scheduled", "Video poll scheduled", { jobId: body.jobId, attempt: 0 }, req);
  return NextResponse.json({ ok: true, scheduled: true });
}
