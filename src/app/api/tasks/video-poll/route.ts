import { NextRequest, NextResponse } from "next/server";
import { scheduleVideoPoll, verifyTasksToken } from "@/lib/job-engine";
import { pollAndPersistVideo, timeoutVideoJob } from "@/lib/video-generation";

// Cloud Tasks → Cloud Run 영상 폴링 핸들러. 한 번 폴하고, 미완이면 15초 뒤 재큐한다.
const MAX_ATTEMPTS = 120; // 120 × 15초 ≈ 30분 (기존 워크플로와 동일)
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  if (!verifyTasksToken(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    jobId?: unknown;
    operationName?: unknown;
    attempt?: unknown;
  };
  if (typeof body.jobId !== "string" || typeof body.operationName !== "string") {
    return NextResponse.json({ error: "jobId, operationName required" }, { status: 400 });
  }
  const done = await pollAndPersistVideo(body.jobId, body.operationName);
  if (done) {
    return NextResponse.json({ ok: true, done: true });
  }
  const next = (typeof body.attempt === "number" ? body.attempt : 0) + 1;
  if (next >= MAX_ATTEMPTS) {
    await timeoutVideoJob(body.jobId);
    return NextResponse.json({ ok: true, timeout: true });
  }
  await scheduleVideoPoll(body.jobId, body.operationName, next, 15);
  return NextResponse.json({ ok: true, scheduled: next });
}
