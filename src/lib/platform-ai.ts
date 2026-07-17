import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from "@google/genai";
import type { GoogleAuthOptions } from "google-auth-library";

export type PlatformAIProvider = "vertex" | "gemini-api";

let clientsPromise: Promise<GoogleGenAI[]> | null = null;
let videoClientPromise: Promise<GoogleGenAI> | null = null;

const MODEL_ALIASES: Record<string, string> = {
  "gemini-3.1-flash-lite-preview": "gemini-3.1-flash-lite",
  "gemini-3.1-flash-image-preview": "gemini-3.1-flash-image",
};

function normalizeModelId(model: string) {
  return MODEL_ALIASES[model] || model;
}

function parseServiceAccountCredentials(): Record<string, unknown> | undefined {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return undefined;

  try {
    const credentials = JSON.parse(raw) as Record<string, unknown>;
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("client_email or private_key is missing");
    }
    return credentials;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid GOOGLE_SERVICE_ACCOUNT_JSON: ${message}`);
  }
}

async function getGoogleAuthOptions(): Promise<GoogleAuthOptions> {
  // 서비스계정 JSON(비상/특수 환경)만 명시 처리하고, 그 외에는 ADC를 사용한다.
  // Cloud Run/로컬 모두 붙은 서비스계정 또는 gcloud ADC로 인증된다(키 파일 불필요).
  const credentials = parseServiceAccountCredentials();
  if (credentials) return { credentials };
  return {};
}

export async function getGoogleCloudAuthConfig() {
  return {
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    googleAuthOptions: await getGoogleAuthOptions(),
  };
}

export async function getGoogleAccessToken(): Promise<string> {
  const options = await getGoogleAuthOptions();
  let authClient = options.authClient;

  if (!authClient) {
    const { GoogleAuth } = await import("google-auth-library");
    authClient = await new GoogleAuth({
      ...options,
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    }).getClient();
  }

  const accessToken = await authClient.getAccessToken();
  const token = typeof accessToken === "string" ? accessToken : accessToken.token;
  if (!token) throw new Error("Could not obtain a Google Cloud access token");
  return token;
}

async function createClients(): Promise<GoogleGenAI[]> {
  const { GoogleGenAI: GoogleGenAIClient } = await import("@google/genai");
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const provider = process.env.PLATFORM_AI_PROVIDER;
  const shouldUseVertex = provider === "vertex" || Boolean(project);

  if (shouldUseVertex) {
    if (!project) {
      throw new Error("GOOGLE_CLOUD_PROJECT is required for Vertex AI");
    }

    const googleAuthOptions = await getGoogleAuthOptions();
    return [
      new GoogleGenAIClient({
        vertexai: true,
        project,
        location: process.env.GOOGLE_CLOUD_LOCATION || "global",
        ...(Object.keys(googleAuthOptions).length ? { googleAuthOptions } : {}),
      }),
    ];
  }

  const apiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_FALLBACK,
  ].filter((value): value is string => Boolean(value));

  if (apiKeys.length === 0) {
    throw new Error("Platform AI credentials are not configured");
  }

  return apiKeys.map((apiKey) => new GoogleGenAIClient({ apiKey }));
}

export function getPlatformAIClients(): Promise<GoogleGenAI[]> {
  if (!clientsPromise) clientsPromise = createClients();
  return clientsPromise;
}

export async function getPlatformAIClient(): Promise<GoogleGenAI> {
  const clients = await getPlatformAIClients();
  return clients[0];
}

export function getVideoAIClient(): Promise<GoogleGenAI> {
  if (getPlatformAIProvider() !== "vertex") return getPlatformAIClient();
  if (videoClientPromise) return videoClientPromise;

  videoClientPromise = (async () => {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required for Veo");

    const { GoogleGenAI: GoogleGenAIClient } = await import("@google/genai");
    const googleAuthOptions = await getGoogleAuthOptions();
    return new GoogleGenAIClient({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_VIDEO_LOCATION || "us-central1",
      ...(Object.keys(googleAuthOptions).length ? { googleAuthOptions } : {}),
    });
  })();

  return videoClientPromise;
}

export function getPlatformAIProvider(): PlatformAIProvider {
  return process.env.PLATFORM_AI_PROVIDER === "vertex" ||
    Boolean(process.env.GOOGLE_CLOUD_PROJECT)
    ? "vertex"
    : "gemini-api";
}

export function getImageModel(): string {
  return normalizeModelId(
    process.env.VERTEX_IMAGE_MODEL || "gemini-3.1-flash-image"
  );
}

export function getTextModel(): string {
  return getTextModelCandidates()[0];
}

export function getTextModelCandidates(): string[] {
  return Array.from(new Set([
    normalizeModelId(
      process.env.VERTEX_TEXT_MODEL || "gemini-3.1-flash-lite"
    ),
    "gemini-3.1-flash-lite",
    "gemini-3-flash-preview",
    "gemini-2.5-flash-lite",
  ]));
}

function isUnavailableModelError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b404\b|NOT_FOUND|model.+not found|does not have access/i.test(message);
}

export function getPublicPlatformAIError(
  error: unknown,
  fallback = "AI 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요."
) {
  const message = error instanceof Error ? error.message : String(error);

  if (/AbortError|aborted|deadline|timed?\s*out|timeout/i.test(message)) {
    return "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(message)) {
    return "AI 사용량이 일시적으로 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (/\b401\b|\b403\b|UNAUTHENTICATED|PERMISSION_DENIED/i.test(message)) {
    return "AI 서비스 연결 권한을 확인해주세요.";
  }
  if (isUnavailableModelError(error)) {
    return "현재 AI 모델을 사용할 수 없습니다. 관리자에게 알려주세요.";
  }
  if (/credentials?|access token|service account|GOOGLE_CLOUD_PROJECT/i.test(message)) {
    return "AI 서비스 연결 설정을 확인해주세요.";
  }
  return fallback;
}

export async function generatePlatformTextContent(
  parameters: Omit<GenerateContentParameters, "model">
): Promise<GenerateContentResponse> {
  const clients = await getPlatformAIClients();
  let lastError: unknown;

  for (const model of getTextModelCandidates()) {
    let modelUnavailable = false;
    for (const [index, client] of clients.entries()) {
      try {
        return await client.models.generateContent({ ...parameters, model });
      } catch (error) {
        lastError = error;
        modelUnavailable = isUnavailableModelError(error);
        console.warn(`Platform text model attempt failed (${model}):`, error);
        if (!modelUnavailable && index === clients.length - 1) throw error;
      }
    }
    if (!modelUnavailable) break;
  }

  throw lastError ?? new Error("No platform text model is available");
}

export function getVideoModel(): string {
  return process.env.VERTEX_VIDEO_MODEL || "veo-3.1-fast-generate-001";
}

export function getVideoOutputGcsUri(jobId: string): string | undefined {
  const configured = process.env.VERTEX_VIDEO_OUTPUT_GCS_URI?.replace(/\/+$/, "");
  return configured ? `${configured}/${jobId}` : undefined;
}

export function getPlatformAIInfo() {
  return {
    provider: getPlatformAIProvider(),
    projectConfigured: Boolean(process.env.GOOGLE_CLOUD_PROJECT),
    location: process.env.GOOGLE_CLOUD_LOCATION || "global",
    videoLocation: process.env.GOOGLE_CLOUD_VIDEO_LOCATION || "us-central1",
    imageModel: getImageModel(),
    textModel: getTextModel(),
    videoModel: getVideoModel(),
    videoOutputConfigured: Boolean(process.env.VERTEX_VIDEO_OUTPUT_GCS_URI),
  };
}
