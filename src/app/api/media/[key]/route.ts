import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  decodeMediaKey,
  isSafeStorageObjectPath,
  mediaRefForObjectPath,
  signReadUrl,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * 미디어 게이트웨이 (GCS 비공개 저장소 전용, 사용자별 권한 관문).
 *
 * key = base64url(objectPath). 규칙:
 *  - `public/…`               : 누구나 조회
 *  - `u/{ownerId}/…`          : 소유자 본인·관리자, 또는 공개 게시(플라자/보드)·공개 프리셋(마켓)만
 *  - 그 외 경로               : 거부
 *
 * 허용되면 짧은 만료의 V4 서명 URL로 302 리다이렉트한다(바이트는 GCS가 서빙).
 * 로컬 파일시스템 모드에서는 참조가 /uploads/…라 이 게이트웨이를 거치지 않는다.
 */
async function isPubliclyShared(objectPath: string): Promise<boolean> {
  // DB에 저장된 참조는 gs://가 아니라 게이트웨이 URL(/api/media/{key})이다.
  // 원본/썸네일 어느 쪽 경로로도 요청될 수 있으므로 blobUrl·thumbnailUrl 둘 다 매칭한다.
  const ref = mediaRefForObjectPath(objectPath);

  // (1) 보드/플라자에 게시된 이미지는 공개다.
  const image = await prisma.generatedImage.findFirst({
    where: { OR: [{ blobUrl: ref }, { thumbnailUrl: ref }] },
    select: { id: true },
  });
  if (image) {
    const post = await prisma.boardPost.findFirst({
      where: { imageIds: { has: image.id } },
      select: { id: true },
    });
    if (post) return true;
  }

  // (2) 공개 마켓 프리셋 이미지는 소유자가 아니어도 조회 가능하다.
  const presetImage = await prisma.presetImage.findFirst({
    where: {
      OR: [{ blobUrl: ref }, { thumbnailUrl: ref }],
      preset: { isPublic: true },
    },
    select: { id: true },
  });
  return Boolean(presetImage);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    let objectPath: string;
    try {
      objectPath = decodeMediaKey(key);
    } catch {
      return NextResponse.json({ error: "잘못된 미디어 키" }, { status: 400 });
    }
    // 경로 탈출 방지
    if (!isSafeStorageObjectPath(objectPath)) {
      return NextResponse.json({ error: "잘못된 경로" }, { status: 400 });
    }

    let allowed = false;
    if (objectPath.startsWith("public/")) {
      allowed = true;
    } else {
      const ownerMatch = /^u\/([^/]+)\//.exec(objectPath);
      if (ownerMatch) {
        const ownerId = ownerMatch[1];
        const user = await getCurrentUser();
        if (user && (user.id === ownerId || user.role === "admin")) {
          allowed = true;
        } else {
          allowed = await isPubliclyShared(objectPath);
        }
      }
    }

    if (!allowed) {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }

    const bucket = process.env.GCS_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: "저장소가 구성되지 않았습니다." }, { status: 500 });
    }
    const signed = await signReadUrl(`gs://${bucket}/${objectPath}`, 300);
    const response = NextResponse.redirect(signed, 302);
    // 서명 URL은 사용자별·단기이므로 공유 캐시를 막는다.
    response.headers.set("Cache-Control", "private, max-age=60");
    return response;
  } catch (error) {
    console.error("Media gateway error:", error);
    return NextResponse.json({ error: "미디어를 불러오지 못했습니다." }, { status: 500 });
  }
}
