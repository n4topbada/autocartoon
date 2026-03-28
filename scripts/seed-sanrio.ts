/**
 * 산리오 캐릭터 그룹 시드 스크립트
 * 실행: npx tsx scripts/seed-sanrio.ts
 */
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";

const prisma = new PrismaClient();

const CHARACTERS = [
  {
    name: "Hello Kitty",
    images: [
      "https://upload.wikimedia.org/wikipedia/en/0/05/Hello_kitty_character_portrait.png",
      "https://www.pngall.com/wp-content/uploads/13/Hello-Kitty-PNG-Image.png",
    ],
  },
  {
    name: "My Melody",
    images: [
      "https://www.pngall.com/wp-content/uploads/13/My-Melody.png",
      "https://www.pngall.com/wp-content/uploads/13/My-Melody-PNG-Image.png",
    ],
  },
  {
    name: "Kuromi",
    images: [
      "https://upload.wikimedia.org/wikipedia/en/thumb/0/04/Kuromi_render.png/250px-Kuromi_render.png",
      "https://www.pngall.com/wp-content/uploads/13/Kuromi-PNG.png",
    ],
  },
  {
    name: "Cinnamoroll",
    images: [
      "https://www.pngall.com/wp-content/uploads/13/Cinnamoroll-PNG-Image.png",
      "https://www.pngall.com/wp-content/uploads/13/Cinnamoroll-PNG-Pic.png",
    ],
  },
  {
    name: "Pompompurin",
    images: [
      "https://www.pngall.com/wp-content/uploads/14/Pompompurin.png",
      "https://www.pngall.com/wp-content/uploads/14/Pompompurin-PNG-Image.png",
    ],
  },
  {
    name: "Pochacco",
    images: [
      "https://www.pngall.com/wp-content/uploads/15/Pochacco.png",
      "https://www.pngall.com/wp-content/uploads/15/Pochacco-PNG-Image.png",
    ],
  },
  {
    name: "Keroppi",
    images: [
      "https://www.pngall.com/wp-content/uploads/14/Keroppi-PNG-Image.png",
      "https://www.pngall.com/wp-content/uploads/14/Keroppi-PNG-Photo.png",
    ],
  },
  {
    name: "Badtz-Maru",
    images: [
      "https://www.pngall.com/wp-content/uploads/15/Badtz-Maru.png",
      "https://www.pngall.com/wp-content/uploads/15/Badtz-Maru-PNG-Image.png",
    ],
  },
];

async function downloadAndUpload(url: string, name: string, idx: number): Promise<string> {
  console.log(`  Downloading: ${url}`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "image/*",
    },
  });
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/png";

  const filename = `presets/sanrio-${name.toLowerCase().replace(/\s+/g, "-")}-${idx}-${Date.now()}.png`;
  const blob = await put(filename, buffer, {
    access: "public",
    contentType,
  });
  console.log(`  Uploaded: ${blob.url}`);
  return blob.url;
}

async function main() {
  // 1. 사용자 찾기 (첫 번째 유저 또는 admin)
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("유저가 없습니다. 먼저 회원가입하세요.");
    return;
  }
  console.log(`User: ${user.email} (${user.id})`);

  // 2. 기존 sanrio 그룹 삭제 (재실행 가능하도록)
  const existing = await prisma.characterGroup.findFirst({
    where: { name: "sanrio", userId: user.id },
  });
  if (existing) {
    console.log("기존 sanrio 그룹 발견 — 삭제 후 재생성");
    // 그룹 내 프리셋의 이미지 삭제
    const oldPresets = await prisma.characterPreset.findMany({
      where: { groupId: existing.id },
      select: { id: true },
    });
    for (const p of oldPresets) {
      await prisma.presetImage.deleteMany({ where: { presetId: p.id } });
      await prisma.characterPreset.delete({ where: { id: p.id } });
    }
    await prisma.characterGroup.delete({ where: { id: existing.id } });
  }

  // 3. 그룹 생성
  const group = await prisma.characterGroup.create({
    data: {
      name: "sanrio",
      userId: user.id,
      order: 0,
    },
  });
  console.log(`Group created: ${group.id}`);

  // 4. 각 캐릭터 생성
  for (let i = 0; i < CHARACTERS.length; i++) {
    const char = CHARACTERS[i];
    console.log(`\n[${i + 1}/8] ${char.name}`);

    // 이미지 다운로드 + Blob 업로드
    const blobUrls: string[] = [];
    for (let j = 0; j < char.images.length; j++) {
      try {
        const url = await downloadAndUpload(char.images[j], char.name, j);
        blobUrls.push(url);
      } catch (err) {
        console.error(`  Failed: ${(err as Error).message}`);
      }
    }

    if (blobUrls.length === 0) {
      console.log(`  ⚠ No images downloaded, skipping ${char.name}`);
      continue;
    }

    const alias = `sanrio_${char.name.toLowerCase().replace(/[\s-]+/g, "_")}_${Date.now()}`;

    const preset = await prisma.characterPreset.create({
      data: {
        alias,
        name: char.name,
        userId: user.id,
        groupId: group.id,
        order: i,
        images: {
          create: blobUrls.map((url, idx) => ({
            blobUrl: url,
            mimeType: "image/png",
            order: idx,
          })),
        },
      },
      include: { images: { orderBy: { order: "asc" } } },
    });

    // 대표이미지 = 첫 번째 이미지
    if (preset.images.length > 0) {
      await prisma.characterPreset.update({
        where: { id: preset.id },
        data: { representativeImageId: preset.images[0].id },
      });
    }

    console.log(`  ✓ Created ${char.name} (${preset.images.length} images, rep: ${preset.images[0]?.id})`);
  }

  console.log("\n✅ Sanrio seed complete!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
