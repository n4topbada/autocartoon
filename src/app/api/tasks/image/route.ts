import { NextRequest, NextResponse } from "next/server";
import { verifyTasksToken } from "@/lib/job-engine";
import { runImageGenerationJob } from "@/lib/job-runner";

// Cloud Tasks → Cloud Run 이미지 잡 핸들러. 공유 토큰으로 인증한다.
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  if (!verifyTasksToken(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown };
  if (typeof body.jobId !== "string") {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }
  const result = await runImageGenerationJob(body.jobId);
  return NextResponse.json({ ok: true, ...result });
}
