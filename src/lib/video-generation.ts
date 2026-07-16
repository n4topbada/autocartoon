import type { Video } from "@google/genai";
import { uploadBufferToBlob, fetchBlobAsBase64 } from "./blob";
import {
  getGoogleAccessToken,
  getVideoAIClient,
  getVideoModel,
  getVideoOutputGcsUri,
} from "./platform-ai";
import { prisma } from "./prisma";
import {
  failGenerationJob,
  updateJobProgress,
  type StoredVideoJobInput,
} from "./generation-jobs";

async function readGeneratedVideo(video: Video): Promise<Buffer> {
  if (video.videoBytes) return Buffer.from(video.videoBytes, "base64");
  if (!video.uri) throw new Error("Veo가 영상 데이터를 반환하지 않았습니다.");

  if (video.uri.startsWith("gs://")) {
    const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(video.uri);
    if (!match) throw new Error("Veo Cloud Storage URI가 올바르지 않습니다.");
    const accessToken = await getGoogleAccessToken();
    const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(match[1])}/o/${encodeURIComponent(match[2])}?alt=media`;
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Veo Cloud Storage 다운로드 실패 (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  const response = await fetch(video.uri);
  if (!response.ok) throw new Error(`Veo 영상 다운로드 실패 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

export async function startVideoOperation(jobId: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "succeeded" || job.status === "canceled") {
    return { done: true, operationName: job?.operationName ?? null };
  }
  if (job.operationName) return { done: false, operationName: job.operationName };

  try {
    const input = job.input as unknown as StoredVideoJobInput;
    await updateJobProgress(jobId, "submitting_video", 10);
    const sourceImage = input.sourceImage
      ? await fetchBlobAsBase64(input.sourceImage.url)
      : undefined;
    const outputGcsUri = getVideoOutputGcsUri(jobId);
    const client = await getVideoAIClient();
    const operation = await client.models.generateVideos({
      model: job.model || getVideoModel(),
      source: {
        prompt: input.prompt,
        ...(sourceImage
          ? {
              image: {
                imageBytes: sourceImage.base64,
                mimeType: input.sourceImage?.mimeType || sourceImage.mimeType,
              },
            }
          : {}),
      },
      config: {
        numberOfVideos: 1,
        aspectRatio: input.aspectRatio,
        durationSeconds: input.durationSeconds,
        resolution: input.resolution,
        generateAudio: input.generateAudio,
        enhancePrompt: true,
        personGeneration: "allow_adult",
        ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
        ...(outputGcsUri ? { outputGcsUri } : {}),
        labels: { application: "autocartoon", job_id: jobId },
      },
    });

    if (!operation.name) throw new Error("Veo 작업 ID를 받지 못했습니다.");
    await updateJobProgress(jobId, "waiting_for_video", 20, {
      operationName: operation.name,
    });
    return { done: Boolean(operation.done), operationName: operation.name };
  } catch (error) {
    await failGenerationJob(jobId, error);
    return { done: true, operationName: null };
  }
}

startVideoOperation.maxRetries = 0;

export async function pollAndPersistVideo(jobId: string, operationName: string) {
  const job = await prisma.generationJob.findUnique({
    where: { id: jobId },
    include: { artifacts: true },
  });
  if (!job || job.status === "canceled" || job.status === "failed") return true;
  if (job.status === "succeeded") return true;

  try {
    const client = await getVideoAIClient();
    const { GenerateVideosOperation } = await import("@google/genai");
    const operationHandle = new GenerateVideosOperation();
    operationHandle.name = operationName;
    const operation = await client.operations.getVideosOperation({
      operation: operationHandle,
    });

    if (!operation.done) {
      await updateJobProgress(
        jobId,
        "waiting_for_video",
        Math.min(90, Math.max(25, job.progress + 5))
      );
      return false;
    }

    if (operation.error) {
      throw new Error(`Veo 생성 실패: ${JSON.stringify(operation.error)}`);
    }

    const videos = operation.response?.generatedVideos
      ?.map((item) => item.video)
      .filter((video): video is Video => Boolean(video));
    if (!videos?.length) throw new Error("Veo가 완성된 영상을 반환하지 않았습니다.");

    await updateJobProgress(jobId, "saving_video", 92);
    const uploaded = [] as Array<{ blobUrl: string; mimeType: string; sourceUri?: string }>;
    for (const video of videos) {
      const buffer = await readGeneratedVideo(video);
      const mimeType = video.mimeType || "video/mp4";
      const blobUrl = await uploadBufferToBlob(buffer, mimeType, "generated/videos");
      uploaded.push({ blobUrl, mimeType, sourceUri: video.uri });
    }

    await prisma.$transaction(async (tx) => {
      await tx.generationArtifact.createMany({
        data: uploaded.map((video) => ({
          jobId,
          kind: "video",
          blobUrl: video.blobUrl,
          mimeType: video.mimeType,
          metadata: video.sourceUri ? { sourceUri: video.sourceUri } : undefined,
        })),
      });

      if (job.projectId) {
        await tx.projectAsset.createMany({
          data: uploaded.map((video, index) => ({
            projectId: job.projectId!,
            jobId,
            kind: "video",
            name: `Veo 영상 ${index + 1}`,
            blobUrl: video.blobUrl,
            mimeType: video.mimeType,
          })),
        });
      }

      if (job.cutId) {
        await tx.projectCut.update({
          where: { id: job.cutId },
          data: { videoUrl: uploaded[0].blobUrl },
        });
      }

      await tx.generationJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          stage: "completed",
          progress: 100,
          error: null,
          output: { videoCount: uploaded.length },
          completedAt: new Date(),
        },
      });
    });
    return true;
  } catch (error) {
    await failGenerationJob(jobId, error);
    return true;
  }
}

export async function timeoutVideoJob(jobId: string) {
  await failGenerationJob(jobId, "Veo 생성 제한 시간(30분)을 초과했습니다.");
}
