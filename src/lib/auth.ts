import { getSession } from "./session";
import { prisma } from "./prisma";
import { validateUserSession } from "./user-sessions";

export async function requireAuth() {
  const session = await getSession();
  if (!session.userId) {
    throw new AuthError("로그인이 필요합니다.", 401);
  }
  // sessionId가 없는 구버전 쿠키는 기기 세션 레코드와 연결돼 있지 않다.
  // 요청마다 새 기기 세션을 즉석에서 만들면 홈에서 동시에 뜨는 여러 요청이
  // 서로의 세션 행을 삭제하는 경쟁이 생기므로(다른 기기까지 로그아웃),
  // 무효 처리하고 한 번만 깨끗이 재로그인하도록 유도한다.
  if (!session.sessionId) {
    session.destroy();
    throw new AuthError("로그인 세션을 갱신해야 합니다. 다시 로그인해주세요.", 401);
  }
  const registered = await validateUserSession(session.sessionId, session.userId);
  if (!registered) {
    session.destroy();
    throw new AuthError("로그인 세션이 만료되었거나 다른 기기에서 해제되었습니다.", 401);
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
      credits: true,
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
