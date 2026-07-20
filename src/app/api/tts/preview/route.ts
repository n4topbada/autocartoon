import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { findCharacterVoice } from "@/lib/character-voices";
import { AI_CREDIT_COSTS } from "@/lib/credit-products";
import { isCreditError, withCreditCharge } from "@/lib/credit-service";
import { getGoogleAccessToken } from "@/lib/platform-ai";

const MAX_TEXT_LENGTH = 240;

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
    const voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : "";
    const voice = findCharacterVoice(voiceId);
    if (!text || !voice) {
      return NextResponse.json({ error: "미리듣기 문장과 음성을 확인해주세요." }, { status: 400 });
    }

    const audio = await withCreditCharge(
      session.userId,
      { units: AI_CREDIT_COSTS.tts, source: "tts" },
      async () => {
        const accessToken = await getGoogleAccessToken();
        const synthesize = (extraHeaders: Record<string, string>) =>
          fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              ...extraHeaders,
            },
            body: JSON.stringify({
              input: { text },
              voice: { languageCode: "ko-KR", name: voice.voiceId },
              audioConfig: { audioEncoding: "MP3" },
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(50_000),
          });
        let response = await synthesize({});
        // 사용자 ADC(로컬 gcloud)는 quota project 헤더가 없으면 403이 난다.
        // Cloud Run 서비스 계정 경로는 기존과 동일하게 헤더 없이 성공한다.
        const quotaProject = process.env.GOOGLE_CLOUD_PROJECT;
        if (response.status === 403 && quotaProject) {
          response = await synthesize({ "x-goog-user-project": quotaProject });
        }
        if (!response.ok) {
          const detail = await response.text();
          console.error("Google Cloud TTS error:", response.status, detail.slice(0, 1_000));
          throw new Error(
            response.status === 403
              ? "Google Cloud Text-to-Speech API 권한을 확인해주세요."
              : "음성 미리듣기를 생성하지 못했습니다."
          );
        }
        const result = (await response.json()) as { audioContent?: string };
        if (!result.audioContent) throw new Error("음성 데이터가 비어 있습니다.");
        return Buffer.from(result.audioContent, "base64");
      }
    );

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
    if (isCreditError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("TTS preview error:", error);
    return NextResponse.json({ error: "음성 미리듣기를 생성하지 못했습니다." }, { status: 500 });
  }
}
