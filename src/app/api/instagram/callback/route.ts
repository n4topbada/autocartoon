import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { exchangeCodeForToken, getLongLivedToken, getInstagramAccount } from "@/lib/instagram";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const code = new URL(req.url).searchParams.get("code");
    if (!code) {
      return NextResponse.redirect(new URL("/?ig_error=no_code", req.url));
    }

    // 1. Code → Short-lived token
    const { accessToken: shortToken } = await exchangeCodeForToken(code);

    // 2. Short → Long-lived token
    const { accessToken, expiresIn } = await getLongLivedToken(shortToken);

    // 3. Get Instagram Business Account
    const igAccount = await getInstagramAccount(accessToken);
    if (!igAccount) {
      return NextResponse.redirect(new URL("/?ig_error=no_business_account", req.url));
    }

    // 4. Save to DB (upsert)
    await prisma.instagramAccount.upsert({
      where: { userId: session.userId },
      create: {
        userId: session.userId,
        igUserId: igAccount.igUserId,
        accessToken,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        username: igAccount.username,
        profilePicture: igAccount.profilePicture,
      },
      update: {
        igUserId: igAccount.igUserId,
        accessToken,
        tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
        username: igAccount.username,
        profilePicture: igAccount.profilePicture,
      },
    });

    return NextResponse.redirect(new URL("/?ig_connected=true", req.url));
  } catch (error) {
    console.error("Instagram callback error:", error);
    if (error instanceof AuthError) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.redirect(new URL("/?ig_error=auth_failed", req.url));
  }
}
