import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { withTransientAIRetry } from "./ai-retry";
import { getImageModel, getPlatformAIClients } from "./platform-ai";

type Modality = "IMAGE" | "TEXT";

export interface GeminiRequest {
  prompt: string;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  imageSize?: "1K" | "2K";
  referenceImages?: { base64: string; mimeType: string }[];
  /** 번호 라벨이 붙은 이미지 (transform 모드용) */
  labeledImages?: { label: string; base64: string; mimeType: string }[];
  modalities?: Modality[];
}

export interface GeminiResult {
  text?: string;
  images: { base64: string; mimeType: string }[];
}

async function callGemini(
  genai: GoogleGenAI,
  contents: Content[],
  config: Record<string, unknown>
): Promise<GeminiResult> {
  const response = await genai.models.generateContentStream({
    model: getImageModel(),
    contents,
    config,
  });

  const result: GeminiResult = { images: [] };

  for await (const chunk of response) {
    if (!chunk.candidates?.[0]?.content?.parts) continue;
    for (const part of chunk.candidates[0].content.parts) {
      if (part.text) {
        result.text = (result.text || "") + part.text;
      }
      if (part.inlineData) {
        result.images.push({
          base64: part.inlineData.data!,
          mimeType: part.inlineData.mimeType!,
        });
      }
    }
  }

  return result;
}

// --- Character generation (streaming) ---

export async function generateContent(
  req: GeminiRequest
): Promise<GeminiResult> {
  const parts: Part[] = [];

  if (req.referenceImages) {
    for (const img of req.referenceImages) {
      parts.push({
        inlineData: {
          data: img.base64,
          mimeType: img.mimeType,
        },
      });
    }
  }

  if (req.labeledImages) {
    for (const img of req.labeledImages) {
      parts.push({ text: img.label });
      parts.push({
        inlineData: {
          data: img.base64,
          mimeType: img.mimeType,
        },
      });
    }
  }

  parts.push({ text: req.prompt });

  const contents: Content[] = [{ role: "user", parts }];

  const config: Record<string, unknown> = {
    responseModalities: req.modalities || ["IMAGE", "TEXT"],
    thinkingConfig: {
      thinkingLevel: "MINIMAL",
    },
    imageConfig: {
      aspectRatio: req.aspectRatio || "1:1",
      imageSize: req.imageSize || "1K",
    },
  };

  let lastError: unknown;
  for (const client of await getPlatformAIClients()) {
    try {
      return await withTransientAIRetry(
        () => callGemini(client, contents, config),
        {
          onRetry: (_error, attempt, delayMs) => {
            console.warn(
              `[Platform AI] Image generation was throttled; retry ${attempt} in ${delayMs}ms.`
            );
          },
        }
      );
    } catch (error) {
      lastError = error;
      console.warn("[Platform AI] Image generation failed; trying next client.");
    }
  }
  throw lastError;
}
