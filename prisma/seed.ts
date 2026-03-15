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

  console.log("Seed completed!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
