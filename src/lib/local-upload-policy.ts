type UploadRule = {
  maxBytes: number;
  extensionsByMime: Record<string, string>;
};

const LOCAL_UPLOAD_RULES: Record<string, UploadRule> = {
  edited: {
    maxBytes: 20 * 1024 * 1024,
    extensionsByMime: { "image/png": ".png" },
  },
  "studio-assets": {
    maxBytes: 100 * 1024 * 1024,
    extensionsByMime: {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "video/mp4": ".mp4",
    },
  },
  shorts: {
    maxBytes: 200 * 1024 * 1024,
    extensionsByMime: { "video/mp4": ".mp4" },
  },
};

const GENERATED_FILENAME = /^\d{10,}-[a-z0-9]{6}\.[a-z0-9]+$/;

export type LocalUploadPolicyResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 413; error: string };

export function validateLocalUploadRequest(params: {
  objectPath: string;
  userId: string;
  mimeType: string;
  sizeBytes: number;
}): LocalUploadPolicyResult {
  const { objectPath, userId, mimeType, sizeBytes } = params;
  const segments = objectPath.split("/");
  if (
    segments.length !== 4 ||
    segments[0] !== "u" ||
    segments[1] !== userId ||
    !GENERATED_FILENAME.test(segments[3])
  ) {
    return { ok: false, status: 403, error: "허용되지 않은 업로드 경로입니다." };
  }

  const rule = LOCAL_UPLOAD_RULES[segments[2]];
  const expectedExtension = rule?.extensionsByMime[mimeType];
  if (!rule || !expectedExtension || !segments[3].endsWith(expectedExtension)) {
    return { ok: false, status: 400, error: "지원하지 않는 업로드 형식입니다." };
  }
  if (sizeBytes > rule.maxBytes) {
    return { ok: false, status: 413, error: "파일이 너무 큽니다." };
  }
  return { ok: true };
}
