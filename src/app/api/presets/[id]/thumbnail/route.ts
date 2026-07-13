import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const imgId = searchParams.get("imgId");

    const preset = await prisma.characterPreset.findFirst({
      where: {
        id,
        OR: [
          { userId: session.userId },
          { userId: null },
          { isPublic: true },
          { purchasedBy: { some: { userId: session.userId } } },
        ],
      },
      select: { representativeImageId: true },
    });
    if (!preset) {
      return new NextResponse("Not found", { status: 404 });
    }

    let image = imgId
      ? await prisma.presetImage.findFirst({ where: { id: imgId, presetId: id } })
      : preset.representativeImageId
        ? await prisma.presetImage.findFirst({
            where: { id: preset.representativeImageId, presetId: id },
          })
        : null;

    if (!imgId && !image) {
      image = await prisma.presetImage.findFirst({
        where: { presetId: id },
        orderBy: { order: "asc" },
      });
    }

    if (!image?.blobUrl) {
      return new NextResponse("Not found", { status: 404 });
    }

    const response = NextResponse.redirect(new URL(image.blobUrl, req.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Preset thumbnail error:", error);
    return new NextResponse("Thumbnail lookup failed", { status: 500 });
  }
}
