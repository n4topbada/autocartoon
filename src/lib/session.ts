import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

const MIN_SESSION_SECRET_LENGTH = 32;

export interface SessionData {
  userId: string;
  email: string;
  role: string;
  sessionId?: string;
  usedTemporaryPassword?: boolean;
}

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;

  if (!password || password.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be configured with at least ${MIN_SESSION_SECRET_LENGTH} characters.`
    );
  }

  return {
    password,
    cookieName: "autocartoon_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}
