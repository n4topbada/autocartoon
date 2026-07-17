import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createUploadTicket } from "@/lib/storage";

// 완성 숏폼(브라우저 ffmpeg 렌더링) 업로드 티켓 발급. 저장 후 confirm에서 DB 반영.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: unknown;
      contentType?: unknown;
    };
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const contentType = typeof body.contentType === "string" ? body.contentType : "video/mp4";
    if (!projectId) return NextResponse.json({ error: "프로젝트가 필요합니다." }, { status: 400 });
    if (contentType !== "video/mp4") {
      return NextResponse.json({ error: "MP4만 업로드할 수 있습니다." }, { status: 400 });
    }
    const project = await prisma.creativeProject.findFirst({
      where: { id: projectId, userId: session.userId },
      select: { id: true },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const ticket = await createUploadTicket({
      owner: session.userId,
      folder: "shorts",
      mimeType: contentType,
      maxBytes: 200 * 1024 * 1024,
    });
    return NextResponse.json(ticket);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Short upload sign error:", error);
    return NextResponse.json({ error: "업로드를 시작하지 못했습니다." }, { status: 400 });
  }
}
