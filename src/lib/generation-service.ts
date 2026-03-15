import { prisma } from "./prisma";
import { generateContent } from "./gemini";
import {
  buildTextPrompt,
  buildSketchPrompt,
  buildEditPrompt,
  buildTextWithBgImagePrompt,
  buildSketchWithBgImagePrompt,
  buildEditWithBgImagePrompt,
} from "./prompts";

export type GenerationMode = "text" | "sketch" | "edit";

export interface GenerateInput {
  presetId: string;
  mode: GenerationMode;
  prompt: string;
  background?: string;
  backgroundImageId?: string;
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
    throw new Error("PresetImage에 imageData가 없습니다. 웹 UI에서 이미지를 업로드해주세요.");
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

  // 3. 배경 이미지 로드 (이미지 모드)
  let bgImageName: string | undefined;
  if (input.backgroundImageId) {
    const bgRecord = await prisma.savedBackground.findUnique({
      where: { id: input.backgroundImageId },
    });
    if (bgRecord) {
      referenceImages.push({
        base64: bgRecord.imageData,
        mimeType: bgRecord.mimeType,
      });
      bgImageName = bgRecord.name;
    }
  }

  // sketch/edit 모드: 사용자 입력 이미지 추가 (배경 뒤에)
  if (input.inputImage && (input.mode === "sketch" || input.mode === "edit")) {
    referenceImages.push(input.inputImage);
  }

  // 4. 프롬프트 구성
  const ctx = {
    characterName: preset.name,
    background: input.background,
    userPrompt: input.prompt,
  };

  let prompt: string;
  const useBgImage = !!bgImageName;

  switch (input.mode) {
    case "text":
      prompt = useBgImage ? buildTextWithBgImagePrompt(ctx) : buildTextPrompt(ctx);
      break;
    case "sketch":
      prompt = useBgImage ? buildSketchWithBgImagePrompt(ctx) : buildSketchPrompt(ctx);
      break;
    case "edit":
      prompt = useBgImage ? buildEditWithBgImagePrompt(ctx) : buildEditPrompt(ctx);
      break;
  }

  // 4. Gemini 호출
  const result = await generateContent({
    prompt,
    referenceImages,
    modalities: ["IMAGE", "TEXT"],
  });

  // 6. 결과 저장
  const genRequest = await prisma.generationRequest.create({
    data: {
      presetId: input.presetId,
      mode: input.mode,
      prompt: input.prompt,
      background: input.background,
      backgroundImageId: input.backgroundImageId,
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
