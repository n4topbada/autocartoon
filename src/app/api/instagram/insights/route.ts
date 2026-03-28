import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth";
import { getAccountInsights } from "@/lib/instagram";

export async function GET() {
  try {
    const session = await requireAuth();

    const igAccount = await prisma.instagramAccount.findUnique({
      where: { userId: session.userId },
    });
    if (!igAccount) {
      return NextResponse.json({ error: "Instagram 계정이 연동되지 않았습니다." }, { status: 400 });
    }

    const insights = await getAccountInsights(igAccount.igUserId, igAccount.accessToken);

    // 발행된 게시물 통계 합계
    const posts = await prisma.instagramPost.findMany({
      where: { accountId: igAccount.id },
      select: { likes: true, comments: true, saves: true, shares: true, reach: true },
    });
    const totals = posts.reduce(
      (acc, p) => ({
        likes: acc.likes + p.likes,
        comments: acc.comments + p.comments,
        saves: acc.saves + p.saves,
        shares: acc.shares + p.shares,
        reach: acc.reach + p.reach,
      }),
      { likes: 0, comments: 0, saves: 0, shares: 0, reach: 0 }
    );

    return NextResponse.json({
      account: {
        username: igAccount.username,
        profilePicture: igAccount.profilePicture,
        followers: insights.followers,
      },
      insights: {
        ...insights,
        totalLikes: totals.likes,
        totalComments: totals.comments,
        totalSaves: totals.saves,
        totalShares: totals.shares,
      },
      postCount: posts.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "인사이트 조회 실패" }, { status: 500 });
  }
}
