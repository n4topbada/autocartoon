import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import { isCreditError, withCreditCharge } from "@/lib/credit-service";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function getApiKey() {
  return process.env.REMOVE_BG_API_KEY?.trim() || "";
}

function providerErrorMessage(raw: string, status: number) {
  try {
    const parsed = JSON.parse(raw) as { errors?: Array<{ title?: string }> };
    const title = parsed.errors?.find((item) => typeof item.title === "string")?.title;
    if (title) return `누끼 API 오류: ${title.slice(0, 180)}`;
  } catch {
    // Provider may return plain text.
  }
  if (status === 402) return "누끼 API 크레딧이 부족합니다.";
  if (status === 429) return "누끼 API 요청이 많습니다. 잠시 후 다시 시도해주세요.";
  return "누끼 API가 이미지를 처리하지 못했습니다.";
}

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({
      provider: "remove.bg",
      configured: Boolean(getApiKey()),
      credits: AI_CREDIT_COSTS.cutout,
      maxBytes: MAX_IMAGE_BYTES,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "누끼 연결 상태를 확인하지 못했습니다." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "누끼 API가 아직 연결되지 않았습니다.", code: "provider_not_configured" },
        { status: 503 }
      );
    }

    const input = await req.formData().catch(() => null);
    const image = input?.get("image");
    if (!(image instanceof File) || !ALLOWED_TYPES.has(image.type) || image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "12MB 이하 PNG, JPG, WEBP 이미지를 선택해주세요." }, { status: 400 });
    }

    const output = await withCreditCharge(
      session.userId,
      {
        units: AI_CREDIT_COSTS.cutout,
        source: "cutout",
        referenceId: `cutout:${session.userId}:${randomUUID()}`,
        note: "remove.bg 고화질 누끼",
      },
      async () => {
        const providerForm = new FormData();
        providerForm.append("image_file", image, image.name || "canvas.png");
        providerForm.append("size", "auto");
        providerForm.append("format", "png");
        providerForm.append("type", "auto");
        providerForm.append("crop", "false");
        const response = await fetch("https://api.remove.bg/v1.0/removebg", {
          method: "POST",
          headers: { "X-Api-Key": apiKey },
          body: providerForm,
          signal: AbortSignal.timeout(55_000),
        });
        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(providerErrorMessage(detail, response.status));
        }
        return {
          data: await response.arrayBuffer(),
          contentType: response.headers.get("content-type") || "image/png",
        };
      }
    );

    return new NextResponse(output.data, {
      status: 200,
      headers: {
        "Content-Type": output.contentType,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (isCreditError(error)) {
      return NextResponse.json({ error: error.message, traceId: error.traceId }, { status: error.status });
    }
    console.error("Canvas remove-background error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 배경을 제거하지 못했습니다." },
      { status: 502 }
    );
  }
}
