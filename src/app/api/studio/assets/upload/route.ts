import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUploadTicket } from "@/lib/storage";

// 스튜디오 자산 업로드 티켓 발급. 저장 후 confirm에서 썸네일 생성 + 자산 등록.
const ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4"];

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: unknown;
      contentType?: unknown;
    };
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    if (!projectId) return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "지원하지 않는 파일 형식입니다." }, { status: 400 });
    }
    const project = await prisma.creativeProject.findFirst({
      where: { id: projectId, userId: session.userId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const ticket = await createUploadTicket({
      owner: session.userId,
      folder: "studio-assets",
      mimeType: contentType,
      maxBytes: 100 * 1024 * 1024,
    });
    return NextResponse.json(ticket);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Studio upload sign error:", error);
    return NextResponse.json({ error: "자산 업로드를 시작하지 못했습니다." }, { status: 400 });
  }
}
