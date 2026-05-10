import { PrismaClient } from "@prisma/client";
import { uploadThumbnailForBlobUrl } from "../src/lib/blob";

const prisma = new PrismaClient();

async function backfillPresetImages() {
  const images = await prisma.presetImage.findMany({
    where: { thumbnailUrl: null },
    select: { id: true, blobUrl: true },
  });

  for (const image of images) {
    const thumbnailUrl = await uploadThumbnailForBlobUrl(image.blobUrl, "presets");
    await prisma.presetImage.update({
      where: { id: image.id },
      data: { thumbnailUrl },
    });
    console.log(`PresetImage ${image.id}`);
  }
}

async function backfillGeneratedImages() {
  const images = await prisma.generatedImage.findMany({
    where: { thumbnailUrl: null },
    select: { id: true, blobUrl: true },
  });

  for (const image of images) {
    const thumbnailUrl = await uploadThumbnailForBlobUrl(image.blobUrl, "generated");
    await prisma.generatedImage.update({
      where: { id: image.id },
      data: { thumbnailUrl },
    });
    console.log(`GeneratedImage ${image.id}`);
  }
}

async function backfillBackgrounds() {
  const backgrounds = await prisma.savedBackground.findMany({
    where: { thumbnailUrl: null },
    select: { id: true, blobUrl: true },
  });

  for (const background of backgrounds) {
    const thumbnailUrl = await uploadThumbnailForBlobUrl(background.blobUrl, "backgrounds");
    await prisma.savedBackground.update({
      where: { id: background.id },
      data: { thumbnailUrl },
    });
    console.log(`SavedBackground ${background.id}`);
  }
}

async function main() {
  await backfillPresetImages();
  await backfillGeneratedImages();
  await backfillBackgrounds();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
