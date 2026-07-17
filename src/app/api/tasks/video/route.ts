import { NextRequest, NextResponse } from "next/server";
import { scheduleVideoPoll, verifyTasksToken } from "@/lib/job-engine";
import { pollAndPersistVideo, startVideoOperation } from "@/lib/video-generation";

// Cloud Tasks → Cloud Run 영상 시작 핸들러. Veo 작업을 시작하고 첫 폴을 예약한다.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyTasksToken(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown };
  if (typeof body.jobId !== "string") {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  const started = await startVideoOperation(body.jobId);
  if (!started.operationName) {
    return NextResponse.json({ ok: true, status: "no-op" });
  }
  if (started.done) {
    await pollAndPersistVideo(body.jobId, started.operationName);
    return NextResponse.json({ ok: true, done: true });
  }
  await scheduleVideoPoll(body.jobId, started.operationName, 0, 15);
  return NextResponse.json({ ok: true, scheduled: true });
}
