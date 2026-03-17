import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  await prisma.user.upsert({
    where: { email: "wony@wonyframe.com" },
    update: { passwordHash: hash("1234!@#$") },
    create: {
      email: "wony@wonyframe.com",
      passwordHash: hash("1234!@#$"),
      name: "Wony",
      role: "admin",
      tier: "enterprise",
      credits: 999999,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@wonyframe.com" },
    update: { passwordHash: hash("1234!@#$") },
    create: {
      email: "admin@wonyframe.com",
      passwordHash: hash("1234!@#$"),
      name: "Admin",
      role: "admin",
      tier: "enterprise",
      credits: 999999,
      emailVerified: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "n4topbada@gmail.com" },
    update: { passwordHash: hash("1234!@#$") },
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
    update: { name: "Wony", price: 0 },
    create: {
      alias: "wony",
      name: "Wony",
      userId: null, // 시스템 기본 프리셋 (마켓플레이스)
      price: 0, // 무료
    },
  });

  // 기존 이미지 삭제 후 재등록
  await prisma.presetImage.deleteMany({ where: { presetId: wonyPreset.id } });

  const wonyImages = [
    { file: "wony-01.png", mime: "image/png" },
    { file: "wony-02.png", mime: "image/png" },
    { file: "wony-03.png", mime: "image/png" },
    { file: "wony-04.png", mime: "image/png" },
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

  // 모든 기존 유저에게 wony 무료 프리셋 자동 구매 처리
  const allUsers = await prisma.user.findMany({ select: { id: true } });
  for (const u of allUsers) {
    await prisma.purchasedPreset.upsert({
      where: { userId_presetId: { userId: u.id, presetId: wonyPreset.id } },
      update: {},
      create: { userId: u.id, presetId: wonyPreset.id },
    });
  }
  console.log(`[OK] ${allUsers.length}명 유저에게 wony 자동 지급`);

  // 캐릭터 프리셋: anian (1 바나나)
  const anianPreset = await prisma.characterPreset.upsert({
    where: { alias: "anian" },
    update: { name: "Anian", price: 0 },
    create: {
      alias: "anian",
      name: "Anian",
      userId: null,
      price: 0,
    },
  });

  await prisma.presetImage.deleteMany({ where: { presetId: anianPreset.id } });

  const anianImages = [
    { file: "Anian_Normal.png", mime: "image/png" },
    { file: "Anian_Happy_01.png", mime: "image/png" },
    { file: "Anian_Angry_01.png", mime: "image/png" },
    { file: "Anian_Angry_02.png", mime: "image/png" },
    { file: "Anian_Back.png", mime: "image/png" },
  ];

  for (let i = 0; i < anianImages.length; i++) {
    await prisma.presetImage.create({
      data: {
        presetId: anianPreset.id,
        blobUrl: `/presets/anian/${anianImages[i].file}`,
        mimeType: anianImages[i].mime,
        order: i,
      },
    });
  }

  console.log(`[OK] anian 프리셋: ${anianImages.length}개 이미지 등록 (무료)`);

  console.log("Seed completed!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
