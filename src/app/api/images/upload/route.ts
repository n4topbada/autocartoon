import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface CanvasUploadPayload {
  projectId?: string;
  cutId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await requireAuth();
        if (!pathname.startsWith("edited/")) {
          throw new Error("허용되지 않은 업로드 경로입니다.");
        }
        const payload = JSON.parse(clientPayload || "{}") as CanvasUploadPayload;
        if (payload.cutId && !payload.projectId) {
          throw new Error("cutId에는 projectId가 필요합니다.");
        }
        if (payload.projectId) {
          const project = await prisma.creativeProject.findFirst({
            where: { id: payload.projectId, userId: session.userId },
            select: { id: true },
          });
          if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
        }
        if (payload.cutId) {
          const cut = await prisma.projectCut.findFirst({
            where: {
              id: payload.cutId,
              projectId: payload.projectId,
              project: { userId: session.userId },
            },
            select: { id: true },
          });
          if (!cut) throw new Error("컷을 찾을 수 없습니다.");
        }
        return {
          allowedContentTypes: ["image/png"],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Canvas upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드를 시작하지 못했습니다." },
      { status: 400 }
    );
  }
}
