import { prisma } from "./prisma";
import { generateContent } from "./gemini";
import {
  deleteBlob,
  fetchBlobAsBase64,
  uploadBase64ImageWithThumbnail,
} from "./blob";
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

const VIEW_PRIORITY: Record<string, number> = {
  front: 0,
  left: 1,
  right: 2,
  back: 3,
  reference: 4,
};

interface CharacterReferenceCandidate {
  id: string;
  view: string;
  order: number;
}

export function selectCharacterReferenceImages<T extends CharacterReferenceCandidate>(
  images: T[],
  representativeImageId: string | null,
  multipleCharacters: boolean
): T[] {
  const representative =
    images.find((image) => image.id === representativeImageId) ?? images[0];
  if (multipleCharacters) return representative ? [representative] : [];

  return [...images]
    .sort((a, b) => {
      const viewDiff = (VIEW_PRIORITY[a.view] ?? 99) - (VIEW_PRIORITY[b.view] ?? 99);
      return viewDiff || a.order - b.order;
    })
    .slice(0, 4);
}

export interface GenerateInput {
  jobId?: string;
  presetIds: string[];
  userId: string;
  isAdmin?: boolean;
  mode: GenerationMode;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  imageSize?: "1K" | "2K";
  count?: number;
  prompt: string;
  background?: string;
  backgroundImageId?: string;
  /** base64 이미지 (sketch/edit 모드) */
  inputImage?: { base64: string; mimeType: string };
  inputImageUrl?: { url: string; mimeType: string };
  /** 여러 이미지 (transform 모드) */
  inputImages?: { base64: string; mimeType: string }[];
  inputImageUrls?: { url: string; mimeType: string }[];
  /** 프로젝트에서 선택한 구도·분위기 참고 자산 */
  referenceAssetUrls?: { url: string; mimeType: string; label: string }[];
}

/**
 * Blob URL에서 이미지를 fetch하여 base64로 변환 (Gemini API용)
 */
async function loadStoredImages(
  images: { url: string; mimeType: string }[]
): Promise<{ base64: string; mimeType: string }[]> {
  return Promise.all(
    images.map(async (img) => {
      const data = await fetchBlobAsBase64(img.url);
      return { base64: data.base64, mimeType: img.mimeType };
    })
  );
}

export async function generate(input: GenerateInput) {
  const requestedPresetIds = [...new Set(input.presetIds)];
  if (
    requestedPresetIds.length !== input.presetIds.length ||
    requestedPresetIds.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new Error("선택된 캐릭터를 찾을 수 없습니다.");
  }

  // 1. 프리셋 조회 (다중 캐릭터)
  const entitledPresets = await prisma.characterPreset.findMany({
    where: input.isAdmin
      ? { id: { in: requestedPresetIds } }
      : {
          id: { in: requestedPresetIds },
          OR: [
            { userId: input.userId },
            { purchasedBy: { some: { userId: input.userId } } },
          ],
        },
    include: { images: { orderBy: { order: "asc" } } },
  });

  if (entitledPresets.length !== requestedPresetIds.length) {
    throw new Error("선택된 캐릭터를 찾을 수 없습니다.");
  }

  const presetsById = new Map(entitledPresets.map((preset) => [preset.id, preset]));
  const presets = requestedPresetIds.map((id) => presetsById.get(id)!);

  // 2. 한 명일 때는 4면 참조를 모두 사용하고, 여러 명일 때는 인물별
  // 대표 이미지 한 장씩 사용해 입력 크기와 캐릭터 간 혼선을 제한한다.
  const characterReferences = await Promise.all(
    presets.map(async (preset) => {
      const selectedImages = selectCharacterReferenceImages(
        preset.images,
        preset.representativeImageId,
        presets.length > 1
      );
      const images = await Promise.all(
        selectedImages.map(async (image) => {
          const data = await fetchBlobAsBase64(image.blobUrl);
          return {
            view: image.view,
            base64: data.base64,
            mimeType: image.mimeType,
          };
        })
      );
      return { name: preset.name, images };
    })
  );

  // 3. 배경 이미지 로드 (이미지 모드)
  const referenceImages: { base64: string; mimeType: string }[] = [];

  // 단일 캐릭터: referenceImages로 (기존 방식 유지)
  // 다중 캐릭터: labeledImages로 (이름 라벨 필요)
  if (presets.length === 1) {
    referenceImages.push(
      ...characterReferences[0].images.map((image) => ({
        base64: image.base64,
        mimeType: image.mimeType,
      }))
    );
  }
  let bgImageName: string | undefined;
  if (input.backgroundImageId) {
    const bgRecord = await prisma.savedBackground.findFirst({
      where: input.isAdmin
        ? { id: input.backgroundImageId }
        : { id: input.backgroundImageId, userId: input.userId },
    });
    if (!bgRecord) {
      throw new Error("선택된 배경을 찾을 수 없습니다.");
    }

    const bgData = await fetchBlobAsBase64(bgRecord.blobUrl);
    referenceImages.push({
      base64: bgData.base64,
      mimeType: bgRecord.mimeType,
    });
    bgImageName = bgRecord.name;
  }

  const storedInputImage = input.inputImageUrl
    ? (await loadStoredImages([input.inputImageUrl]))[0]
    : undefined;
  const inputImage = input.inputImage ?? storedInputImage;

  // sketch/edit 모드: 사용자 입력 이미지 추가 (배경 뒤에)
  if (inputImage && (input.mode === "sketch" || input.mode === "edit")) {
    referenceImages.push(inputImage);
  }

  // transform 모드: 사용자 이미지들 (번호 라벨 포함)
  // 다중 캐릭터: 라벨 포함 이미지
  const characterLabeledImages = presets.length > 1
    ? characterReferences.flatMap((character) => character.images.map((image) => ({
        label: `=== Character: ${character.name} / view: ${image.view} ===`,
        base64: image.base64,
        mimeType: image.mimeType,
      })))
    : [];
  const labeledImages: { label: string; base64: string; mimeType: string }[] =
    [...characterLabeledImages];
  if (input.referenceAssetUrls?.length) {
    const loadedReferenceAssets = await Promise.all(
      input.referenceAssetUrls.map(async (asset) => {
        const data = await fetchBlobAsBase64(asset.url);
        return { label: asset.label, base64: data.base64, mimeType: asset.mimeType };
      })
    );
    labeledImages.push(...loadedReferenceAssets);
  }
  const storedInputImages = input.inputImageUrls
    ? await loadStoredImages(input.inputImageUrls)
    : [];
  const inputImages = input.inputImages ?? storedInputImages;
  if (inputImages.length > 0 && input.mode === "transform") {
    for (let i = 0; i < inputImages.length; i++) {
      labeledImages.push({
        label: `=== 사용자 참조 이미지 ${i + 1}번 ===`,
        base64: inputImages[i].base64,
        mimeType: inputImages[i].mimeType,
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

  if (presets.length === 0) {
    prompt = input.prompt;
  } else {
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
  }

  // 다중 캐릭터 참조 안내 프롬프트 추가
  if (presets.length > 1) {
    const charRef = `[캐릭터 참조] 첨부된 이미지는 ${characterNames.map((n) => `"${n}"`).join(", ")} 캐릭터의 레퍼런스입니다. 각 이미지 앞에 캐릭터 이름 라벨이 있습니다. 프롬프트에서 언급된 캐릭터를 해당 레퍼런스에 맞게 그려주세요.`;
    prompt = charRef + "\n\n" + prompt;
  }

  // 5. Gemini 호출
  const requestedCount = Math.max(1, Math.min(5, input.count || 1));
  const generationResults = await Promise.allSettled(
    Array.from({ length: requestedCount }, () => generateContent({
      prompt,
      aspectRatio: input.aspectRatio,
      imageSize: input.imageSize,
      referenceImages,
      labeledImages: labeledImages.length > 0 ? labeledImages : undefined,
      modalities: ["IMAGE", "TEXT"],
    }))
  );
  const fulfilledResults = generationResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  const generatedImages = fulfilledResults.flatMap((result) => result.images).slice(0, requestedCount);
  const resultText = fulfilledResults.map((result) => result.text).filter(Boolean).join("\n") || undefined;

  if (generatedImages.length === 0) {
    const failure = generationResults.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    throw new Error(resultText || "AI가 이미지를 반환하지 않았습니다.");
  }

  // 6. Blob 업로드를 마친 뒤 관련 DB 레코드는 한 트랜잭션으로 저장한다.
  const uploadedImages: Array<{
    blobUrl: string;
    thumbnailUrl: string;
    mimeType: string;
  }> = [];
  try {
    for (const img of generatedImages) {
      const { blobUrl, thumbnailUrl } = await uploadBase64ImageWithThumbnail(
        img.base64,
        img.mimeType,
        "generated"
      );
      uploadedImages.push({ blobUrl, thumbnailUrl, mimeType: img.mimeType });
    }
  } catch (error) {
    await Promise.all(
      uploadedImages.flatMap((image) => [
        deleteBlob(image.blobUrl),
        deleteBlob(image.thumbnailUrl),
      ])
    );
    throw error;
  }

  const job = input.jobId
    ? await prisma.generationJob.findFirst({
        where: { id: input.jobId, userId: input.userId },
        select: { id: true, projectId: true, cutId: true },
      })
    : null;
  if (input.jobId && !job) throw new Error("생성 작업을 찾을 수 없습니다.");

  const saved = await prisma.$transaction(async (tx) => {
    const request = await tx.generationRequest.create({
      data: {
        presetId: requestedPresetIds[0] ?? null,
        presetIds: requestedPresetIds,
        userId: input.userId,
        mode: input.mode,
        prompt: input.prompt,
        background: input.background,
        backgroundImageId: input.backgroundImageId,
        jobId: job?.id,
        generatedImages: {
          create: uploadedImages.map((image) => ({
            blobUrl: image.blobUrl,
            thumbnailUrl: image.thumbnailUrl,
            mimeType: image.mimeType,
          })),
        },
      },
      include: { generatedImages: { orderBy: { createdAt: "asc" } } },
    });

    if (job) {
      await tx.generationArtifact.createMany({
        data: uploadedImages.map((image) => ({
          jobId: job.id,
          kind: "image",
          blobUrl: image.blobUrl,
          thumbnailUrl: image.thumbnailUrl,
          mimeType: image.mimeType,
        })),
      });

      if (job.projectId) {
        await tx.projectAsset.createMany({
          data: uploadedImages.map((image, index) => ({
            projectId: job.projectId!,
            jobId: job.id,
            kind: "image",
            name: `AI 이미지 ${index + 1}`,
            blobUrl: image.blobUrl,
            thumbnailUrl: image.thumbnailUrl,
            mimeType: image.mimeType,
          })),
        });
      }

      if (job.cutId) {
        await tx.projectCut.update({
          where: { id: job.cutId },
          data: {
            imageUrl: uploadedImages[0].blobUrl,
            thumbnailUrl: uploadedImages[0].thumbnailUrl,
          },
        });
      }

      await tx.generationJob.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          stage: "completed",
          progress: 100,
          error: null,
          output: {
            requestId: request.id,
            text: resultText ?? null,
            imageCount: uploadedImages.length,
            imageIds: request.generatedImages.map((image) => image.id),
          },
          completedAt: new Date(),
        },
      });
    }

    return request;
  });

  return {
    requestId: saved.id,
    text: resultText,
    images: saved.generatedImages.map((img) => ({
      id: img.id,
      mimeType: img.mimeType,
      dataUrl: img.blobUrl,
      thumbnailUrl: img.thumbnailUrl ?? img.blobUrl,
    })),
  };
}
