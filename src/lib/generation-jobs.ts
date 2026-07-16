import type { GenerationArtifact, GenerationJob, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { refundJobCredit } from "./credit-service";

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
  extra: Prisma.GenerationJobUpdateInput = {}
) {
  await prisma.generationJob.updateMany({
    where: { id: jobId, startedAt: null },
    data: { startedAt: new Date() },
  });
  return prisma.generationJob.update({
    where: { id: jobId },
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
