import { prisma } from "./prisma";
import { generateContent } from "./gemini";
import { fetchBlobAsBase64, uploadBase64ToBlob } from "./blob";
import {
  buildTextPrompt,
  buildSketchPrompt,
  buildEditPrompt,
  buildTransformPrompt,
  buildTextWithBgImagePrompt,
  buildSketchWithBgImagePrompt,
  buildEditWithBgImagePrompt,
} from "./prompts";

export type GenerationMode = "text" | "sketch" | "edit" | "transform";

export interface GenerateInput {
  presetId: string;
  userId: string;
  mode: GenerationMode;
  prompt: string;
  background?: string;
  backgroundImageId?: string;
  /** base64 이미지 (sketch/edit 모드) */
  inputImage?: { base64: string; mimeType: string };
  /** 여러 이미지 (transform 모드) */
  inputImages?: { base64: string; mimeType: string }[];
}

/**
 * Blob URL에서 이미지를 fetch하여 base64로 변환 (Gemini API용)
 */
async function loadPresetImages(
  images: { blobUrl: string; mimeType: string }[]
): Promise<{ base64: string; mimeType: string }[]> {
  return Promise.all(
    images.map(async (img) => {
      const data = await fetchBlobAsBase64(img.blobUrl);
      return { base64: data.base64, mimeType: img.mimeType };
    })
  );
}

export async function generate(input: GenerateInput) {
  // 1. 프리셋 조회
  const preset = await prisma.characterPreset.findUniqueOrThrow({
    where: { id: input.presetId },
    include: { images: { orderBy: { order: "asc" } } },
  });

  // 2. 참조 이미지 로드 (Blob → base64)
  const referenceImages = await loadPresetImages(preset.images);

  // 3. 배경 이미지 로드 (이미지 모드)
  let bgImageName: string | undefined;
  if (input.backgroundImageId) {
    const bgRecord = await prisma.savedBackground.findUnique({
      where: { id: input.backgroundImageId },
    });
    if (bgRecord) {
      const bgData = await fetchBlobAsBase64(bgRecord.blobUrl);
      referenceImages.push({
        base64: bgData.base64,
        mimeType: bgRecord.mimeType,
      });
      bgImageName = bgRecord.name;
    }
  }

  // sketch/edit 모드: 사용자 입력 이미지 추가 (배경 뒤에)
  if (input.inputImage && (input.mode === "sketch" || input.mode === "edit")) {
    referenceImages.push(input.inputImage);
  }

  // transform 모드: 사용자 이미지들 (번호 라벨 포함, 별도 처리)
  let labeledImages: { label: string; base64: string; mimeType: string }[] | undefined;
  if (input.inputImages && input.mode === "transform") {
    labeledImages = input.inputImages.map((img, i) => ({
      label: `=== 사용자 참조 이미지 ${i + 1}번 ===`,
      base64: img.base64,
      mimeType: img.mimeType,
    }));
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
    case "transform":
      prompt = buildTransformPrompt(ctx);
      break;
  }

  // 5. Gemini 호출
  const result = await generateContent({
    prompt,
    referenceImages,
    labeledImages,
    modalities: ["IMAGE", "TEXT"],
  });

  // 6. 결과를 Blob에 업로드 후 DB 저장
  const genRequest = await prisma.generationRequest.create({
    data: {
      presetId: input.presetId,
      userId: input.userId,
      mode: input.mode,
      prompt: input.prompt,
      background: input.background,
      backgroundImageId: input.backgroundImageId,
    },
  });

  const savedImages = [];
  for (const img of result.images) {
    const blobUrl = await uploadBase64ToBlob(img.base64, img.mimeType, "generated");
    const saved = await prisma.generatedImage.create({
      data: {
        requestId: genRequest.id,
        blobUrl,
        mimeType: img.mimeType,
      },
    });
    savedImages.push({ ...saved, blobUrl });
  }

  return {
    requestId: genRequest.id,
    text: result.text,
    images: savedImages.map((img) => ({
      id: img.id,
      mimeType: img.mimeType,
      dataUrl: img.blobUrl,
    })),
  };
}
