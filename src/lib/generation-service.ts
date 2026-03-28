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
  presetIds: string[];
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
  // 1. 프리셋 조회 (다중 캐릭터)
  const presets = await prisma.characterPreset.findMany({
    where: { id: { in: input.presetIds } },
    include: { images: { orderBy: { order: "asc" } } },
  });

  if (presets.length === 0) {
    throw new Error("선택된 캐릭터를 찾을 수 없습니다.");
  }

  // 2. 각 캐릭터의 대표이미지 로드
  const characterImages: { name: string; base64: string; mimeType: string }[] = [];
  for (const preset of presets) {
    const repImage =
      preset.images.find((img) => img.id === preset.representativeImageId) ??
      preset.images[0];
    if (repImage) {
      const data = await fetchBlobAsBase64(repImage.blobUrl);
      characterImages.push({
        name: preset.name,
        base64: data.base64,
        mimeType: repImage.mimeType,
      });
    }
  }

  // 3. 배경 이미지 로드 (이미지 모드)
  const referenceImages: { base64: string; mimeType: string }[] = [];

  // 단일 캐릭터: referenceImages로 (기존 방식 유지)
  // 다중 캐릭터: labeledImages로 (이름 라벨 필요)
  if (presets.length === 1 && characterImages.length > 0) {
    referenceImages.push({
      base64: characterImages[0].base64,
      mimeType: characterImages[0].mimeType,
    });
  }
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

  // transform 모드: 사용자 이미지들 (번호 라벨 포함)
  // 다중 캐릭터: 라벨 포함 이미지
  const characterLabeledImages = presets.length > 1
    ? characterImages.map((ci) => ({
        label: `=== Character: ${ci.name} ===`,
        base64: ci.base64,
        mimeType: ci.mimeType,
      }))
    : [];
  let labeledImages: { label: string; base64: string; mimeType: string }[] =
    [...characterLabeledImages];
  if (input.inputImages && input.mode === "transform") {
    for (let i = 0; i < input.inputImages.length; i++) {
      labeledImages.push({
        label: `=== 사용자 참조 이미지 ${i + 1}번 ===`,
        base64: input.inputImages[i].base64,
        mimeType: input.inputImages[i].mimeType,
      });
    }
  }

  // 4. 프롬프트 구성
  const characterNames = presets.map((p) => p.name);
  const ctx = {
    characterName: characterNames.join(", "),
    characters: characterNames.map((name) => ({ name })),
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

  // 다중 캐릭터 참조 안내 프롬프트 추가
  if (presets.length > 1) {
    const charRef = `[캐릭터 참조] 첨부된 이미지는 ${characterNames.map((n) => `"${n}"`).join(", ")} 캐릭터의 레퍼런스입니다. 각 이미지 앞에 캐릭터 이름 라벨이 있습니다. 프롬프트에서 언급된 캐릭터를 해당 레퍼런스에 맞게 그려주세요.`;
    prompt = charRef + "\n\n" + prompt;
  }

  // 5. Gemini 호출
  const result = await generateContent({
    prompt,
    referenceImages,
    labeledImages: labeledImages.length > 0 ? labeledImages : undefined,
    modalities: ["IMAGE", "TEXT"],
  });

  // 6. 결과를 Blob에 업로드 후 DB 저장
  const genRequest = await prisma.generationRequest.create({
    data: {
      presetId: input.presetIds[0],
      presetIds: input.presetIds,
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
