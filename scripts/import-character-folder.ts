import { PrismaClient } from "@prisma/client";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { uploadBase64ImageWithThumbnail } from "../src/lib/blob";

const prisma = new PrismaClient();

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const name = getArg("name");
  const folder = getArg("folder");
  const email = getArg("email") ?? "n4topbada@gmail.com";
  const alias = getArg("alias") ?? `${slugify(name ?? "character")}-${Date.now()}`;
  const isPublic = hasFlag("public");

  if (!name || !folder) {
    throw new Error(
      "Usage: npm run import:character -- --name=\"캐릭터명\" --folder=\"assets/character-folder\" [--email=user@example.com] [--alias=alias] [--public]"
    );
  }

  const absoluteFolder = path.resolve(process.cwd(), folder);
  const files = (await readdir(absoluteFolder))
    .map((file) => ({ file, ext: path.extname(file).toLowerCase() }))
    .filter(({ ext }) => MIME_BY_EXT[ext])
    .sort((a, b) => a.file.localeCompare(b.file))
    .slice(0, 4);

  if (files.length === 0) {
    throw new Error(`No supported images found in ${folder}`);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) {
    throw new Error(`User not found: ${email}`);
  }

  const uploads = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(absoluteFolder, files[i].file);
    const buffer = await readFile(filePath);
    const mimeType = MIME_BY_EXT[files[i].ext];
    const uploaded = await uploadBase64ImageWithThumbnail(
      buffer.toString("base64"),
      mimeType,
      "presets"
    );
    uploads.push({ ...uploaded, mimeType, order: i, file: files[i].file });
    console.log(`uploaded ${files[i].file}`);
  }

  const preset = await prisma.characterPreset.create({
    data: {
      alias,
      name,
      userId: user.id,
      isPublic,
      images: {
        create: uploads.map((upload) => ({
          blobUrl: upload.blobUrl,
          thumbnailUrl: upload.thumbnailUrl,
          mimeType: upload.mimeType,
          order: upload.order,
        })),
      },
    },
    include: { images: { orderBy: { order: "asc" } } },
  });

  await prisma.characterPreset.update({
    where: { id: preset.id },
    data: { representativeImageId: preset.images[0]?.id ?? null },
  });

  console.log(
    JSON.stringify(
      {
        id: preset.id,
        alias: preset.alias,
        name: preset.name,
        owner: user.email,
        images: preset.images.length,
        public: preset.isPublic,
      },
      null,
      2
    )
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
