import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { deleteBlob } from "@/lib/blob";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const asset = await prisma.projectAsset.findFirst({
      where: { id, project: { userId: session.userId } },
    });
    if (!asset) return NextResponse.json({ error: "자산을 찾을 수 없습니다." }, { status: 404 });
    const cleanup = await prisma.$transaction(async (tx) => {
      await tx.projectAsset.delete({ where: { id } });
      const [generatedImageRefs, artifactRefs, assetRefs, cutRefs] = await Promise.all([
        tx.generatedImage.count({ where: { blobUrl: asset.blobUrl } }),
        tx.generationArtifact.count({ where: { blobUrl: asset.blobUrl } }),
        tx.projectAsset.count({ where: { blobUrl: asset.blobUrl } }),
        tx.projectCut.count({
          where: { OR: [{ imageUrl: asset.blobUrl }, { videoUrl: asset.blobUrl }] },
        }),
      ]);

      let deleteThumbnail = false;
      if (asset.thumbnailUrl) {
        const [generatedThumbnailRefs, artifactThumbnailRefs, assetThumbnailRefs, cutThumbnailRefs] =
          await Promise.all([
            tx.generatedImage.count({ where: { thumbnailUrl: asset.thumbnailUrl } }),
            tx.generationArtifact.count({ where: { thumbnailUrl: asset.thumbnailUrl } }),
            tx.projectAsset.count({ where: { thumbnailUrl: asset.thumbnailUrl } }),
            tx.projectCut.count({ where: { thumbnailUrl: asset.thumbnailUrl } }),
          ]);
        deleteThumbnail =
          generatedThumbnailRefs + artifactThumbnailRefs + assetThumbnailRefs + cutThumbnailRefs === 0;
      }

      return {
        deleteOriginal: generatedImageRefs + artifactRefs + assetRefs + cutRefs === 0,
        deleteThumbnail,
      };
    });

    await Promise.all([
      cleanup.deleteOriginal ? deleteBlob(asset.blobUrl) : Promise.resolve(),
      cleanup.deleteThumbnail && asset.thumbnailUrl
        ? deleteBlob(asset.thumbnailUrl)
        : Promise.resolve(),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "자산을 삭제하지 못했습니다." }, { status: 500 });
  }
}
