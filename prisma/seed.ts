import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  await prisma.user.upsert({
    where: { email: "wony@wonyframe.com" },
    update: {},
    create: {
      email: "wony@wonyframe.com",
      passwordHash: hash("1234!@#"),
      name: "Wony",
      role: "admin",
      tier: "enterprise",
      credits: 999999,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@wonyframe.com" },
    update: {},
    create: {
      email: "admin@wonyframe.com",
      passwordHash: hash("1234!@#"),
      name: "Admin",
      role: "admin",
      tier: "enterprise",
      credits: 999999,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "n4topbada@gmail.com" },
    update: {},
    create: {
      email: "n4topbada@gmail.com",
      passwordHash: hash("1234!@#$"),
      name: "Bada",
      role: "admin",
      tier: "enterprise",
      credits: 999999,
      emailVerified: true,
    },
  });

  // 기본 캐릭터 프리셋: wony
  const wonyPreset = await prisma.characterPreset.upsert({
    where: { alias: "wony" },
    update: { name: "Wony" },
    create: {
      alias: "wony",
      name: "Wony",
      userId: null, // 시스템 기본 프리셋 (모든 유저에게 표시)
    },
  });

  // 기존 이미지 삭제 후 재등록
  await prisma.presetImage.deleteMany({ where: { presetId: wonyPreset.id } });

  const wonyImages = [
    { file: "으쌰워니.png", mime: "image/png" },
    { file: "타임라인 10003.png", mime: "image/png" },
    { file: "타임라인 10004.png", mime: "image/png" },
    { file: "타임라인 10006.png", mime: "image/png" },
  ];

  for (let i = 0; i < wonyImages.length; i++) {
    await prisma.presetImage.create({
      data: {
        presetId: wonyPreset.id,
        blobUrl: `/presets/wony/${wonyImages[i].file}`,
        mimeType: wonyImages[i].mime,
        order: i,
      },
    });
  }

  console.log(`[OK] wony 기본 프리셋: ${wonyImages.length}개 이미지 등록`);
  console.log("Seed completed!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
