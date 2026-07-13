import { NextRequest, NextResponse } from "next/server";
import { generate, type GenerationMode } from "@/lib/generation-service";
import { requireAuth, AuthError } from "@/lib/auth";
import { checkAndDeductCredit, refundDeductedCredit } from "@/lib/credit-service";
import { prisma } from "@/lib/prisma";

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
const MAX_INPUT_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BASE64_LENGTH = Math.ceil(MAX_INPUT_IMAGE_BYTES / 3) * 4;

type InputImage = { base64: string; mimeType: string };

interface ValidatedGenerationRequest {
  presetIds: string[];
  mode: GenerationMode;
  prompt: string;
  background?: string;
  backgroundImageId?: string;
  inputImage?: InputImage;
  inputImages?: InputImage[];
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

  let presetIds: string[];
  if (value.presetIds !== undefined) {
    if (!Array.isArray(value.presetIds)) {
      throw new RequestValidationError("presetIds 배열이 필요합니다.");
    }
    if (value.presetIds.length === 0 || value.presetIds.length > MAX_PRESET_IDS) {
      throw new RequestValidationError("캐릭터는 1개에서 4개까지 선택할 수 있습니다.");
    }
    presetIds = value.presetIds.map((id, index) =>
      parseId(id, `presetIds[${index}]`)
    );
  } else if (value.presetId !== undefined) {
    presetIds = [parseId(value.presetId, "presetId")];
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
  const inputImage =
    value.inputImage === undefined
      ? undefined
      : parseInputImage(value.inputImage, "inputImage");

  let inputImages: InputImage[] | undefined;
  if (value.inputImages !== undefined) {
    if (!Array.isArray(value.inputImages) || value.inputImages.length > MAX_INPUT_IMAGES) {
      throw new RequestValidationError("inputImages는 최대 4개까지 사용할 수 있습니다.");
    }
    inputImages = value.inputImages.map((image, index) =>
      parseInputImage(image, `inputImages[${index}]`)
    );
  }

  return {
    presetIds,
    mode: value.mode as GenerationMode,
    prompt,
    background,
    backgroundImageId,
    inputImage,
    inputImages,
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

    const creditResult = await checkAndDeductCredit(session.userId);
    if (!creditResult.ok) {
      return NextResponse.json({ error: creditResult.error }, { status: 402 });
    }

    let refundStarted = false;
    const refundOnce = async () => {
      if (refundStarted) return;
      refundStarted = true;
      await refundDeductedCredit(session.userId, creditResult.source);
    };

    try {
      const result = await generate({
        ...input,
        userId: session.userId,
        isAdmin,
      });
      return NextResponse.json(result);
    } catch (error) {
      try {
        await refundOnce();
      } catch (refundError) {
        console.error("Generation credit refund failed:", refundError);
      }

      console.error("Generation error:", error);
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Generation request error:", error);
    return NextResponse.json({ error: "이미지 생성 요청 처리에 실패했습니다." }, { status: 500 });
  }
}
