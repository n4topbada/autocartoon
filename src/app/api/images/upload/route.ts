import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUploadTicket } from "@/lib/storage";

// 캔버스 편집 결과 업로드 티켓 발급(인증·소유권 확인 후 서명). 저장은 클라가 직접.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      contentType?: unknown;
      projectId?: unknown;
      cutId?: unknown;
    };
    const contentType = typeof body.contentType === "string" ? body.contentType : "image/png";
    if (contentType !== "image/png") {
      return NextResponse.json({ error: "PNG만 업로드할 수 있습니다." }, { status: 400 });
    }
    const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
    const cutId = typeof body.cutId === "string" ? body.cutId : undefined;
    if (cutId && !projectId) {
      return NextResponse.json({ error: "cutId에는 projectId가 필요합니다." }, { status: 400 });
    }
    if (projectId) {
      const project = await prisma.creativeProject.findFirst({
        where: { id: projectId, userId: session.userId },
        select: { id: true },
      });
      if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    if (cutId) {
      const cut = await prisma.projectCut.findFirst({
        where: { id: cutId, projectId, project: { userId: session.userId } },
        select: { id: true },
      });
      if (!cut) return NextResponse.json({ error: "컷을 찾을 수 없습니다." }, { status: 404 });
    }

    const ticket = await createUploadTicket({
      owner: session.userId,
      folder: "edited",
      mimeType: contentType,
      maxBytes: 20 * 1024 * 1024,
    });
    return NextResponse.json(ticket);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Canvas upload sign error:", error);
    return NextResponse.json({ error: "업로드를 시작하지 못했습니다." }, { status: 400 });
  }
}
