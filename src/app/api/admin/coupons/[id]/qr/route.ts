import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getAppUrl } from "@/lib/app-url";
import { AuthError, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const campaign = await prisma.couponCampaign.findUnique({
      where: { id },
      select: { code: true },
    });
    if (!campaign) return NextResponse.json({ error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });

    const claimUrl = getAppUrl(`/coupon/${campaign.code}`, req.nextUrl.origin);
    const png = await QRCode.toBuffer(claimUrl, {
      type: "png",
      width: 960,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#202722", light: "#ffffff" },
    });
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": "image/png",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${campaign.code}.png"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Coupon QR generation error:", error);
    return NextResponse.json({ error: "QR 이미지를 만들지 못했습니다." }, { status: 500 });
  }
}
