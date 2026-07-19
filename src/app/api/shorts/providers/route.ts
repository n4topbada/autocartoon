import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { AI_CREDIT_COSTS, getGenerationCreditCost } from "@/lib/credit-products";
import {
  getAllowedVideoDurations,
  getVideoProviderModel,
  isVideoProviderConfigured,
  type VideoProvider,
} from "@/lib/video-providers";

export async function GET() {
  try {
    await requireAuth();
    const providers: VideoProvider[] = ["veo", "seedance"];
    return NextResponse.json({
      promptCreditCost: AI_CREDIT_COSTS.videoPrompt,
      providers: providers.map((provider) => ({
        id: provider,
        label: provider === "veo" ? "Veo" : "Seedance",
        configured: isVideoProviderConfigured(provider),
        durations: getAllowedVideoDurations(provider),
        resolutions: ["720p", "1080p"],
        models: {
          "720p": getVideoProviderModel(provider, "720p"),
          "1080p": getVideoProviderModel(provider, "1080p"),
        },
        creditExamples: {
          "4s720p": getGenerationCreditCost("video", {
            provider,
            durationSeconds: 4,
            resolution: "720p",
            generateAudio: true,
          }),
          "8s1080p": getGenerationCreditCost("video", {
            provider,
            durationSeconds: 8,
            resolution: "1080p",
            generateAudio: true,
          }),
        },
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "영상 공급자 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
