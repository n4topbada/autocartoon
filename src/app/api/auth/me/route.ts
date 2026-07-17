import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  let session;
  try {
    session = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json(null);
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
      kakaoId: true,
      googleId: true,
    },
  });
  if (!user) {
    session.destroy();
    return NextResponse.json(null);
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    credits: user.credits,
    kakaoLinked: Boolean(user.kakaoId),
    googleLinked: Boolean(user.googleId),
    mustChangePassword: session.usedTemporaryPassword === true,
  });
}
