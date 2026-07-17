import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { AuthError, requireAuth } from "@/lib/auth";
import { reserveJobCredit } from "@/lib/credit-service";
import {
  failGenerationJob,
  findJobForUser,
  isJobExpired,
  jobToResponse,
} from "@/lib/generation-jobs";
import { prisma } from "@/lib/prisma";
import { imageGenerationWorkflow } from "@/workflows/image-generation";
import { videoGenerationWorkflow } from "@/workflows/video-generation";
import type { Prisma } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    let job = await findJobForUser(id, session.userId);
    if (!job) return NextResponse.json({ error: "생성 작업을 찾을 수 없습니다." }, { status: 404 });
    // 폴링 중 시간 초과로 멈춘 작업을 실패+환불 처리하고 최신 상태로 갱신한다.
    if (isJobExpired(job)) {
      await failGenerationJob(
        job.id,
        "생성이 제한 시간을 초과해 자동 취소되었습니다. 사용한 크레딧은 환불됩니다."
      );
      job = (await findJobForUser(id, session.userId)) ?? job;
    }
    return NextResponse.json({ job: jobToResponse(job) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "생성 상태를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    if (body.action !== "retry") {
      return NextResponse.json({ error: "지원되는 작업은 retry입니다." }, { status: 400 });
    }

    const previous = await findJobForUser(id, session.userId);
    if (!previous) return NextResponse.json({ error: "생성 작업을 찾을 수 없습니다." }, { status: 404 });
    if (previous.status !== "failed") {
      return NextResponse.json({ error: "실패한 작업만 다시 시도할 수 있습니다." }, { status: 409 });
    }

    const job = await prisma.generationJob.create({
      data: {
        userId: previous.userId,
        projectId: previous.projectId,
        cutId: previous.cutId,
        kind: previous.kind,
        provider: previous.provider,
        model: previous.model,
        idempotencyKey: `${previous.id}:retry:${crypto.randomUUID()}`,
        prompt: previous.prompt,
        input: previous.input as Prisma.InputJsonValue,
      },
    });
    const credit = await reserveJobCredit(session.userId, job.id);
    if (!credit.ok) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", stage: "credit_rejected", error: credit.error, completedAt: new Date() },
      });
      return NextResponse.json({ error: credit.error }, { status: 402 });
    }

    try {
      const run = previous.kind === "video"
        ? await start(videoGenerationWorkflow, [job.id])
        : await start(imageGenerationWorkflow, [job.id]);
      const queued = await prisma.generationJob.update({
        where: { id: job.id },
        data: { runId: run.runId },
        include: { artifacts: true },
      });
      return NextResponse.json({ job: jobToResponse(queued) }, { status: 202 });
    } catch (error) {
      await failGenerationJob(job.id, error);
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Job retry error:", error);
    return NextResponse.json({ error: "작업을 다시 시작하지 못했습니다." }, { status: 500 });
  }
}
