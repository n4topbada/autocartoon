import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { deleteBlobIfUnreferenced } from "@/lib/blob-references";
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

    await prisma.projectAsset.delete({ where: { id } });
    // 로우 삭제가 커밋된 뒤, PresetImage·SavedBackground까지 포함한 6개 테이블 전체를
    // 확인하는 공용 헬퍼로 공유 blob을 실수로 지우지 않도록 한다.
    await Promise.all([
      deleteBlobIfUnreferenced(asset.blobUrl),
      deleteBlobIfUnreferenced(asset.thumbnailUrl),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "자산을 삭제하지 못했습니다." }, { status: 500 });
  }
}
