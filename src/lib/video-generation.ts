import { GenerateVideosOperation, type Video } from "@google/genai";
import { uploadBufferToBlob, fetchBlobAsBase64, deleteBlob } from "./blob";
import {
  getGoogleAccessToken,
  getVideoAIClient,
  getVideoOutputGcsUri,
} from "./platform-ai";
import { prisma } from "./prisma";
import {
  failGenerationJob,
  updateJobProgress,
  type StoredVideoJobInput,
} from "./generation-jobs";
import { logError } from "./observability";
import { createSeedanceTask, getSeedanceTask } from "./seedance-video";
import { normalizeVideoProvider, type VideoProvider } from "./video-providers";

interface UploadedVideo {
  blobUrl: string;
  mimeType: string;
  sourceUri?: string;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
}

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
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`Veo Cloud Storage 다운로드 실패 (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  const response = await fetch(video.uri, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Veo 영상 다운로드 실패 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadSeedanceVideo(url: string): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Seedance 영상 다운로드 실패 (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
}

async function persistGeneratedVideos(
  jobId: string,
  provider: VideoProvider,
  uploaded: UploadedVideo[]
) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("영상 작업을 찾을 수 없습니다.");

  try {
    await prisma.$transaction(async (tx) => {
      const marked = await tx.generationJob.updateMany({
        where: { id: jobId, status: { in: ["queued", "running"] } },
        data: {
          status: "succeeded",
          stage: "completed",
          progress: 100,
          error: null,
          output: {
            videoCount: uploaded.length,
            provider,
            ...(uploaded[0]?.metadata || {}),
          },
          completedAt: new Date(),
        },
      });
      if (marked.count === 0) {
        throw new Error("작업이 이미 종료되어 영상을 저장하지 않습니다.");
      }

      await tx.generationArtifact.createMany({
        data: uploaded.map((video) => ({
          jobId,
          kind: "video",
          blobUrl: video.blobUrl,
          mimeType: video.mimeType,
          sizeBytes: video.sizeBytes,
          metadata: {
            provider,
            ...(video.sourceUri ? { sourceUri: video.sourceUri } : {}),
            ...(video.metadata || {}),
          },
        })),
      });

      if (job.projectId) {
        await tx.projectAsset.createMany({
          data: uploaded.map((video, index) => ({
            projectId: job.projectId!,
            jobId,
            kind: "video",
            name: `${provider === "seedance" ? "Seedance" : "Veo"} 영상 ${index + 1}`,
            blobUrl: video.blobUrl,
            mimeType: video.mimeType,
            sizeBytes: video.sizeBytes,
            metadata: { provider, ...(video.metadata || {}) },
          })),
        });
      }

      if (job.cutId) {
        await tx.projectCut.updateMany({
          where: { id: job.cutId },
          data: {
            videoUrl: uploaded[0].blobUrl,
            videoProvider: provider,
            videoApprovedAt: null,
          },
        });
      }
    });
  } catch (persistError) {
    await Promise.all(uploaded.map((video) => deleteBlob(video.blobUrl)));
    throw persistError;
  }
}

export async function startVideoOperation(jobId: string) {
  try {
    const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
    if (
      !job ||
      job.status === "succeeded" ||
      job.status === "canceled" ||
      job.status === "failed"
    ) {
      return { done: true, operationName: job?.operationName ?? null };
    }
    if (job.operationName) return { done: false, operationName: job.operationName };

    const input = job.input as unknown as StoredVideoJobInput;
    const provider = normalizeVideoProvider(input.provider || job.provider);
    await updateJobProgress(jobId, "submitting_video", 10);

    if (provider === "seedance") {
      const taskId = await createSeedanceTask(job.model, input);
      await updateJobProgress(jobId, "waiting_for_video", 20, { operationName: taskId });
      return { done: false, operationName: taskId };
    }

    const sourceImage = input.sourceImage
      ? await fetchBlobAsBase64(input.sourceImage.url)
      : undefined;
    const outputGcsUri = getVideoOutputGcsUri(jobId);
    const client = await getVideoAIClient();
    const operation = await client.models.generateVideos({
      model: job.model,
      source: {
        prompt: input.prompt,
        ...(sourceImage
          ? {
              image: {
                imageBytes: sourceImage.base64,
                mimeType: sourceImage.mimeType || input.sourceImage?.mimeType,
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

async function pollSeedance(jobId: string, taskId: string): Promise<boolean> {
  const result = await getSeedanceTask(taskId);
  if (!result.done) return false;
  if (result.failed) {
    await failGenerationJob(jobId, `Seedance 생성 실패: ${result.error || "알 수 없는 오류"}`);
    return true;
  }
  if (!result.videoUrl) {
    await failGenerationJob(jobId, "Seedance가 완성된 영상을 반환하지 않았습니다.");
    return true;
  }

  await updateJobProgress(jobId, "saving_video", 92);
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return true;
  const buffer = await downloadSeedanceVideo(result.videoUrl);
  const blobUrl = await uploadBufferToBlob(
    buffer,
    "video/mp4",
    "generated/videos",
    job.userId
  );
  await persistGeneratedVideos(jobId, "seedance", [{
    blobUrl,
    mimeType: "video/mp4",
    sourceUri: result.videoUrl,
    sizeBytes: buffer.length,
    ...(result.usage ? { metadata: result.usage } : {}),
  }]);
  return true;
}

async function pollVeo(jobId: string, operationName: string): Promise<boolean> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) return true;
  const client = await getVideoAIClient();
  const operationHandle = new GenerateVideosOperation();
  operationHandle.name = operationName;
  Object.defineProperty(operationHandle, "_fromAPIResponse", {
    configurable: true,
    value: GenerateVideosOperation.prototype._fromAPIResponse,
  });
  const operation = await client.operations.getVideosOperation({ operation: operationHandle });

  if (!operation.done) return false;
  if (operation.error) {
    await failGenerationJob(jobId, `Veo 생성 실패: ${JSON.stringify(operation.error)}`);
    return true;
  }

  const videos = operation.response?.generatedVideos
    ?.map((item) => item.video)
    .filter((video): video is Video => Boolean(video));
  if (!videos?.length) {
    await failGenerationJob(jobId, "Veo가 완성된 영상을 반환하지 않았습니다.");
    return true;
  }

  await updateJobProgress(jobId, "saving_video", 92);
  const uploaded: UploadedVideo[] = [];
  for (const video of videos) {
    const buffer = await readGeneratedVideo(video);
    const mimeType = video.mimeType || "video/mp4";
    const blobUrl = await uploadBufferToBlob(buffer, mimeType, "generated/videos", job.userId);
    uploaded.push({ blobUrl, mimeType, sourceUri: video.uri, sizeBytes: buffer.length });
  }
  await persistGeneratedVideos(jobId, "veo", uploaded);
  return true;
}

export async function pollAndPersistVideo(jobId: string, operationName: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "canceled" || job.status === "failed" || job.status === "succeeded") {
    return true;
  }

  try {
    const input = job.input as unknown as StoredVideoJobInput;
    const provider = normalizeVideoProvider(input.provider || job.provider);
    const done = provider === "seedance"
      ? await pollSeedance(jobId, operationName)
      : await pollVeo(jobId, operationName);
    if (!done) {
      await updateJobProgress(
        jobId,
        "waiting_for_video",
        Math.min(90, Math.max(25, job.progress + 5))
      );
    }
    return done;
  } catch (error) {
    logError("generation.video.poll_failed", "Video poll failed and will retry", error, {
      jobId,
    });
    return false;
  }
}

export async function timeoutVideoJob(jobId: string) {
  await failGenerationJob(jobId, "영상 생성 제한 시간(30분)을 초과했습니다.");
}
