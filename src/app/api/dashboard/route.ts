import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getPublicJobError } from "@/lib/generation-jobs";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireAuth();
    const userId = session.userId;
    const characterWhere = session.role === "admin"
      ? { userId }
      : {
          OR: [
            { userId },
            { purchasedBy: { some: { userId } } },
          ],
        };

    const [
      user,
      characterCount,
      backgroundCount,
      artifactCount,
      legacyImageCount,
      projectCount,
      postCount,
      completedSceneCount,
      recentJobs,
      recentProjects,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, credits: true, tier: true, tierUsedThisMonth: true },
      }),
      prisma.characterPreset.count({ where: characterWhere }),
      prisma.savedBackground.count({ where: { userId } }),
      prisma.generationArtifact.count({ where: { job: { userId } } }),
      prisma.generatedImage.count({
        where: { request: { userId, jobId: null } },
      }),
      prisma.creativeProject.count({ where: { userId } }),
      prisma.boardPost.count({ where: { userId } }),
      prisma.generationJob.count({
        where: {
          userId,
          status: "succeeded",
          kind: { in: ["image", "gesture"] },
        },
      }),
      prisma.generationJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          kind: true,
          status: true,
          stage: true,
          progress: true,
          prompt: true,
          error: true,
          createdAt: true,
          completedAt: true,
          artifacts: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { blobUrl: true, thumbnailUrl: true, mimeType: true },
          },
        },
      }),
      prisma.creativeProject.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          aspectRatio: true,
          updatedAt: true,
          coverCut: { select: { imageUrl: true, thumbnailUrl: true } },
          cuts: {
            orderBy: { order: "asc" },
            take: 1,
            select: { imageUrl: true, thumbnailUrl: true },
          },
          _count: { select: { cuts: true, assets: true } },
        },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({
      user,
      counts: {
        characters: characterCount,
        backgrounds: backgroundCount,
        outputs: artifactCount + legacyImageCount,
        projects: projectCount,
        posts: postCount,
      },
      onboarding: {
        character: characterCount > 0,
        scene: completedSceneCount > 0,
        project: projectCount > 0,
      },
      recentJobs: recentJobs.map((job) => ({
        ...job,
        error: getPublicJobError(job.error),
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() ?? null,
      })),
      recentProjects: recentProjects.map((project) => ({
        ...project,
        updatedAt: project.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Dashboard load error:", error);
    return NextResponse.json({ error: "제작 현황을 불러오지 못했습니다." }, { status: 500 });
  }
}
