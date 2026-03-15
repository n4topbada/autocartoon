import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  userId: string;
  email: string;
  role: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "autocartoon-fallback-secret-key-32chars!!",
  cookieName: "autocartoon_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax" as const,
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
