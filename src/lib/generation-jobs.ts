import type { GenerationArtifact, GenerationJob, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { refundJobCredit } from "./credit-service";
import { getGenerationCreditCost } from "./credit-products";

export type JobKind = "image" | "background" | "character" | "gesture" | "video";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface StoredImageReference {
  url: string;
  mimeType: string;
}

export interface StoredLabeledImageReference extends StoredImageReference {
  label: string;
}

export interface StoredImageJobInput {
  presetIds: string[];
  mode: "text" | "sketch" | "edit" | "transform";
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  imageSize?: "1K" | "2K";
  count?: number;
  prompt: string;
  background?: string;
  backgroundImageId?: string;
  inputImage?: StoredImageReference;
  inputImages?: StoredImageReference[];
  referenceAssets?: StoredLabeledImageReference[];
  editRegionMode?: "auto" | "manual";
  editMask?: StoredImageReference;
  preserveOutsideMask?: boolean;
  isAdmin: boolean;
}

export interface StoredVideoJobInput {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: "16:9" | "9:16";
  durationSeconds: 4 | 6 | 8;
  resolution: "720p" | "1080p";
  generateAudio: boolean;
  sourceImage?: StoredImageReference;
}

export type JobWithArtifacts = GenerationJob & {
  artifacts: GenerationArtifact[];
};

export function jobToResponse(job: JobWithArtifacts) {
  const input = job.input && typeof job.input === "object" && !Array.isArray(job.input)
    ? job.input as Record<string, unknown>
    : {};
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    provider: job.provider,
    model: job.model,
    prompt: job.prompt,
    projectId: job.projectId,
    cutId: job.cutId,
    output: job.output,
    error: job.error,
    runId: job.runId,
    operationName: job.operationName,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    creditCost: job.creditUnits ?? getGenerationCreditCost(job.kind, input),
    artifacts: job.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      blobUrl: artifact.blobUrl,
      thumbnailUrl: artifact.thumbnailUrl,
      mimeType: artifact.mimeType,
      metadata: artifact.metadata,
      createdAt: artifact.createdAt,
    })),
  };
}

export const ACTIVE_JOB_STATUSES: string[] = ["queued", "running"];

// 프로세스가 강제 종료(타임아웃/OOM/배포)되면 작업이 queued/running에 영구히 멈출 수 있다.
// 폴링 라우트에서 이 시간을 넘긴 작업을 실패 처리하고 크레딧을 환불한다.
const IMAGE_JOB_MAX_AGE_MS = 10 * 60 * 1000;
const VIDEO_JOB_MAX_AGE_MS = 45 * 60 * 1000; // 워크플로 자체 타임아웃(30분)보다 넉넉한 백스톱

export function jobMaxAgeMs(kind: string) {
  return kind === "video" ? VIDEO_JOB_MAX_AGE_MS : IMAGE_JOB_MAX_AGE_MS;
}

export function isJobExpired(job: { kind: string; status: string; createdAt: Date }) {
  if (job.status !== "queued" && job.status !== "running") return false;
  return Date.now() - job.createdAt.getTime() > jobMaxAgeMs(job.kind);
}

/** 폴링 시 호출하는 지연 리퍼: 시간 초과로 멈춘 작업을 실패+환불 처리한다(멱등). */
export async function reapExpiredJobsForUser(userId: string) {
  const candidates = await prisma.generationJob.findMany({
    where: { userId, status: { in: ["queued", "running"] } },
    select: { id: true, kind: true, status: true, createdAt: true },
  });
  const expired = candidates.filter(isJobExpired);
  for (const job of expired) {
    await failGenerationJob(
      job.id,
      "생성이 제한 시간을 초과해 자동 취소되었습니다. 사용한 크레딧은 환불됩니다."
    );
  }
  return expired.length;
}

export async function findJobForUser(jobId: string, userId: string) {
  return prisma.generationJob.findFirst({
    where: { id: jobId, userId },
    include: { artifacts: { orderBy: { createdAt: "asc" } } },
  });
}

export async function updateJobProgress(
  jobId: string,
  stage: string,
  progress: number,
  extra: Prisma.GenerationJobUpdateManyMutationInput = {}
) {
  // 종료된(succeeded/failed/canceled) 작업을 다시 running으로 되살리지 않도록 상태를 가드한다.
  await prisma.generationJob.updateMany({
    where: { id: jobId, startedAt: null, status: { in: ACTIVE_JOB_STATUSES } },
    data: { startedAt: new Date() },
  });
  return prisma.generationJob.updateMany({
    where: { id: jobId, status: { in: ACTIVE_JOB_STATUSES } },
    data: {
      status: "running",
      stage,
      progress: Math.max(0, Math.min(99, Math.round(progress))),
      ...extra,
    },
  });
}

export async function failGenerationJob(jobId: string, error: unknown) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "생성 실패";
  const safeMessage = message.slice(0, 4000);

  await prisma.$transaction(async (tx) => {
    const failed = await tx.generationJob.updateMany({
      where: {
        id: jobId,
        status: { notIn: ["succeeded", "canceled", "failed"] },
      },
      data: {
        status: "failed",
        stage: "failed",
        error: safeMessage,
        completedAt: new Date(),
      },
    });
    if (failed.count === 0) return;
    await refundJobCredit(jobId, safeMessage, tx);
  });
}
