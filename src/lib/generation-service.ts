import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { generateContent } from "./gemini";
import {
  buildTextPrompt,
  buildSketchPrompt,
  buildEditPrompt,
} from "./prompts";

export type GenerationMode = "text" | "sketch" | "edit";

export interface GenerateInput {
  presetId: string;
  mode: GenerationMode;
  prompt: string;
  background?: string;
  /** base64 이미지 (sketch/edit 모드) */
  inputImage?: { base64: string; mimeType: string };
}

function loadPresetImages(
  images: { filePath: string | null; imageData: string | null; mimeType: string }[]
): { base64: string; mimeType: string }[] {
  return images.map((img) => {
    // DB에 base64로 저장된 업로드 이미지
    if (img.imageData) {
      return { base64: img.imageData, mimeType: img.mimeType };
    }
    // 파일 경로 기반 (import 스크립트로 등록된 이미지)
    if (img.filePath) {
      const absPath = path.join(process.cwd(), img.filePath);
      const buffer = fs.readFileSync(absPath);
      const ext = path.extname(img.filePath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      return {
        base64: buffer.toString("base64"),
        mimeType: mimeMap[ext] || "image/png",
      };
    }
    throw new Error("PresetImage에 imageData도 filePath도 없습니다.");
  });
}

export async function generate(input: GenerateInput) {
  // 1. 프리셋 조회
  const preset = await prisma.characterPreset.findUniqueOrThrow({
    where: { id: input.presetId },
    include: { images: { orderBy: { order: "asc" } } },
  });

  // 2. 참조 이미지 로드
  const referenceImages = loadPresetImages(preset.images);

  // sketch/edit 모드: 사용자 입력 이미지 추가
  if (input.inputImage && (input.mode === "sketch" || input.mode === "edit")) {
    referenceImages.push(input.inputImage);
  }

  // 3. 프롬프트 구성
  const ctx = {
    characterName: preset.name,
    background: input.background,
    userPrompt: input.prompt,
  };

  let prompt: string;
  switch (input.mode) {
    case "text":
      prompt = buildTextPrompt(ctx);
      break;
    case "sketch":
      prompt = buildSketchPrompt(ctx);
      break;
    case "edit":
      prompt = buildEditPrompt(ctx);
      break;
  }

  // 4. Gemini 호출
  const result = await generateContent({
    prompt,
    referenceImages,
    modalities: ["IMAGE", "TEXT"],
  });

  // 5. 결과 저장
  const genRequest = await prisma.generationRequest.create({
    data: {
      presetId: input.presetId,
      mode: input.mode,
      prompt: input.prompt,
      background: input.background,
    },
  });

  const savedImages = [];
  for (const img of result.images) {
    const saved = await prisma.generatedImage.create({
      data: {
        requestId: genRequest.id,
        imageData: img.base64,
        mimeType: img.mimeType,
      },
    });
    savedImages.push(saved);
  }

  return {
    requestId: genRequest.id,
    text: result.text,
    images: savedImages.map((img) => ({
      id: img.id,
      mimeType: img.mimeType,
      dataUrl: `data:${img.mimeType};base64,${img.imageData}`,
    })),
  };
}
