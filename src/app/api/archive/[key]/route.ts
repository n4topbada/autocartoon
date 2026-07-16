import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { deleteBlobIfUnreferenced } from "@/lib/blob-references";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const session = await requireAuth();
    const { key } = await params;
    const separator = key.indexOf(":");
    const source = separator > 0 ? key.slice(0, separator) : "";
    const id = separator > 0 ? key.slice(separator + 1) : "";
    if (!id || !["artifact", "image"].includes(source)) {
      return NextResponse.json({ error: "보관함 항목이 올바르지 않습니다." }, { status: 400 });
    }

    if (source === "image") {
      const image = await prisma.generatedImage.findFirst({
        where: { id, request: { userId: session.userId } },
      });
      if (!image) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
      await prisma.generatedImage.delete({ where: { id } });
      const remaining = await prisma.generatedImage.count({ where: { requestId: image.requestId } });
      if (remaining === 0) await prisma.generationRequest.delete({ where: { id: image.requestId } });
      await Promise.all([
        deleteBlobIfUnreferenced(image.blobUrl),
        deleteBlobIfUnreferenced(image.thumbnailUrl),
      ]);
      return NextResponse.json({ ok: true });
    }

    const artifact = await prisma.generationArtifact.findFirst({
      where: { id, job: { userId: session.userId } },
    });
    if (!artifact) return NextResponse.json({ error: "작업 결과를 찾을 수 없습니다." }, { status: 404 });
    await prisma.generationArtifact.delete({ where: { id } });
    await Promise.all([
      deleteBlobIfUnreferenced(artifact.blobUrl),
      deleteBlobIfUnreferenced(artifact.thumbnailUrl),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Archive delete error:", error);
    return NextResponse.json({ error: "보관함 항목을 삭제하지 못했습니다." }, { status: 500 });
  }
}
