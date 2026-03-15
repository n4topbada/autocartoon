import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const imgId = searchParams.get("imgId");

  const image = imgId
    ? await prisma.presetImage.findUnique({ where: { id: imgId } })
    : await prisma.presetImage.findFirst({
        where: { presetId: id },
        orderBy: { order: "asc" },
      });

  if (!image?.blobUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Blob URL로 리다이렉트
  return NextResponse.redirect(image.blobUrl);
}
