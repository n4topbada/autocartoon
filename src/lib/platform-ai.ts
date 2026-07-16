import type { GoogleGenAI } from "@google/genai";
import type { GoogleAuthOptions } from "google-auth-library";

export type PlatformAIProvider = "vertex" | "gemini-api";

let clientsPromise: Promise<GoogleGenAI[]> | null = null;
let videoClientPromise: Promise<GoogleGenAI> | null = null;

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
  const credentials = parseServiceAccountCredentials();
  if (credentials) return { credentials };

  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccountEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  if (projectNumber && serviceAccountEmail && poolId && providerId) {
    // These modules inspect runtime process state, so load them only inside a request.
    const { ExternalAccountClient } = await import("google-auth-library");
    const { getVercelOidcToken } = await import("@vercel/oidc");
    const authClient = ExternalAccountClient.fromJSON({
      type: "external_account",
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      token_url: "https://sts.googleapis.com/v1/token",
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
      subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    });
    if (!authClient) throw new Error("Could not create a Google auth client from Vercel OIDC");
    return { authClient, projectId: process.env.GOOGLE_CLOUD_PROJECT };
  }

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
  return process.env.VERTEX_IMAGE_MODEL || "gemini-3.1-flash-image-preview";
}

export function getTextModel(): string {
  return process.env.VERTEX_TEXT_MODEL || "gemini-3.1-flash-lite-preview";
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
