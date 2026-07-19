import { fetchBlobAsBase64 } from "./blob";
import type { StoredVideoJobInput } from "./generation-jobs";
import { getSeedanceApiBaseUrl } from "./video-providers";

interface SeedanceTask {
  id?: string;
  status?: string;
  error?: { message?: string; code?: string } | string | null;
  content?: { video_url?: string } | null;
  usage?: { completion_tokens?: number; total_tokens?: number } | null;
}

async function seedanceRequest(path: string, init?: RequestInit): Promise<SeedanceTask> {
  const apiKey = process.env.SEEDANCE_API_KEY?.trim();
  if (!apiKey) throw new Error("Seedance API 키가 설정되지 않았습니다.");

  const response = await fetch(`${getSeedanceApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({})) as SeedanceTask & {
    message?: string;
    code?: string;
  };
  if (!response.ok) {
    throw new Error(body.message || body.error?.toString() || `Seedance 요청 실패 (${response.status})`);
  }
  return body;
}

export async function createSeedanceTask(
  model: string,
  input: StoredVideoJobInput
): Promise<string> {
  const content: Array<Record<string, unknown>> = [{
    type: "text",
    text: input.negativePrompt
      ? `${input.prompt}\n\nAvoid: ${input.negativePrompt}`
      : input.prompt,
  }];
  if (input.sourceImage) {
    const source = await fetchBlobAsBase64(input.sourceImage.url);
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${source.mimeType || input.sourceImage.mimeType};base64,${source.base64}`,
      },
      role: "first_frame",
    });
  }

  const task = await seedanceRequest("/contents/generations/tasks", {
    method: "POST",
    body: JSON.stringify({
      model,
      content,
      ratio: input.aspectRatio,
      duration: input.durationSeconds,
      resolution: input.resolution,
      generate_audio: input.generateAudio,
      watermark: false,
    }),
  });
  if (!task.id) throw new Error("Seedance 작업 ID를 받지 못했습니다.");
  return task.id;
}

export async function getSeedanceTask(taskId: string): Promise<{
  done: boolean;
  failed: boolean;
  error?: string;
  videoUrl?: string;
  usage?: Record<string, number>;
}> {
  const task = await seedanceRequest(`/contents/generations/tasks/${encodeURIComponent(taskId)}`);
  const status = String(task.status || "").toLowerCase();
  const failed = ["failed", "cancelled", "canceled", "expired"].includes(status);
  const succeeded = status === "succeeded";
  const error = typeof task.error === "string"
    ? task.error
    : task.error?.message || task.error?.code;
  return {
    done: failed || succeeded,
    failed,
    ...(error ? { error } : {}),
    ...(task.content?.video_url ? { videoUrl: task.content.video_url } : {}),
    ...(task.usage
      ? {
          usage: {
            completionTokens: Number(task.usage.completion_tokens || 0),
            totalTokens: Number(task.usage.total_tokens || 0),
          },
        }
      : {}),
  };
}
