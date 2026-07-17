import { prisma } from "./prisma";
import { generate } from "./generation-service";
import {
  failGenerationJob,
  updateJobProgress,
  type StoredImageJobInput,
} from "./generation-jobs";
import {
  pollAndPersistVideo,
  startVideoOperation,
  timeoutVideoJob,
} from "./video-generation";

/**
 * 이미지 생성 잡의 단일 실행 로직. 인라인(로컬) 실행과 Cloud Tasks 핸들러가
 * 공유한다. 종료된(succeeded/failed/canceled) 잡은 되살리지 않는다.
 */
export async function runImageGenerationJob(
  jobId: string
): Promise<{ status: string }> {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (
    !job ||
    job.status === "succeeded" ||
    job.status === "canceled" ||
    job.status === "failed"
  ) {
    return { status: job?.status ?? "missing" };
  }

  try {
    const input = job.input as unknown as StoredImageJobInput;
    await updateJobProgress(jobId, "preparing_references", 10);
    await updateJobProgress(jobId, "generating_image", 35);
    await generate({
      jobId,
      userId: job.userId,
      isAdmin: input.isAdmin,
      presetIds: input.presetIds,
      mode: input.mode,
      aspectRatio: input.aspectRatio,
      imageSize: input.imageSize,
      count: input.count,
      prompt: input.prompt,
      background: input.background,
      backgroundImageId: input.backgroundImageId,
      inputImageUrl: input.inputImage,
      inputImageUrls: input.inputImages,
      referenceAssetUrls: input.referenceAssets,
      editRegionMode: input.editRegionMode,
      editMaskUrl: input.editMask,
      preserveOutsideMask: input.preserveOutsideMask,
    });
    return { status: "succeeded" };
  } catch (error) {
    await failGenerationJob(jobId, error);
    return { status: "failed" };
  }
}

/**
 * 영상 잡의 인라인 실행(로컬 개발용). Cloud Tasks가 없을 때 같은 프로세스에서
 * 시작 + 폴 루프를 돌린다(fire-and-forget). 운영은 Cloud Tasks 재큐 사용.
 */
export async function runVideoInline(jobId: string): Promise<void> {
  const started = await startVideoOperation(jobId);
  if (!started.operationName) return;
  if (started.done) {
    await pollAndPersistVideo(jobId, started.operationName);
    return;
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    if (await pollAndPersistVideo(jobId, started.operationName)) return;
  }
  await timeoutVideoJob(jobId);
}
