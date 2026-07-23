import {
  generateContent,
  type GeminiRequest,
  type GeminiResult,
} from "./gemini";
import { getPlatformAIProvider } from "./platform-ai";
import type { ImageModelId } from "./ai-pricing";

const OPENAI_IMAGE_MODEL = "gpt-image-2";
const OPENAI_IMAGE_API = "https://api.openai.com/v1/images";

type AspectRatio = NonNullable<GeminiRequest["aspectRatio"]>;
type ImageSize = NonNullable<GeminiRequest["imageSize"]>;

interface OpenAIImageResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string; code?: string };
}

export function isGoogleImageConfigured() {
  if (process.env.PLATFORM_AI_PROVIDER === "vertex" || process.env.GOOGLE_CLOUD_PROJECT) {
    return Boolean(process.env.GOOGLE_CLOUD_PROJECT?.trim());
  }
  return Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY_FALLBACK?.trim()
  );
}

export function isImageModelConfigured(modelId: ImageModelId) {
  return modelId === "gpt-image-2"
    ? Boolean(process.env.OPENAI_API_KEY?.trim())
    : isGoogleImageConfigured();
}

export function getImageGenerationProvider(modelId: ImageModelId) {
  return modelId === "gpt-image-2" ? "openai" : getPlatformAIProvider();
}

export function getGptImageSize(
  imageSize: ImageSize = "1K",
  aspectRatio: AspectRatio = "1:1"
) {
  const sizes = imageSize === "2K"
    ? {
        "1:1": "2048x2048",
        "4:5": "1632x2048",
        "9:16": "1152x2048",
        "16:9": "2048x1152",
      }
    : {
        "1:1": "1024x1024",
        "4:5": "1024x1280",
        "9:16": "1024x1824",
        "16:9": "1824x1024",
      };
  return sizes[aspectRatio];
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

function openAIError(status: number, payload: OpenAIImageResponse) {
  if (status === 401 || status === 403) {
    return new Error("GPT Image API 인증 또는 조직 인증 설정을 확인해주세요.");
  }
  if (status === 429) {
    return new Error("GPT Image 요청이 많거나 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.");
  }
  const detail = payload.error?.message?.trim().slice(0, 240);
  return new Error(detail ? `GPT Image 생성 오류: ${detail}` : "GPT Image가 이미지를 생성하지 못했습니다.");
}

function buildOpenAIReferencePrompt(req: GeminiRequest) {
  const roles: string[] = [];
  let index = 1;
  for (const image of req.priorityImages ?? []) {
    roles.push(`입력 이미지 ${index}: ${image.label}`);
    index += 1;
  }
  for (let referenceIndex = 0; referenceIndex < (req.referenceImages?.length ?? 0); referenceIndex += 1) {
    roles.push(`입력 이미지 ${index}: 일반 시각 참고 이미지`);
    index += 1;
  }
  for (const image of req.labeledImages ?? []) {
    roles.push(`입력 이미지 ${index}: ${image.label}`);
    index += 1;
  }
  return roles.length > 0
    ? `[입력 이미지 순서]\n${roles.join("\n")}\n각 이미지의 역할을 섞지 마세요.\n\n${req.prompt}`
    : req.prompt;
}

async function generateWithOpenAI(req: GeminiRequest): Promise<GeminiResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("GPT Image API가 아직 설정되지 않았습니다.");

  const images = [
    ...(req.priorityImages ?? []).map(({ base64, mimeType }) => ({ base64, mimeType })),
    ...(req.referenceImages ?? []),
    ...(req.labeledImages ?? []).map(({ base64, mimeType }) => ({ base64, mimeType })),
  ];
  const size = getGptImageSize(req.imageSize, req.aspectRatio);
  const headers = { Authorization: `Bearer ${apiKey}` };
  let response: Response;

  if (images.length > 0) {
    const form = new FormData();
    form.append("model", OPENAI_IMAGE_MODEL);
    form.append("prompt", buildOpenAIReferencePrompt(req));
    form.append("size", size);
    form.append("quality", "medium");
    form.append("output_format", "png");
    images.forEach((image, index) => {
      const bytes = new Uint8Array(Buffer.from(image.base64, "base64"));
      form.append(
        "image[]",
        new Blob([bytes], { type: image.mimeType }),
        `reference-${index + 1}.${extensionForMimeType(image.mimeType)}`
      );
    });
    response = await fetch(`${OPENAI_IMAGE_API}/edits`, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
  } else {
    response = await fetch(`${OPENAI_IMAGE_API}/generations`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: req.prompt,
        size,
        quality: "medium",
        output_format: "png",
        n: 1,
      }),
      signal: AbortSignal.timeout(180_000),
    });
  }

  const payload = await response.json().catch(() => ({})) as OpenAIImageResponse;
  if (!response.ok) throw openAIError(response.status, payload);
  const imagesBase64 = payload.data?.flatMap((item) => item.b64_json ? [item.b64_json] : []) ?? [];
  if (imagesBase64.length === 0) throw new Error("GPT Image가 이미지 데이터를 반환하지 않았습니다.");
  return {
    images: imagesBase64.map((base64) => ({ base64, mimeType: "image/png" })),
  };
}

export function generateImageContent(req: GeminiRequest): Promise<GeminiResult> {
  return req.model === OPENAI_IMAGE_MODEL ? generateWithOpenAI(req) : generateContent(req);
}
