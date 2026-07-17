import { GenerateVideosOperation, type Video } from "@google/genai";
import { uploadBufferToBlob, fetchBlobAsBase64, deleteBlob } from "./blob";
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
import { logError } from "./observability";

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
  try {
    // findUnique를 try 안으로 넣어, 일시적 DB 오류로 스텝이 죽어 작업이 영구히
    // queued에 멈추는 대신 실패+환불 경로를 타도록 한다.
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
    const operationHandle = new GenerateVideosOperation();
    operationHandle.name = operationName;
    Object.defineProperty(operationHandle, "_fromAPIResponse", {
      configurable: true,
      value: GenerateVideosOperation.prototype._fromAPIResponse,
    });
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

    // 아래 두 가지는 확정적(terminal) 실패이므로 실패+환불 처리한다.
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
    const uploaded = [] as Array<{ blobUrl: string; mimeType: string; sourceUri?: string; sizeBytes: number }>;
    for (const video of videos) {
      const buffer = await readGeneratedVideo(video);
      const mimeType = video.mimeType || "video/mp4";
      const blobUrl = await uploadBufferToBlob(buffer, mimeType, "generated/videos", job.userId);
      uploaded.push({ blobUrl, mimeType, sourceUri: video.uri, sizeBytes: buffer.length });
    }

    try {
      await prisma.$transaction(async (tx) => {
        // 종료된 작업을 succeeded로 덮어써 환불+영상 동시 지급이 되는 것을 막는다.
        const marked = await tx.generationJob.updateMany({
          where: { id: jobId, status: { in: ["queued", "running"] } },
          data: {
            status: "succeeded",
            stage: "completed",
            progress: 100,
            error: null,
            output: { videoCount: uploaded.length },
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
              sizeBytes: video.sizeBytes,
            })),
          });
        }

        // 컷이 도중에 삭제됐을 수 있으므로 updateMany로 0행을 허용한다(P2025 방지).
        if (job.cutId) {
          await tx.projectCut.updateMany({
            where: { id: job.cutId },
            data: { videoUrl: uploaded[0].blobUrl },
          });
        }
      });
    } catch (persistError) {
      // 영상은 이미 업로드됐는데 저장에 실패하면 고아 blob이 남으므로 보상 삭제한다.
      await Promise.all(uploaded.map((video) => deleteBlob(video.blobUrl)));
      throw persistError;
    }
    return true;
  } catch (error) {
    // 일시적 오류(폴링/다운로드/업로드/DB)는 실패로 확정하지 않고 다음 폴링에서 재시도한다.
    // 계속 실패하면 상위 루프의 타임아웃(markVideoTimeout)이 실패+환불을 수행한다.
    logError("generation.video.poll_failed", "Video poll failed and will retry", error, {
      jobId,
    });
    return false;
  }
}

export async function timeoutVideoJob(jobId: string) {
  await failGenerationJob(jobId, "Veo 생성 제한 시간(30분)을 초과했습니다.");
}
