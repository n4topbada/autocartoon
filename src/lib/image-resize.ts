/**
 * 클라이언트 이미지 리사이즈 + URL fetch 유틸리티
 * Canvas API로 max 1024px 리사이즈 (비율 유지)
 */

export interface ResizedImage {
  base64: string;
  mimeType: string;
  preview: string; // data URL
}

/**
 * base64 이미지를 maxSize 이내로 리사이즈
 */
export function resizeImageBase64(
  base64: string,
  mimeType: string,
  maxSize: number = 1024
): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // 리사이즈 필요 없으면 그대로 반환
      if (width <= maxSize && height <= maxSize) {
        const preview = `data:${mimeType};base64,${base64}`;
        resolve({ base64, mimeType, preview });
        return;
      }

      // 비율 유지하며 축소
      if (width > height) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      const outMime = mimeType === "image/png" ? "image/png" : "image/jpeg";
      const quality = outMime === "image/jpeg" ? 0.9 : undefined;
      const dataUrl = canvas.toDataURL(outMime, quality);
      const outBase64 = dataUrl.split(",")[1];

      resolve({ base64: outBase64, mimeType: outMime, preview: dataUrl });
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

/**
 * data URL에서 base64 + mimeType 추출 후 리사이즈
 */
export async function resizeFromDataUrl(
  dataUrl: string,
  maxSize: number = 1024
): Promise<ResizedImage> {
  const [header, base64] = dataUrl.split(",");
  const mimeType = header.match(/data:(.*?);/)?.[1] || "image/png";
  return resizeImageBase64(base64, mimeType, maxSize);
}

/**
 * File → 리사이즈된 이미지
 */
export function resizeFromFile(
  file: File,
  maxSize: number = 1024
): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = await resizeFromDataUrl(reader.result as string, maxSize);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });
}

/**
 * URL에서 이미지 fetch → base64 → 리사이즈
 * CORS 문제가 있을 수 있으므로 프록시 없이 img 태그로 로드
 */
export function fetchImageFromUrl(
  url: string,
  maxSize: number = 1024
): Promise<ResizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;

      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = "image/png";
      const dataUrl = canvas.toDataURL(mimeType);
      const base64 = dataUrl.split(",")[1];

      resolve({ base64, mimeType, preview: dataUrl });
    };
    img.onerror = () => reject(new Error("URL 이미지 로드 실패 (CORS 제한일 수 있음)"));
    img.src = url;
  });
}
