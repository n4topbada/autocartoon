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

  if (!image) {
    return new NextResponse("Not found", { status: 404 });
  }

  // DB에 base64로 저장된 업로드 이미지
  if (image.imageData) {
    const buffer = Buffer.from(image.imageData, "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse("No image data", { status: 404 });
}
