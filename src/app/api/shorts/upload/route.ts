import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface ShortUploadPayload {
  userId: string;
  projectId: string;
  title: string;
  cutCount: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await requireAuth();
        if (!pathname.startsWith("shorts/")) throw new Error("허용되지 않은 업로드 경로입니다.");
        const payload = JSON.parse(clientPayload || "{}") as Partial<ShortUploadPayload>;
        if (!payload.projectId) throw new Error("프로젝트가 필요합니다.");
        const project = await prisma.creativeProject.findFirst({
          where: { id: payload.projectId, userId: session.userId },
          select: { id: true, title: true },
        });
        if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: session.userId,
            projectId: project.id,
            title: String(payload.title || `${project.title} 숏폼`).trim().slice(0, 160),
            cutCount: Math.max(1, Math.min(30, Number(payload.cutCount) || 1)),
          } satisfies ShortUploadPayload),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = JSON.parse(tokenPayload || "{}") as ShortUploadPayload;
        const idempotencyKey = `short-${blob.pathname}`.slice(0, 200);
        await prisma.$transaction(async (tx) => {
          const existing = await tx.generationJob.findUnique({
            where: {
              userId_idempotencyKey: {
                userId: payload.userId,
                idempotencyKey,
              },
            },
            select: { id: true },
          });
          if (existing) return;
          const job = await tx.generationJob.create({
            data: {
              userId: payload.userId,
              projectId: payload.projectId,
              kind: "short",
              status: "succeeded",
              stage: "completed",
              progress: 100,
              provider: "browser",
              model: "ffmpeg.wasm",
              idempotencyKey,
              prompt: `${payload.cutCount}개 컷과 대사 음성으로 만든 숏폼`,
              input: {
                source: "browser-ffmpeg",
                cutCount: payload.cutCount,
              } satisfies Prisma.InputJsonObject,
              output: {
                blobUrl: blob.url,
                mimeType: blob.contentType || "video/mp4",
              } satisfies Prisma.InputJsonObject,
              startedAt: new Date(),
              completedAt: new Date(),
            },
          });
          await tx.generationArtifact.create({
            data: {
              jobId: job.id,
              kind: "video",
              blobUrl: blob.url,
              mimeType: blob.contentType || "video/mp4",
              metadata: { source: "short-builder" },
            },
          });
          await tx.projectAsset.create({
            data: {
              projectId: payload.projectId,
              jobId: job.id,
              kind: "video",
              name: payload.title || "숏폼 영상",
              blobUrl: blob.url,
              mimeType: blob.contentType || "video/mp4",
              metadata: { source: "short-builder", cutCount: payload.cutCount },
            },
          });
        });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Short video upload error:", error);
    return NextResponse.json({ error: "완성 영상을 저장하지 못했습니다." }, { status: 400 });
  }
}
