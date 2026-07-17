import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_ADMINS = [
  { email: "wony@wonyframe.com", name: "Wony" },
  { email: "admin@wonyframe.com", name: "Admin" },
  { email: "n4topbada@gmail.com", name: "Bada" },
] as const;

function requireSeedAdminPassword() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  const isStrong =
    !!password &&
    password.length >= 16 &&
    Buffer.byteLength(password, "utf8") <= 72 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  if (!isStrong) {
    throw new Error(
      "SEED_ADMIN_PASSWORD is required when creating seed admins and must be 16-72 bytes with upper, lower, number, and symbol characters."
    );
  }

  return password;
}

async function seedAdmins() {
  for (const account of SEED_ADMINS) {
    const existing = await prisma.user.findUnique({
      where: { email: account.email },
      select: { id: true },
    });

    if (existing) {
      console.log(`[SKIP] ${account.email} already exists; password unchanged`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: account.email,
        passwordHash: await bcrypt.hash(requireSeedAdminPassword(), 12),
        name: account.name,
        role: "admin",
        tier: "enterprise",
        credits: 999999,
        emailVerified: true,
      },
    });
    console.log(`[OK] created seed admin ${account.email}`);
  }
}

async function main() {
  await seedAdmins();

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

  // 캐릭터 프리셋: anian (무료, price: 0)
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
