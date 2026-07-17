import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { uploadThumbnailForBlobUrl } from "@/lib/blob";
import { prisma } from "@/lib/prisma";
import { refOwnedBy, statObject } from "@/lib/storage";

// 스튜디오 자산 업로드 완료 처리. 소유권/존재 확인 후 썸네일 생성 + ProjectAsset 등록.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      ref?: unknown;
      projectId?: unknown;
      name?: unknown;
    };
    const ref = typeof body.ref === "string" ? body.ref : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    if (!ref || !projectId) {
      return NextResponse.json({ error: "ref와 projectId가 필요합니다." }, { status: 400 });
    }
    if (!refOwnedBy(ref, session.userId)) {
      return NextResponse.json({ error: "허용되지 않은 파일입니다." }, { status: 403 });
    }
    const project = await prisma.creativeProject.findFirst({
      where: { id: projectId, userId: session.userId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const stat = await statObject(ref);
    if (!stat.exists) {
      return NextResponse.json({ error: "업로드된 자산을 찾을 수 없습니다." }, { status: 404 });
    }

    const name = String(body.name || "업로드 자산").slice(0, 160);
    const mimeType = stat.contentType || "application/octet-stream";
    let thumbnailUrl: string | undefined;
    if (mimeType.startsWith("image/")) {
      try {
        thumbnailUrl = await uploadThumbnailForBlobUrl(ref, "studio-assets", session.userId);
      } catch (error) {
        console.warn("Studio asset thumbnail failed:", error);
      }
    }

    const asset = await prisma.projectAsset.create({
      data: {
        projectId,
        kind: mimeType.startsWith("video/") ? "video" : "image",
        name,
        blobUrl: ref,
        thumbnailUrl,
        mimeType,
        sizeBytes: stat.sizeBytes,
      },
    });

    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Studio upload confirm error:", error);
    return NextResponse.json({ error: "자산을 저장하지 못했습니다." }, { status: 400 });
  }
}
