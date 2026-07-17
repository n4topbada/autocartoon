import { deleteBlobIfUnreferenced } from "./blob-references";
import { prisma } from "./prisma";

export const CANVAS_VERSION_LIMIT = 60;

export async function pruneCanvasVersions(
  cutId: string,
  keep = CANVAS_VERSION_LIMIT
) {
  const stale = await prisma.canvasVersion.findMany({
    where: { cutId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: Math.max(1, keep),
    select: { id: true, imageUrl: true, thumbnailUrl: true },
  });
  if (stale.length === 0) return 0;

  await prisma.canvasVersion.deleteMany({
    where: { id: { in: stale.map((version) => version.id) } },
  });

  const directUrls = new Set(stale.flatMap((version) => [version.imageUrl, version.thumbnailUrl]).filter(Boolean) as string[]);
  await Promise.allSettled([...directUrls].map((url) => deleteBlobIfUnreferenced(url)));
  return stale.length;
}
