import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { AuthError, requireAuth } from "@/lib/auth";
import { reserveJobCredit } from "@/lib/credit-service";
import {
  failGenerationJob,
  jobToResponse,
  reapExpiredJobsForUser,
  type StoredVideoJobInput,
} from "@/lib/generation-jobs";
import {
  getPlatformAIProvider,
  getPublicPlatformAIError,
  getVideoModel,
} from "@/lib/platform-ai";
import { prisma } from "@/lib/prisma";
import { videoGenerationWorkflow } from "@/workflows/video-generation";
import { Prisma } from "@prisma/client";

const ALLOWED_DURATIONS = new Set([4, 6, 8]);
const ALLOWED_ASPECT_RATIOS = new Set(["16:9", "9:16"]);
const ALLOWED_RESOLUTIONS = new Set(["720p", "1080p"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    // 시간 초과로 멈춘 작업을 실패+환불 처리(멱등)한 뒤 목록을 조회한다.
    await reapExpiredJobsForUser(session.userId).catch((error) => {
      console.error("Job reaper failed:", error);
    });
    const status = req.nextUrl.searchParams.get("status");
    const kind = req.nextUrl.searchParams.get("kind");
    const requestedLimit = Number(req.nextUrl.searchParams.get("limit") || 30);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(50, Math.floor(requestedLimit)))
      : 30;
    const jobs = await prisma.generationJob.findMany({
      where: {
        userId: session.userId,
        ...(status ? { status } : {}),
        ...(kind ? { kind } : {}),
      },
      include: { artifacts: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ jobs: jobs.map(jobToResponse) });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Job list error:", error);
    return NextResponse.json({ error: "생성 작업을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body: unknown = await req.json();
    if (!isRecord(body) || body.kind !== "video") {
      return NextResponse.json({ error: "지원되는 작업 종류는 video입니다." }, { status: 400 });
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 10_000) {
      return NextResponse.json({ error: "영상 프롬프트를 입력하세요." }, { status: 400 });
    }
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const cutId = typeof body.cutId === "string" ? body.cutId : undefined;
    if (cutId && !projectId) {
      return NextResponse.json({ error: "컷 영상 생성에는 projectId가 필요합니다." }, { status: 400 });
    }

    if (projectId) {
      const project = await prisma.creativeProject.findFirst({
        where: { id: projectId, userId: session.userId },
        select: { id: true },
      });
      if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    if (cutId) {
      const cut = await prisma.projectCut.findFirst({
        where: { id: cutId, projectId, project: { userId: session.userId } },
        select: { id: true },
      });
      if (!cut) return NextResponse.json({ error: "프로젝트 컷을 찾을 수 없습니다." }, { status: 404 });
    }

    const sourceAssetId = typeof body.sourceAssetId === "string" ? body.sourceAssetId : undefined;
    const sourceAsset = sourceAssetId
      ? await prisma.projectAsset.findFirst({
          where: {
            id: sourceAssetId,
            kind: "image",
            project: { userId: session.userId },
            ...(projectId ? { projectId } : {}),
          },
        })
      : null;
    if (sourceAssetId && !sourceAsset) {
      return NextResponse.json({ error: "영상 시작 이미지를 찾을 수 없습니다." }, { status: 404 });
    }

    const aspectRatio = ALLOWED_ASPECT_RATIOS.has(String(body.aspectRatio))
      ? (body.aspectRatio as "16:9" | "9:16")
      : "9:16";
    const durationSeconds = ALLOWED_DURATIONS.has(Number(body.durationSeconds))
      ? (Number(body.durationSeconds) as 4 | 6 | 8)
      : 8;
    const resolution = ALLOWED_RESOLUTIONS.has(String(body.resolution))
      ? (body.resolution as "720p" | "1080p")
      : "720p";
    const negativePrompt =
      typeof body.negativePrompt === "string" && body.negativePrompt.trim()
        ? body.negativePrompt.trim().slice(0, 2_000)
        : undefined;
    const idempotencyKey =
      req.headers.get("idempotency-key")?.trim().slice(0, 200) ||
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim().slice(0, 200) : "") ||
      crypto.randomUUID();

    const existing = await prisma.generationJob.findUnique({
      where: { userId_idempotencyKey: { userId: session.userId, idempotencyKey } },
      include: { artifacts: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) {
      return NextResponse.json({ job: jobToResponse(existing), deduplicated: true }, { status: 202 });
    }

    const input: StoredVideoJobInput = {
      prompt,
      aspectRatio,
      durationSeconds,
      resolution,
      generateAudio: body.generateAudio !== false,
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(sourceAsset
        ? {
            sourceImage: {
              url: sourceAsset.blobUrl,
              mimeType: sourceAsset.mimeType,
            },
          }
        : {}),
    };
    let job;
    try {
      job = await prisma.generationJob.create({
        data: {
          userId: session.userId,
          projectId,
          cutId,
          kind: "video",
          provider: getPlatformAIProvider(),
          model: getVideoModel(),
          idempotencyKey,
          prompt,
          input: input as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (createError) {
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
        const existingJob = await prisma.generationJob.findUnique({
          where: { userId_idempotencyKey: { userId: session.userId, idempotencyKey } },
          include: { artifacts: { orderBy: { createdAt: "asc" } } },
        });
        if (existingJob) {
          return NextResponse.json({ job: jobToResponse(existingJob), deduplicated: true }, { status: 202 });
        }
      }
      throw createError;
    }

    const credit = await reserveJobCredit(session.userId, job.id);
    if (!credit.ok) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "failed", stage: "credit_rejected", error: credit.error, completedAt: new Date() },
      });
      return NextResponse.json({ error: credit.error }, { status: 402 });
    }

    try {
      const run = await start(videoGenerationWorkflow, [job.id]);
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
    console.error("Video job start error:", error);
    return NextResponse.json(
      { error: getPublicPlatformAIError(error, "영상 작업을 시작하지 못했습니다.") },
      { status: 500 }
    );
  }
}
