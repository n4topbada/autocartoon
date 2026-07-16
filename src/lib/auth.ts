import { getSession } from "./session";
import { prisma } from "./prisma";
import { canAccessCharacterDesigner } from "./character-designer-access";
import { headers } from "next/headers";
import { createUserSession, validateUserSession } from "./user-sessions";

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    throw new AuthError("로그인이 필요합니다.", 401);
  }
  if (session.sessionId) {
    const registered = await validateUserSession(session.sessionId, session.userId);
    if (!registered) {
      session.destroy();
      throw new AuthError("로그인 세션이 만료되었거나 다른 기기에서 해제되었습니다.", 401);
    }
  } else {
    const requestHeaders = await headers();
    const registered = await createUserSession(
      session.userId,
      requestHeaders.get("user-agent") || ""
    );
    session.sessionId = registered.id;
    await session.save();
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireAuth();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true },
  });
  if (user?.role !== "admin") {
    throw new AuthError("관리자 권한이 필요합니다.", 403);
  }
  return session;
}

export async function requireCharacterDesigner() {
  const session = await requireAuth();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true },
  });

  if (!user || !canAccessCharacterDesigner(user)) {
    throw new AuthError("캐릭터 설계 기능에 접근할 권한이 없습니다.", 403);
  }

  return user;
}

export async function getCurrentUser() {
  let session;
  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tier: true,
      credits: true,
      tierUsedThisMonth: true,
      tierResetAt: true,
    },
  });
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
