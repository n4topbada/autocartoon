import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  uploadBase64ImageWithThumbnail,
  uploadThumbnailForBlobUrl,
} from "@/lib/blob";
import { prisma } from "@/lib/prisma";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isVercelBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /\.blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json()) as {
      base64?: string;
      blobUrl?: string;
      mimeType?: string;
      projectId?: string;
      cutId?: string;
    };
    const base64 = body.base64?.trim();
    const providedBlobUrl = body.blobUrl?.trim();

    if (!base64 && !providedBlobUrl) {
      return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
    }
    if (body.cutId && !body.projectId) {
      return NextResponse.json({ error: "cutId에는 projectId가 필요합니다." }, { status: 400 });
    }

    if (body.projectId) {
      const project = await prisma.creativeProject.findFirst({
        where: { id: body.projectId, userId: session.userId },
        select: { id: true },
      });
      if (!project) {
        return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
      }
    }
    if (body.cutId) {
      const cut = await prisma.projectCut.findFirst({
        where: {
          id: body.cutId,
          projectId: body.projectId,
          project: { userId: session.userId },
        },
        select: { id: true },
      });
      if (!cut) {
        return NextResponse.json({ error: "컷을 찾을 수 없습니다." }, { status: 404 });
      }
    }

    const firstPreset = await prisma.characterPreset.findFirst({
      where: {
        OR: [
          { userId: session.userId },
          { purchasedBy: { some: { userId: session.userId } } },
        ],
      },
      select: { id: true },
    });
    if (!firstPreset) {
      return NextResponse.json({ error: "캐릭터가 없습니다." }, { status: 400 });
    }

    let blobUrl: string;
    let thumbnailUrl: string;
    let mimeType = ALLOWED_MIME_TYPES.has(body.mimeType || "")
      ? body.mimeType!
      : "image/png";

    if (providedBlobUrl) {
      if (!isVercelBlobUrl(providedBlobUrl)) {
        return NextResponse.json({ error: "허용되지 않은 Blob URL입니다." }, { status: 400 });
      }
      const metadata = await fetch(providedBlobUrl, { method: "HEAD" });
      const contentType = metadata.headers.get("content-type")?.split(";")[0] || "";
      const contentLength = Number(metadata.headers.get("content-length") || "0");
      if (!metadata.ok || !ALLOWED_MIME_TYPES.has(contentType)) {
        return NextResponse.json({ error: "올바른 이미지 Blob이 아닙니다." }, { status: 400 });
      }
      if (contentLength > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "이미지는 20MB 이하여야 합니다." }, { status: 413 });
      }
      blobUrl = providedBlobUrl;
      mimeType = contentType;
      thumbnailUrl = await uploadThumbnailForBlobUrl(blobUrl, "edited");
    } else {
      if (base64!.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) {
        return NextResponse.json({ error: "이미지는 20MB 이하여야 합니다." }, { status: 413 });
      }
      const uploaded = await uploadBase64ImageWithThumbnail(base64!, mimeType, "edited");
      blobUrl = uploaded.blobUrl;
      thumbnailUrl = uploaded.thumbnailUrl;
    }

    const image = await prisma.$transaction(async (tx) => {
      const generationRequest = await tx.generationRequest.create({
        data: {
          presetId: firstPreset.id,
          presetIds: [firstPreset.id],
          userId: session.userId,
          mode: "edit",
          prompt: "캔버스 편집",
        },
      });
      const savedImage = await tx.generatedImage.create({
        data: {
          requestId: generationRequest.id,
          blobUrl,
          thumbnailUrl,
          mimeType,
        },
      });
      if (body.projectId) {
        await tx.projectAsset.create({
          data: {
            projectId: body.projectId,
            kind: "image",
            name: "캔버스 편집 결과",
            blobUrl,
            thumbnailUrl,
            mimeType,
          },
        });
      }
      if (body.cutId) {
        await tx.projectCut.update({
          where: { id: body.cutId },
          data: { imageUrl: blobUrl, thumbnailUrl },
        });
      }
      return savedImage;
    });

    return NextResponse.json({
      id: image.id,
      dataUrl: blobUrl,
      thumbnailUrl,
      mimeType: image.mimeType,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Image save error:", error);
    return NextResponse.json({ error: "이미지 저장에 실패했습니다." }, { status: 500 });
  }
}
