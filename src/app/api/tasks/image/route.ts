import { NextRequest, NextResponse } from "next/server";
import { verifyTasksToken } from "@/lib/job-engine";
import { runImageGenerationJob } from "@/lib/job-runner";
import { cloudTaskLogFields, logEvent } from "@/lib/observability";

// Cloud Tasks → Cloud Run 이미지 잡 핸들러. 공유 토큰으로 인증한다.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyTasksToken(req)) {
    logEvent("WARNING", "generation.task.unauthorized", "Unauthorized image task request", cloudTaskLogFields(req), req);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown };
  if (typeof body.jobId !== "string") {
    logEvent("WARNING", "generation.task.invalid", "Image task is missing jobId", cloudTaskLogFields(req), req);
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  const result = await runImageGenerationJob(body.jobId);
  logEvent(
    result.status === "failed" ? "ERROR" : "INFO",
    "generation.task.completed",
    "Image task completed",
    { ...cloudTaskLogFields(req), jobId: body.jobId, status: result.status },
    req
  );
  return NextResponse.json({ ok: true, ...result });
}
