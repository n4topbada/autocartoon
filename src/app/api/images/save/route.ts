import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import {
  uploadBase64ImageWithThumbnail,
  uploadThumbnailForBlobUrl,
} from "@/lib/blob";
import { prisma } from "@/lib/prisma";
import { pruneCanvasVersions } from "@/lib/canvas-versions";
import { refOwnedBy, statObject } from "@/lib/storage";
import type { Prisma } from "@prisma/client";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ASPECT_SIZES: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "3:4": { width: 960, height: 1280 },
  "8:11": { width: 800, height: 1100 },
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json()) as {
      base64?: string;
      blobUrl?: string;
      mimeType?: string;
      projectId?: string;
      cutId?: string;
      aspectRatio?: string;
      canvas?: unknown;
      operation?: string;
    };
    const base64 = body.base64?.trim();
    const providedBlobUrl = body.blobUrl?.trim();

    if (!base64 && !providedBlobUrl) {
      return NextResponse.json({ error: "이미지가 필요합니다." }, { status: 400 });
    }
    if (body.cutId && !body.projectId) {
      return NextResponse.json({ error: "cutId에는 projectId가 필요합니다." }, { status: 400 });
    }
    const serializedCanvas = body.canvas && typeof body.canvas === "object" && !Array.isArray(body.canvas)
      ? body.canvas
      : undefined;
    const aspectRatio = body.aspectRatio && ASPECT_SIZES[body.aspectRatio]
      ? body.aspectRatio
      : undefined;
    if (serializedCanvas && JSON.stringify(serializedCanvas).length > 200_000) {
      return NextResponse.json({ error: "캔버스 편집 정보가 너무 큽니다." }, { status: 413 });
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

    let blobUrl: string;
    let thumbnailUrl: string;
    let sizeBytes: number | null = null;
    let mimeType = ALLOWED_MIME_TYPES.has(body.mimeType || "")
      ? body.mimeType!
      : "image/png";

    if (providedBlobUrl) {
      // 업로드 티켓으로 방금 올린 본인 소유 객체만 허용(경로 스코프 u/{userId}/ 검증).
      if (!refOwnedBy(providedBlobUrl, session.userId)) {
        return NextResponse.json({ error: "허용되지 않은 파일입니다." }, { status: 400 });
      }
      const stat = await statObject(providedBlobUrl);
      if (!stat.exists) {
        return NextResponse.json({ error: "업로드된 이미지를 찾을 수 없습니다." }, { status: 404 });
      }
      const contentType = (stat.contentType || "").split(";")[0] || mimeType;
      if (!ALLOWED_MIME_TYPES.has(contentType)) {
        return NextResponse.json({ error: "올바른 이미지가 아닙니다." }, { status: 400 });
      }
      if (stat.sizeBytes && stat.sizeBytes > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "이미지는 20MB 이하여야 합니다." }, { status: 413 });
      }
      blobUrl = providedBlobUrl;
      mimeType = contentType;
      sizeBytes = stat.sizeBytes ?? null;
      thumbnailUrl = await uploadThumbnailForBlobUrl(blobUrl, "edited", session.userId);
    } else {
      if (base64!.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4) {
        return NextResponse.json({ error: "이미지는 20MB 이하여야 합니다." }, { status: 413 });
      }
      sizeBytes = Buffer.byteLength(base64!, "base64");
      const uploaded = await uploadBase64ImageWithThumbnail(base64!, mimeType, "edited", session.userId);
      blobUrl = uploaded.blobUrl;
      thumbnailUrl = uploaded.thumbnailUrl;
    }

    const image = await prisma.$transaction(async (tx) => {
      let savedImage: { id: string; mimeType: string } | null = null;
      // 프로젝트 컷은 ProjectCut + CanvasVersion이 원본 소유자다. GeneratedImage까지
      // 함께 만들면 매 저장이 생성 아카이브에 중복되고 오래된 Blob도 정리할 수 없다.
      if (!body.cutId) {
        const generationRequest = await tx.generationRequest.create({
          data: {
            presetId: null,
            presetIds: [],
            userId: session.userId,
            mode: body.operation === "cutout" ? "cutout" : "edit",
            prompt: body.operation === "cutout" ? "배경 제거" : "캔버스 편집",
          },
        });
        savedImage = await tx.generatedImage.create({
          data: {
            requestId: generationRequest.id,
            blobUrl,
            thumbnailUrl,
            mimeType,
            sizeBytes,
          },
          select: { id: true, mimeType: true },
        });
      }
      // 컷 편집 결과는 ProjectCut + CanvasVersion에서 관리한다. 저장할 때마다
      // 프로젝트 자산을 새로 만들면 자산 패널이 중복 이미지로 빠르게 불어난다.
      if (body.projectId && !body.cutId) {
        await tx.projectAsset.create({
          data: {
            projectId: body.projectId,
            kind: "image",
            name: "캔버스 편집 결과",
            blobUrl,
            thumbnailUrl,
            mimeType,
            sizeBytes,
          },
        });
      }
      if (body.cutId) {
        await tx.projectCut.update({
          where: { id: body.cutId },
          data: {
            imageUrl: blobUrl,
            thumbnailUrl,
            ...(serializedCanvas
              ? { canvas: serializedCanvas as Prisma.InputJsonValue }
              : {}),
          },
        });
        const version = await tx.canvasVersion.create({
          data: {
            cutId: body.cutId,
            imageUrl: blobUrl,
            thumbnailUrl,
            source: body.operation === "cutout" ? "cutout" : "manual",
            label: body.operation === "cutout" ? "배경 제거 저장" : "캔버스 저장",
            ...(serializedCanvas
              ? { canvas: serializedCanvas as Prisma.InputJsonValue }
              : {}),
          },
          select: { id: true },
        });
        savedImage = { id: version.id, mimeType };
      }
      if (body.projectId && aspectRatio) {
        await tx.creativeProject.update({
          where: { id: body.projectId },
          data: {
            aspectRatio,
            canvasWidth: ASPECT_SIZES[aspectRatio].width,
            canvasHeight: ASPECT_SIZES[aspectRatio].height,
          },
        });
      }
      if (!savedImage) throw new Error("저장 결과를 만들지 못했습니다.");
      return savedImage;
    });

    if (body.cutId) {
      await pruneCanvasVersions(body.cutId).catch((error) => {
        console.error("Canvas version prune error:", error);
      });
    }

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
