import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { deleteBlob, uploadBase64ImageWithThumbnail } from "@/lib/blob";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = new URL(req.url);

    let targetUserId = session.userId;
    if (session.role === "admin" && searchParams.get("userId")) {
      targetUserId = searchParams.get("userId")!;
    }

    const backgrounds = await prisma.savedBackground.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      backgrounds.map((bg) => ({
        id: bg.id,
        name: bg.name,
        mimeType: bg.mimeType,
        dataUrl: bg.blobUrl,
        thumbnailUrl: bg.thumbnailUrl ?? bg.blobUrl,
        createdAt: bg.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "배경 조회 실패" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let uploaded: { blobUrl: string; thumbnailUrl: string } | null = null;
  let ownsUploadedBlob = false;
  try {
    const session = await requireAuth();
    const { name, imageData, mimeType, artifactId } = (await req.json()) as {
      name: string;
      imageData?: string;
      mimeType?: string;
      artifactId?: string;
    };

    if (!name?.trim() || name.trim().length > 100 || (!imageData && !artifactId)) {
      return NextResponse.json(
        { error: "배경 이름과 이미지가 필요합니다." },
        { status: 400 }
      );
    }

    const artifact = artifactId
      ? await prisma.generationArtifact.findFirst({
          where: {
            id: artifactId,
            mimeType: { startsWith: "image/" },
            job: { userId: session.userId },
          },
          select: { blobUrl: true, thumbnailUrl: true, mimeType: true },
        })
      : null;
    if (artifactId && !artifact) {
      return NextResponse.json({ error: "저장할 생성 이미지를 찾을 수 없습니다." }, { status: 404 });
    }

    const mime = artifact?.mimeType || mimeType || "image/png";
    if (!artifact && !["image/png", "image/jpeg", "image/webp"].includes(mime)) {
      return NextResponse.json({ error: "지원하지 않는 이미지 형식입니다." }, { status: 400 });
    }
    uploaded = artifact
      ? { blobUrl: artifact.blobUrl, thumbnailUrl: artifact.thumbnailUrl ?? artifact.blobUrl }
      : await uploadBase64ImageWithThumbnail(imageData!, mime, "backgrounds");
    ownsUploadedBlob = !artifact;

    const bg = await prisma.savedBackground.create({
      data: {
        name: name.trim(),
        blobUrl: uploaded.blobUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        mimeType: mime,
        userId: session.userId,
      },
    });

    return NextResponse.json({
      id: bg.id,
      name: bg.name,
      mimeType: bg.mimeType,
      dataUrl: bg.blobUrl,
      thumbnailUrl: bg.thumbnailUrl ?? bg.blobUrl,
      createdAt: bg.createdAt.toISOString(),
    });
  } catch (error) {
    if (uploaded && ownsUploadedBlob) {
      await Promise.allSettled([deleteBlob(uploaded.blobUrl), deleteBlob(uploaded.thumbnailUrl)]);
    }
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Save background error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 500 }
    );
  }
}
