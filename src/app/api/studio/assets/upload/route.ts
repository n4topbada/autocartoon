import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { uploadThumbnailForBlobUrl } from "@/lib/blob";
import { prisma } from "@/lib/prisma";

interface UploadTokenPayload {
  userId: string;
  projectId: string;
  name: string;
}

const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await requireAuth();
        const payload = JSON.parse(clientPayload || "{}") as Partial<UploadTokenPayload>;
        if (!payload.projectId) throw new Error("projectId가 필요합니다.");
        const project = await prisma.creativeProject.findFirst({
          where: { id: payload.projectId, userId: session.userId },
          select: { id: true },
        });
        if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: 100 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: session.userId,
            projectId: project.id,
            name: String(payload.name || "업로드 자산").slice(0, 160),
          } satisfies UploadTokenPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as UploadTokenPayload;
        const mimeType = blob.contentType || "application/octet-stream";
        let thumbnailUrl: string | undefined;
        if (mimeType.startsWith("image/")) {
          try {
            thumbnailUrl = await uploadThumbnailForBlobUrl(blob.url, "studio-assets");
          } catch (error) {
            console.warn("Studio asset thumbnail failed:", error);
          }
        }
        await prisma.projectAsset.create({
          data: {
            projectId: payload.projectId,
            kind: mimeType.startsWith("video/") ? "video" : "image",
            name: payload.name,
            blobUrl: blob.url,
            thumbnailUrl,
            mimeType,
          },
        });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Studio upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "자산 업로드를 시작하지 못했습니다." },
      { status: 400 }
    );
  }
}
