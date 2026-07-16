import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (session.sessionId) {
    await prisma.userSession.deleteMany({ where: { id: session.sessionId } });
  }
  session.destroy();
  return NextResponse.json({ ok: true });
}
