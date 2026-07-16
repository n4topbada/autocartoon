import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { AuthError, requireAuth } from "@/lib/auth";
import { deleteBlobIfUnreferenced } from "@/lib/blob-references";
import { prisma } from "@/lib/prisma";

function validVoiceConfig(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.length <= 3 && value.every((voice) => {
    if (!voice || typeof voice !== "object" || Array.isArray(voice)) return false;
    const record = voice as Record<string, unknown>;
    return typeof record.label === "string" && typeof record.voiceId === "string";
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const preset = await prisma.characterPreset.findFirst({
      where: {
        id,
        OR: [
          { userId: session.userId },
          { isPublic: true },
          { purchasedBy: { some: { userId: session.userId } } },
        ],
      },
      include: { images: { orderBy: { order: "asc" } } },
    });
    if (!preset) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    return NextResponse.json({ preset });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "캐릭터를 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const preset = await prisma.characterPreset.findFirst({
      where: { id, userId: session.userId },
      select: { id: true },
    });
    if (!preset) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    const body = (await req.json()) as Record<string, unknown>;
    if (body.voiceConfig !== undefined && !validVoiceConfig(body.voiceConfig)) {
      return NextResponse.json({ error: "음성은 label과 voiceId를 포함해 최대 3개까지 저장할 수 있습니다." }, { status: 400 });
    }
    const updateData: Prisma.CharacterPresetUpdateInput = {
        ...(typeof body.name === "string" && body.name.trim()
          ? { name: body.name.trim().slice(0, 80) }
          : {}),
        ...(typeof body.description === "string"
          ? { description: body.description.trim().slice(0, 5_000) }
          : {}),
        ...(body.persona && typeof body.persona === "object"
          ? { persona: body.persona as Prisma.InputJsonValue }
          : {}),
        ...(body.voiceConfig !== undefined
          ? { voiceConfig: body.voiceConfig as Prisma.InputJsonValue }
          : {}),
        ...(typeof body.isDefault === "boolean"
          ? { isDefault: body.isDefault }
          : {}),
    };
    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault === true) {
        await tx.characterPreset.updateMany({
          where: { userId: session.userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.characterPreset.update({
        where: { id },
        data: updateData,
        include: { images: { orderBy: { order: "asc" } } },
      });
    });
    return NextResponse.json({ preset: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "캐릭터 설정을 저장하지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const preset = await prisma.characterPreset.findFirst({
      where: { id, userId: session.userId },
      select: {
        id: true,
        isDefault: true,
        images: { select: { blobUrl: true, thumbnailUrl: true } },
      },
    });
    if (!preset) {
      return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.generationRequest.updateMany({
        where: { presetId: id },
        data: { presetId: null },
      });
      await tx.purchasedPreset.deleteMany({ where: { presetId: id } });
      await tx.characterPreset.delete({ where: { id } });

      if (preset.isDefault) {
        const replacement = await tx.characterPreset.findFirst({
          where: { userId: session.userId },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          select: { id: true },
        });
        if (replacement) {
          await tx.characterPreset.update({
            where: { id: replacement.id },
            data: { isDefault: true },
          });
        }
      }
    });

    await Promise.all(
      preset.images.flatMap((image) => [
        deleteBlobIfUnreferenced(image.blobUrl),
        deleteBlobIfUnreferenced(image.thumbnailUrl),
      ])
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Character delete error:", error);
    return NextResponse.json({ error: "캐릭터를 삭제하지 못했습니다." }, { status: 500 });
  }
}
