import { prisma } from "@/lib/prisma";
import { generate } from "@/lib/generation-service";
import {
  failGenerationJob,
  updateJobProgress,
  type StoredImageJobInput,
} from "@/lib/generation-jobs";

async function performImageGeneration(jobId: string) {
  "use step";

  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "succeeded" || job.status === "canceled") {
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
    });
    return { status: "succeeded" };
  } catch (error) {
    await failGenerationJob(jobId, error);
    return { status: "failed" };
  }
}

performImageGeneration.maxRetries = 0;

export async function imageGenerationWorkflow(jobId: string) {
  "use workflow";
  return performImageGeneration(jobId);
}
