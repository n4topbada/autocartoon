import { deleteBlob } from "./blob";
import { prisma } from "./prisma";

export async function isBlobReferenced(url: string) {
  if (!url) return false;
  const [generated, artifacts, presets, backgrounds, assets, cuts, canvasVersions] = await Promise.all([
    prisma.generatedImage.count({ where: { OR: [{ blobUrl: url }, { thumbnailUrl: url }] } }),
    prisma.generationArtifact.count({ where: { OR: [{ blobUrl: url }, { thumbnailUrl: url }] } }),
    prisma.presetImage.count({ where: { OR: [{ blobUrl: url }, { thumbnailUrl: url }] } }),
    prisma.savedBackground.count({ where: { OR: [{ blobUrl: url }, { thumbnailUrl: url }] } }),
    prisma.projectAsset.count({ where: { OR: [{ blobUrl: url }, { thumbnailUrl: url }] } }),
    prisma.projectCut.count({
      where: { OR: [{ imageUrl: url }, { thumbnailUrl: url }, { videoUrl: url }] },
    }),
    prisma.canvasVersion.count({
      where: { OR: [{ imageUrl: url }, { thumbnailUrl: url }] },
    }),
  ]);
  return generated + artifacts + presets + backgrounds + assets + cuts + canvasVersions > 0;
}

export async function deleteBlobIfUnreferenced(url?: string | null) {
  if (!url || await isBlobReferenced(url)) return false;
  await deleteBlob(url);
  return true;
}
