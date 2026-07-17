import { NextRequest, NextResponse } from "next/server";
import { type GenerationMode } from "@/lib/generation-service";
import { requireAuth, AuthError } from "@/lib/auth";
import { reserveJobCredit } from "@/lib/credit-service";
import { prisma } from "@/lib/prisma";
import { uploadBase64ToBlob } from "@/lib/blob";
import {
  failGenerationJob,
  jobToResponse,
  type StoredImageJobInput,
} from "@/lib/generation-jobs";
import {
  getImageModel,
  getPlatformAIProvider,
} from "@/lib/platform-ai";
import { dispatchImageJob } from "@/lib/job-engine";
import { logError, logEvent } from "@/lib/observability";
import { Prisma } from "@prisma/client";

const GENERATION_MODES = new Set<GenerationMode>([
  "text",
  "sketch",
  "edit",
  "transform",
]);
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_PRESET_IDS = 4;
const MAX_ID_LENGTH = 128;
const MAX_PROMPT_LENGTH = 10_000;
const MAX_BACKGROUND_LENGTH = 2_000;
const MAX_INPUT_IMAGES = 4;
const MAX_REFERENCE_ASSETS = 3;
const MAX_INPUT_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_INPUT_IMAGE_BYTES / 3) * 4;
const ALLOWED_ASPECT_RATIOS = new Set(["1:1", "4:5", "9:16", "16:9"]);
const ALLOWED_IMAGE_SIZES = new Set(["1K", "2K"]);
const JOB_KINDS = new Set(["image", "gesture", "character", "background"] as const);

type ImageJobKind = "image" | "gesture" | "character" | "background";

type InputImage = { base64: string; mimeType: string };

interface ValidatedGenerationRequest {
  presetIds: string[];
  mode: GenerationMode;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  imageSize?: "1K" | "2K";
  count: number;
  prompt: string;
  background?: string;
  backgroundImageId?: string;
  projectId?: string;
  cutId?: string;
  idempotencyKey?: string;
  jobKind: ImageJobKind;
  inputImage?: InputImage;
  inputImages?: InputImage[];
  sourceArtifactId?: string;
  referenceAssetIds?: string[];
  editRegionMode?: "all" | "auto" | "manual";
  editMask?: InputImage;
  preserveOutsideMask?: boolean;
}

class RequestValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RequestValidationError(`${field} 값이 올바르지 않습니다.`);
  }

  const id = value.trim();
  if (id.length > MAX_ID_LENGTH) {
    throw new RequestValidationError(`${field} 값이 너무 깁니다.`);
  }
  return id;
}

function parseOptionalText(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new RequestValidationError(`${field} 값이 올바르지 않습니다.`);
  }

  const text = value.trim();
  if (!text) return undefined;
  if (text.length > maxLength) {
    throw new RequestValidationError(`${field} 값이 너무 깁니다.`);
  }
  return text;
}

function parseInputImage(value: unknown, field: string): InputImage {
  if (!isRecord(value)) {
    throw new RequestValidationError(`${field} 이미지가 올바르지 않습니다.`);
  }

  const { base64, mimeType } = value;
  if (typeof base64 !== "string" || !base64) {
    throw new RequestValidationError(`${field} 이미지 데이터가 필요합니다.`);
  }
  if (typeof mimeType !== "string" || !ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new RequestValidationError(`${field} 이미지 형식이 지원되지 않습니다.`);
  }
  if (
    base64.length > MAX_BASE64_LENGTH ||
    base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
    Buffer.byteLength(base64, "base64") > MAX_INPUT_IMAGE_BYTES
  ) {
    throw new RequestValidationError(
      `${field} 이미지는 4MB 이하의 올바른 base64 데이터여야 합니다.`
    );
  }

  return { base64, mimeType };
}

function parseGenerationRequest(value: unknown): ValidatedGenerationRequest {
  if (!isRecord(value)) {
    throw new RequestValidationError("요청 본문이 올바르지 않습니다.");
  }

  const jobKind: ImageJobKind =
    value.jobKind === undefined
      ? "image"
      : typeof value.jobKind === "string" && JOB_KINDS.has(value.jobKind as ImageJobKind)
        ? (value.jobKind as ImageJobKind)
        : (() => {
            throw new RequestValidationError(
              "jobKind는 image, gesture, character, background 중 하나여야 합니다."
            );
          })();
  const allowsImageEditWithoutPreset = jobKind === "image" && value.mode === "edit" && (
    isRecord(value.inputImage) || (Array.isArray(value.inputImages) && value.inputImages.length > 0)
  );
  const allowsOriginalGeneration = jobKind === "character" || jobKind === "background" || jobKind === "gesture" || allowsImageEditWithoutPreset;

  let presetIds: string[];
  if (value.presetIds !== undefined) {
    if (!Array.isArray(value.presetIds)) {
      throw new RequestValidationError("presetIds 배열이 필요합니다.");
    }
    if (
      (!allowsOriginalGeneration && value.presetIds.length === 0) ||
      value.presetIds.length > MAX_PRESET_IDS
    ) {
      throw new RequestValidationError("캐릭터는 1개에서 4개까지 선택할 수 있습니다.");
    }
    presetIds = value.presetIds.map((id, index) =>
      parseId(id, `presetIds[${index}]`)
    );
  } else if (value.presetId !== undefined) {
    presetIds = [parseId(value.presetId, "presetId")];
  } else if (allowsOriginalGeneration) {
    presetIds = [];
  } else {
    throw new RequestValidationError("presetIds, mode, prompt 는 필수입니다.");
  }

  if (new Set(presetIds).size !== presetIds.length) {
    throw new RequestValidationError("같은 캐릭터를 중복 선택할 수 없습니다.");
  }

  if (
    typeof value.mode !== "string" ||
    !GENERATION_MODES.has(value.mode as GenerationMode)
  ) {
    throw new RequestValidationError(
      "mode는 text, sketch, edit, transform 중 하나여야 합니다."
    );
  }

  if (typeof value.prompt !== "string" || !value.prompt.trim()) {
    throw new RequestValidationError("presetIds, mode, prompt 는 필수입니다.");
  }
  const prompt = value.prompt.trim();
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new RequestValidationError("prompt가 너무 깁니다.");
  }

  const background = parseOptionalText(
    value.background,
    "background",
    MAX_BACKGROUND_LENGTH
  );
  const backgroundImageId =
    value.backgroundImageId === undefined
      ? undefined
      : parseId(value.backgroundImageId, "backgroundImageId");
  const projectId =
    value.projectId === undefined ? undefined : parseId(value.projectId, "projectId");
  const cutId = value.cutId === undefined ? undefined : parseId(value.cutId, "cutId");
  if (cutId && !projectId) {
    throw new RequestValidationError("cutId를 사용할 때 projectId가 필요합니다.");
  }
  let referenceAssetIds: string[] | undefined;
  if (value.referenceAssetIds !== undefined) {
    if (!Array.isArray(value.referenceAssetIds) || value.referenceAssetIds.length > MAX_REFERENCE_ASSETS) {
      throw new RequestValidationError("참고 자산은 최대 3개까지 사용할 수 있습니다.");
    }
    referenceAssetIds = value.referenceAssetIds.map((id, index) =>
      parseId(id, `referenceAssetIds[${index}]`)
    );
    if (new Set(referenceAssetIds).size !== referenceAssetIds.length) {
      throw new RequestValidationError("같은 참고 자산을 중복 선택할 수 없습니다.");
    }
    if (referenceAssetIds.length > 0 && !projectId) {
      throw new RequestValidationError("프로젝트 참고 자산을 사용할 때 projectId가 필요합니다.");
    }
  }
  const idempotencyKey = parseOptionalText(
    value.idempotencyKey,
    "idempotencyKey",
    200
  );
  const aspectRatio = typeof value.aspectRatio === "string" && ALLOWED_ASPECT_RATIOS.has(value.aspectRatio)
    ? value.aspectRatio as "1:1" | "4:5" | "9:16" | "16:9"
    : undefined;
  const imageSize = typeof value.imageSize === "string" && ALLOWED_IMAGE_SIZES.has(value.imageSize)
    ? value.imageSize as "1K" | "2K"
    : undefined;
  const requestedCount = Number(value.count ?? 1);
  const count = jobKind === "background" && Number.isInteger(requestedCount)
    ? Math.max(1, Math.min(5, requestedCount))
    : 1;
  const inputImage =
    value.inputImage === undefined
      ? undefined
      : parseInputImage(value.inputImage, "inputImage");
  const sourceArtifactId = value.sourceArtifactId === undefined
    ? undefined
    : parseId(value.sourceArtifactId, "sourceArtifactId");
  if (sourceArtifactId && jobKind !== "background") {
    throw new RequestValidationError("sourceArtifactId는 배경 생성 작업에서만 사용할 수 있습니다.");
  }
  if (sourceArtifactId && inputImage) {
    throw new RequestValidationError("inputImage와 sourceArtifactId는 함께 사용할 수 없습니다.");
  }

  let inputImages: InputImage[] | undefined;
  if (value.inputImages !== undefined) {
    if (!Array.isArray(value.inputImages) || value.inputImages.length > MAX_INPUT_IMAGES) {
      throw new RequestValidationError("inputImages는 최대 4개까지 사용할 수 있습니다.");
    }
    inputImages = value.inputImages.map((image, index) =>
      parseInputImage(image, `inputImages[${index}]`)
    );
  }

  if (
    jobKind === "gesture" &&
    presetIds.length === 0 &&
    !inputImage &&
    !inputImages?.length &&
    !referenceAssetIds?.length
  ) {
    throw new RequestValidationError("제스처 생성에는 캐릭터 프리셋이나 참고 이미지가 필요합니다.");
  }

  const requestedEditRegionMode = value.editRegionMode;
  const editRegionMode = requestedEditRegionMode === undefined || requestedEditRegionMode === "all"
    ? "all"
    : requestedEditRegionMode === "auto"
      ? "auto"
      : requestedEditRegionMode === "manual"
        ? "manual"
        : (() => {
            throw new RequestValidationError("editRegionMode는 all, auto, manual 중 하나여야 합니다.");
          })();
  const editMask = value.editMask === undefined ? undefined : parseInputImage(value.editMask, "editMask");
  if (editMask && editMask.mimeType !== "image/png") {
    throw new RequestValidationError("편집 마스크는 PNG 형식이어야 합니다.");
  }
  if ((editRegionMode !== "all" || editMask) && value.mode !== "edit") {
    throw new RequestValidationError("영역 편집은 edit 모드에서만 사용할 수 있습니다.");
  }
  if (editRegionMode === "manual" && !editMask) {
    throw new RequestValidationError("수동 영역 편집에는 editMask가 필요합니다.");
  }
  if (editRegionMode === "auto" && editMask) {
    throw new RequestValidationError("자동 영역 편집에는 수동 마스크를 함께 보낼 수 없습니다.");
  }
  if (editRegionMode !== "all" && !inputImage) {
    throw new RequestValidationError("영역 편집에는 원본 이미지가 필요합니다.");
  }

  return {
    presetIds,
    mode: value.mode as GenerationMode,
    aspectRatio,
    imageSize,
    count,
    prompt,
    background,
    backgroundImageId,
    projectId,
    cutId,
    idempotencyKey,
    jobKind,
    inputImage,
    inputImages,
    sourceArtifactId,
    referenceAssetIds,
    ...(editRegionMode !== "all" ? { editRegionMode } : {}),
    ...(editMask ? { editMask } : {}),
    ...(editRegionMode !== "all" ? { preserveOutsideMask: value.preserveOutsideMask !== false } : {}),
  };
}

async function validateResourceAccess(
  userId: string,
  isAdmin: boolean,
  input: ValidatedGenerationRequest
): Promise<NextResponse | null> {
  const accessiblePresetCount = await prisma.characterPreset.count({
    where: isAdmin
      ? { id: { in: input.presetIds } }
      : {
          id: { in: input.presetIds },
          OR: [
            { userId },
            { purchasedBy: { some: { userId } } },
          ],
        },
  });

  if (accessiblePresetCount !== input.presetIds.length) {
    return NextResponse.json(
      { error: "선택한 캐릭터를 찾을 수 없거나 사용할 권한이 없습니다." },
      { status: 404 }
    );
  }

  if (input.backgroundImageId) {
    const background = await prisma.savedBackground.findFirst({
      where: isAdmin
        ? { id: input.backgroundImageId }
        : { id: input.backgroundImageId, userId },
      select: { id: true },
    });
    if (!background) {
      return NextResponse.json(
        { error: "선택한 배경을 찾을 수 없거나 사용할 권한이 없습니다." },
        { status: 404 }
      );
    }
  }

  if (input.projectId) {
    const project = await prisma.creativeProject.findFirst({
      where: { id: input.projectId, userId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
  }

  if (input.cutId) {
    const cut = await prisma.projectCut.findFirst({
      where: {
        id: input.cutId,
        projectId: input.projectId,
        project: { userId },
      },
      select: { id: true },
    });
    if (!cut) {
      return NextResponse.json({ error: "프로젝트 컷을 찾을 수 없습니다." }, { status: 404 });
    }
  }

  if (input.referenceAssetIds?.length) {
    const assetCount = await prisma.projectAsset.count({
      where: {
        id: { in: input.referenceAssetIds },
        projectId: input.projectId,
        project: { userId },
        kind: "image",
      },
    });
    if (assetCount !== input.referenceAssetIds.length) {
      return NextResponse.json({ error: "선택한 참고 자산을 사용할 수 없습니다." }, { status: 404 });
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const currentUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { role: true },
    });
    if (!currentUser) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }
    const isAdmin = currentUser.role === "admin";

    let requestBody: unknown;
    try {
      requestBody = await req.json();
    } catch {
      return NextResponse.json(
        { error: "올바른 JSON 요청 본문이 필요합니다." },
        { status: 400 }
      );
    }

    let input: ValidatedGenerationRequest;
    try {
      input = parseGenerationRequest(requestBody);
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }

    const accessError = await validateResourceAccess(
      session.userId,
      isAdmin,
      input
    );
    if (accessError) return accessError;

    const idempotencyKey =
      req.headers.get("idempotency-key")?.trim().slice(0, 200) ||
      input.idempotencyKey ||
      crypto.randomUUID();
    const existing = await prisma.generationJob.findUnique({
      where: {
        userId_idempotencyKey: { userId: session.userId, idempotencyKey },
      },
      include: { artifacts: { orderBy: { createdAt: "asc" } } },
    });
    if (existing) {
      return NextResponse.json({ job: jobToResponse(existing), deduplicated: true }, { status: 202 });
    }

    const inputUploadId = crypto.randomUUID();
    const storeInput = async (image: InputImage, index: number) => ({
      url: await uploadBase64ToBlob(image.base64, image.mimeType, `job-inputs/${inputUploadId}/${index}`, session.userId),
      mimeType: image.mimeType,
    });
    const sourceArtifact = input.sourceArtifactId
      ? await prisma.generationArtifact.findFirst({
          where: {
            id: input.sourceArtifactId,
            mimeType: { startsWith: "image/" },
            job: { userId: session.userId },
          },
          select: { blobUrl: true, mimeType: true },
        })
      : null;
    if (input.sourceArtifactId && !sourceArtifact) {
      return NextResponse.json({ error: "참고할 생성 이미지를 찾을 수 없습니다." }, { status: 404 });
    }
    const storedInputImage = sourceArtifact
      ? { url: sourceArtifact.blobUrl, mimeType: sourceArtifact.mimeType }
      : input.inputImage
        ? await storeInput(input.inputImage, 0)
        : undefined;
    const storedInputImages = input.inputImages
      ? await Promise.all(input.inputImages.map(storeInput))
      : undefined;
    const storedEditMask = input.editMask
      ? await storeInput(input.editMask, MAX_INPUT_IMAGES + 1)
      : undefined;
    const referenceAssets = input.referenceAssetIds?.length
      ? await prisma.projectAsset.findMany({
          where: {
            id: { in: input.referenceAssetIds },
            projectId: input.projectId,
            project: { userId: session.userId },
            kind: "image",
          },
          select: { id: true, name: true, blobUrl: true, mimeType: true },
        })
      : [];
    const referenceAssetsById = new Map(referenceAssets.map((asset) => [asset.id, asset]));
    const storedInput: StoredImageJobInput = {
      presetIds: input.presetIds,
      mode: input.mode,
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
      ...(input.imageSize ? { imageSize: input.imageSize } : {}),
      ...(input.count > 1 ? { count: input.count } : {}),
      prompt: input.prompt,
      isAdmin,
      ...(input.background ? { background: input.background } : {}),
      ...(input.backgroundImageId ? { backgroundImageId: input.backgroundImageId } : {}),
      ...(storedInputImage ? { inputImage: storedInputImage } : {}),
      ...(storedInputImages ? { inputImages: storedInputImages } : {}),
      ...(input.editRegionMode && input.editRegionMode !== "all" ? { editRegionMode: input.editRegionMode } : {}),
      ...(storedEditMask ? { editMask: storedEditMask } : {}),
      ...(input.preserveOutsideMask ? { preserveOutsideMask: true } : {}),
      ...(input.referenceAssetIds?.length
        ? {
            referenceAssets: input.referenceAssetIds.map((id, index) => {
              const asset = referenceAssetsById.get(id)!;
              return {
                url: asset.blobUrl,
                mimeType: asset.mimeType,
                label: `=== 장면 참고 자산 ${index + 1}: ${asset.name} ===`,
              };
            }),
          }
        : {}),
    };

    let job;
    try {
      job = await prisma.generationJob.create({
        data: {
          userId: session.userId,
          projectId: input.projectId,
          cutId: input.cutId,
          kind: input.jobKind || "image",
          provider: getPlatformAIProvider(),
          model: getImageModel(),
          idempotencyKey,
          prompt: input.prompt,
          input: storedInput as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (createError) {
      // 동시 재시도가 같은 idempotency 키로 먼저 생성했다면 기존 작업을 반환한다(멱등 계약).
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
        const existingJob = await prisma.generationJob.findUnique({
          where: { userId_idempotencyKey: { userId: session.userId, idempotencyKey } },
          include: { artifacts: { orderBy: { createdAt: "asc" } } },
        });
        if (existingJob) {
          return NextResponse.json({ job: jobToResponse(existingJob), deduplicated: true }, { status: 202 });
        }
      }
      throw createError;
    }

    const creditResult = await reserveJobCredit(session.userId, job.id);
    if (!creditResult.ok) {
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          stage: "credit_rejected",
          error: creditResult.error,
          completedAt: new Date(),
        },
      });
      return NextResponse.json({ error: creditResult.error }, { status: 402 });
    }

    try {
      const run = await dispatchImageJob(job.id);
      const queuedJob = await prisma.generationJob.update({
        where: { id: job.id },
        data: { runId: run.runId },
        include: { artifacts: true },
      });
      logEvent("NOTICE", "generation.request.accepted", "Image generation request accepted", {
        jobId: job.id,
        jobKind: input.jobKind,
        mode: input.mode,
        count: input.count,
        provider: job.provider,
        model: job.model,
      }, req);
      return NextResponse.json({ job: jobToResponse(queuedJob) }, { status: 202 });
    } catch (error) {
      await failGenerationJob(job.id, error);
      throw error;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logError("generation.request.failed", "Image generation request failed", error, {}, req);
    return NextResponse.json({ error: "이미지 생성 요청 처리에 실패했습니다." }, { status: 500 });
  }
}
