import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { findCharacterVoice } from "@/lib/character-voices";
import { getGoogleAccessToken } from "@/lib/platform-ai";

const MAX_TEXT_LENGTH = 240;

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
    const voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : "";
    const voice = findCharacterVoice(voiceId);
    if (!text || !voice) {
      return NextResponse.json({ error: "미리듣기 문장과 음성을 확인해주세요." }, { status: 400 });
    }

    const accessToken = await getGoogleAccessToken();
    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ko-KR", name: voice.voiceId },
        audioConfig: { audioEncoding: "MP3" },
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("Google Cloud TTS error:", response.status, detail.slice(0, 1_000));
      const message = response.status === 403
        ? "Google Cloud Text-to-Speech API 권한을 확인해주세요."
        : "음성 미리듣기를 생성하지 못했습니다.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const result = (await response.json()) as { audioContent?: string };
    if (!result.audioContent) {
      return NextResponse.json({ error: "음성 데이터가 비어 있습니다." }, { status: 502 });
    }
    const audio = Buffer.from(result.audioContent, "base64");
    return new NextResponse(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("TTS preview error:", error);
    return NextResponse.json({ error: "음성 미리듣기를 생성하지 못했습니다." }, { status: 500 });
  }
}
