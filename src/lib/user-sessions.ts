import { prisma } from "./prisma";

const SESSION_DAYS = 30;
const MAX_DEVICE_SESSIONS = 2;
const TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

export function describeDevice(userAgent: string) {
  const ua = userAgent || "알 수 없는 기기";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad/i.test(ua)
        ? "iOS"
        : /Mac OS|Macintosh/i.test(ua)
          ? "macOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "기기";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /Chrome\//i.test(ua)
      ? "Chrome"
      : /Firefox\//i.test(ua)
        ? "Firefox"
        : /Safari\//i.test(ua)
          ? "Safari"
          : "브라우저";
  return `${os} · ${browser}`;
}

export async function createUserSession(userId: string, userAgent: string) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1_000);
  return prisma.$transaction(async (tx) => {
    await tx.userSession.deleteMany({ where: { userId, expiresAt: { lte: now } } });
    const existing = await tx.userSession.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true },
    });
    const stale = existing.slice(MAX_DEVICE_SESSIONS - 1);
    if (stale.length > 0) {
      await tx.userSession.deleteMany({ where: { id: { in: stale.map((item) => item.id) } } });
    }
    return tx.userSession.create({
      data: {
        userId,
        device: describeDevice(userAgent),
        userAgent: userAgent.slice(0, 1_000),
        expiresAt,
      },
    });
  });
}

export async function validateUserSession(sessionId: string, userId: string) {
  const now = new Date();
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId, expiresAt: { gt: now } },
  });
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await prisma.userSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }
  return session;
}
