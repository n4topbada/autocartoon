import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { objectPathFromRef, refOwnedBy, statObject } from "@/lib/storage";

// 숏폼 업로드 완료 처리. 업로드된 객체 소유권/존재를 확인한 뒤 잡·아티팩트·자산 생성.
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => ({}))) as {
      ref?: unknown;
      projectId?: unknown;
      title?: unknown;
      cutCount?: unknown;
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
      select: { id: true, title: true },
    });
    if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

    const stat = await statObject(ref);
    if (!stat.exists) {
      return NextResponse.json({ error: "업로드된 영상을 찾을 수 없습니다." }, { status: 404 });
    }

    const title = String(body.title || `${project.title} 숏폼`).trim().slice(0, 160);
    const cutCount = Math.max(1, Math.min(30, Number(body.cutCount) || 1));
    const mimeType = stat.contentType || "video/mp4";
    const sizeBytes = stat.sizeBytes;
    const idempotencyKey = `short-${objectPathFromRef(ref)}`.slice(0, 200);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.generationJob.findUnique({
        where: { userId_idempotencyKey: { userId: session.userId, idempotencyKey } },
        select: { id: true },
      });
      if (existing) return { jobId: existing.id, created: false };
      const job = await tx.generationJob.create({
        data: {
          userId: session.userId,
          projectId,
          kind: "short",
          status: "succeeded",
          stage: "completed",
          progress: 100,
          provider: "browser",
          model: "ffmpeg.wasm",
          idempotencyKey,
          prompt: `${cutCount}개 컷과 대사 음성으로 만든 숏폼`,
          input: { source: "browser-ffmpeg", cutCount } satisfies Prisma.InputJsonObject,
          output: { blobUrl: ref, mimeType } satisfies Prisma.InputJsonObject,
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      await tx.generationArtifact.create({
        data: {
          jobId: job.id,
          kind: "video",
          blobUrl: ref,
          mimeType,
          sizeBytes,
          metadata: { source: "short-builder" },
        },
      });
      await tx.projectAsset.create({
        data: {
          projectId,
          jobId: job.id,
          kind: "video",
          name: title || "숏폼 영상",
          blobUrl: ref,
          mimeType,
          sizeBytes,
          metadata: { source: "short-builder", cutCount },
        },
      });
      return { jobId: job.id, created: true };
    });

    return NextResponse.json({ ok: true, ...result, blobUrl: ref });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Short upload confirm error:", error);
    return NextResponse.json({ error: "완성 영상을 저장하지 못했습니다." }, { status: 400 });
  }
}
