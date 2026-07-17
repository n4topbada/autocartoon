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
import { updateJobProgress } from "./generation-jobs";

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

  // 첨부 이미지의 역할을 "위치"가 아니라 "라벨"로 구분하도록 안내한다.
  // 다중 캐릭터에서는 캐릭터 시트가 배경/편집 대상 뒤에 붙어, 모드 프롬프트의
  // "첫 번째=시트, 마지막=편집 대상" 위치 설명과 어긋나므로 라벨 기준으로 재정의한다.
  if (labeledImages.length > 0) {
    const guideLines: string[] = [];
    if (presets.length > 1) {
      guideLines.push(
        `"=== Character: 이름 / view: ... ===" 라벨이 붙은 이미지는 각 캐릭터(${characterNames
          .map((n) => `"${n}"`)
          .join(", ")})의 레퍼런스입니다. 프롬프트에서 언급된 캐릭터를 해당 라벨의 레퍼런스에 맞춰 그려주세요.`
      );
    }
    if (input.referenceAssetUrls?.length) {
      guideLines.push(
        `"=== 장면 참고 자산 ... ===" 라벨 이미지는 구도·분위기 참고용이며, 그대로 편집하거나 복제하는 대상이 아닙니다.`
      );
    }
    const unlabeledRoles: string[] = [];
    if (useBgImage) unlabeledRoles.push("배경 이미지");
    if (inputImage && (input.mode === "sketch" || input.mode === "edit")) {
      unlabeledRoles.push(input.mode === "sketch" ? "스케치 원본" : "편집할 기존 일러스트");
    }
    if (unlabeledRoles.length > 0) {
      guideLines.push(`라벨이 없는 첨부 이미지는 ${unlabeledRoles.join(" 및 ")}입니다.`);
    }
    if (guideLines.length > 0) {
      prompt = `[첨부 이미지 안내] ${guideLines.join(" ")}\n\n` + prompt;
    }
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
  // 생성이 끝나고 저장 단계로 진입했음을 진행률에 반영한다(35% → 70%).
  if (input.jobId) {
    await updateJobProgress(input.jobId, "storing", 70).catch(() => undefined);
  }
  const uploadedImages: Array<{
    blobUrl: string;
    thumbnailUrl: string;
    mimeType: string;
    sizeBytes: number;
  }> = [];
  try {
    for (const img of generatedImages) {
      const { blobUrl, thumbnailUrl } = await uploadBase64ImageWithThumbnail(
        img.base64,
        img.mimeType,
        "generated"
      );
      uploadedImages.push({
        blobUrl,
        thumbnailUrl,
        mimeType: img.mimeType,
        sizeBytes: Buffer.byteLength(img.base64, "base64"),
      });
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
        select: {
          id: true,
          projectId: true,
          cutId: true,
          creditUnits: true,
          creditSource: true,
        },
      })
    : null;
  if (input.jobId && !job) throw new Error("생성 작업을 찾을 수 없습니다.");

  const saveWithCompensation = async () =>
    prisma.$transaction(async (tx) => {
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
            sizeBytes: image.sizeBytes,
          })),
        },
      },
      include: { generatedImages: { orderBy: { createdAt: "asc" } } },
    });

    if (job) {
      // 종료된 작업을 succeeded로 덮어써 환불+이미지 동시 지급이 되는 것을 막는다.
      const marked = await tx.generationJob.updateMany({
        where: { id: job.id, status: { in: ["queued", "running"] } },
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
      if (marked.count === 0) {
        throw new Error("작업이 이미 종료되어 결과를 저장하지 않습니다.");
      }

      await tx.generationArtifact.createMany({
        data: uploadedImages.map((image) => ({
          jobId: job.id,
          kind: "image",
          blobUrl: image.blobUrl,
          thumbnailUrl: image.thumbnailUrl,
          mimeType: image.mimeType,
          sizeBytes: image.sizeBytes,
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
            sizeBytes: image.sizeBytes,
          })),
        });
      }

      // 컷이 도중에 삭제됐을 수 있으므로 updateMany로 0행을 허용한다(P2025 방지).
      if (job.cutId) {
        await tx.projectCut.updateMany({
          where: { id: job.cutId },
          data: {
            imageUrl: uploadedImages[0].blobUrl,
            thumbnailUrl: uploadedImages[0].thumbnailUrl,
          },
        });
      }

      // 요청한 장수보다 적게 생성됐으면(다중 count 배경) 미생성분을 부분 환불한다(멱등).
      const deliveredCount = uploadedImages.length;
      if (
        job.creditUnits &&
        job.creditSource &&
        requestedCount > deliveredCount &&
        job.creditUnits % requestedCount === 0
      ) {
        const refundUnits =
          (job.creditUnits / requestedCount) * (requestedCount - deliveredCount);
        const partialKey = `job:${job.id}:partial-refund`;
        const already = await tx.creditLedger.findUnique({
          where: { referenceKey: partialKey },
        });
        if (refundUnits > 0 && !already) {
          if (job.creditSource === "tier") {
            await tx.user.updateMany({
              where: { id: input.userId, tierUsedThisMonth: { gte: refundUnits } },
              data: { tierUsedThisMonth: { decrement: refundUnits } },
            });
          } else {
            await tx.user.update({
              where: { id: input.userId },
              data: { credits: { increment: refundUnits } },
            });
          }
          const wallet = await tx.user.findUniqueOrThrow({
            where: { id: input.userId },
            select: { credits: true },
          });
          await tx.creditLedger.create({
            data: {
              userId: input.userId,
              jobId: job.id,
              referenceKey: partialKey,
              action: "refund",
              source: job.creditSource,
              units: refundUnits,
              balanceAfter: wallet.credits,
              note: `${requestedCount - deliveredCount}장 미생성 부분 환불`,
            },
          });
        }
      }
    }

    return request;
    });

  let saved: Awaited<ReturnType<typeof saveWithCompensation>>;
  try {
    saved = await saveWithCompensation();
  } catch (error) {
    // 저장 트랜잭션 실패 시 이미 업로드한 blob/썸네일을 보상 삭제한다(고아 방지).
    await Promise.all(
      uploadedImages.flatMap((image) => [
        deleteBlob(image.blobUrl),
        deleteBlob(image.thumbnailUrl),
      ])
    );
    throw error;
  }

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
