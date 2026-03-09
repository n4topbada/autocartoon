import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const ASSETS_DIR = path.join(process.cwd(), "assets");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.log(`assets 디렉토리가 없습니다: ${ASSETS_DIR}`);
    console.log("assets/{캐릭터별칭}/ 구조로 이미지를 추가해주세요.");
    return;
  }

  const entries = fs.readdirSync(ASSETS_DIR, { withFileTypes: true });
  const aliasDirs = entries.filter((e) => e.isDirectory());

  if (aliasDirs.length === 0) {
    console.log("assets/ 하위에 캐릭터 폴더가 없습니다.");
    return;
  }

  for (const dir of aliasDirs) {
    const alias = dir.name;
    const dirPath = path.join(ASSETS_DIR, alias);
    const files = fs
      .readdirSync(dirPath)
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort();

    if (files.length === 0) {
      console.log(`[SKIP] ${alias}: 이미지 파일 없음`);
      continue;
    }

    const preset = await prisma.characterPreset.upsert({
      where: { alias },
      update: { name: alias },
      create: { alias, name: alias },
    });

    // 기존 이미지 삭제 후 재등록
    await prisma.presetImage.deleteMany({ where: { presetId: preset.id } });

    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    };

    for (let i = 0; i < files.length; i++) {
      const filePath = path.join("assets", alias, files[i]);
      const ext = path.extname(files[i]).toLowerCase();
      await prisma.presetImage.create({
        data: {
          presetId: preset.id,
          filePath,
          mimeType: mimeMap[ext] || "image/png",
          order: i,
        },
      });
    }

    console.log(`[OK] ${alias}: ${files.length}개 이미지 등록`);
  }

  console.log("프리셋 import 완료!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
