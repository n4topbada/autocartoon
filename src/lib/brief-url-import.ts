import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { Agent, buildConnector, fetch } from "undici";
import { importBriefDocument, type BriefImportResult } from "./brief-import";

const MAX_REMOTE_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const LOCAL_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];
const SUPPORTED_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".zip",
  ".md",
  ".markdown",
  ".txt",
  ".csv",
  ".html",
  ".htm",
]);
const SUPPORTED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/octet-stream",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
]);

function isPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return false;
  }
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  const mapped = normalized.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mapped) return isPublicIpv4(mapped);
  if (normalized === "::" || normalized === "::1") return false;
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first >= 0xfc00 && first <= 0xfdff) return false;
  if (first >= 0xfe80 && first <= 0xfebf) return false;
  if (first >= 0xff00) return false;
  if (normalized.startsWith("2001:db8:")) return false;
  return true;
}

export function isPublicNetworkAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function validateUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("올바른 http 또는 https 주소를 입력해주세요.");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password) {
    throw new Error("로그인 정보가 없는 http 또는 https 주소만 사용할 수 있습니다.");
  }
  const expectedPort = url.protocol === "https:" ? "443" : "80";
  if (url.port && url.port !== expectedPort) {
    throw new Error("자료 URL은 표준 웹 포트만 사용할 수 있습니다.");
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    LOCAL_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("공개 인터넷 자료 주소만 사용할 수 있습니다.");
  }
  return url;
}

async function resolvePublicAddress(url: URL) {
  const literalFamily = isIP(url.hostname);
  const addresses = literalFamily
    ? [{ address: url.hostname, family: literalFamily }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  const publicAddresses = addresses.filter((entry) => isPublicNetworkAddress(entry.address));
  if (publicAddresses.length === 0) {
    throw new Error("공개 인터넷에서 접근 가능한 자료 주소만 사용할 수 있습니다.");
  }
  return publicAddresses.sort((left, right) => left.family - right.family)[0];
}

function inferredFileName(url: URL, contentType: string) {
  let name = "";
  try {
    name = path.posix.basename(decodeURIComponent(url.pathname));
  } catch {
    name = path.posix.basename(url.pathname);
  }
  name = name || url.hostname;
  if (SUPPORTED_EXTENSIONS.has(path.extname(name).toLowerCase())) return name;

  const extension = contentType === "application/pdf"
    ? ".pdf"
    : contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ? ".docx"
      : contentType === "application/zip"
        ? ".zip"
        : contentType === "text/markdown"
          ? ".md"
          : contentType === "text/csv"
            ? ".csv"
            : contentType === "text/plain"
              ? ".txt"
              : ".html";
  return `${name}${extension}`;
}

async function fetchPinned(url: URL) {
  const resolved = await resolvePublicAddress(url);
  const connector = buildConnector({ timeout: 5_000 });
  const dispatcher = new Agent({
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    maxResponseSize: MAX_REMOTE_BYTES,
    connect(options, callback) {
      connector({
        ...options,
        hostname: resolved.address,
        host: resolved.address,
        servername: url.hostname,
      }, callback);
    },
  });

  try {
    const response = await fetch(url, {
      dispatcher,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "text/html,text/plain,text/markdown,text/csv,application/pdf,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "User-Agent": "WONY-AutoCartoon-Brief-Importer/1.0",
      },
    });
    return { response, dispatcher };
  } catch (error) {
    await dispatcher.close().catch(() => undefined);
    throw error;
  }
}

export async function importBriefFromUrl(value: string): Promise<BriefImportResult & { sourceUrl: string }> {
  let current = validateUrl(value.trim());

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const { response, dispatcher } = await fetchPinned(current);
    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) {
          throw new Error("자료 URL의 리다이렉트가 너무 많거나 올바르지 않습니다.");
        }
        await response.body?.cancel();
        current = validateUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`자료를 가져오지 못했습니다. (HTTP ${response.status})`);

      const declaredSize = Number(response.headers.get("content-length") || 0);
      if (declaredSize > MAX_REMOTE_BYTES) throw new Error("URL 자료는 15MB 이하여야 합니다.");
      const contentType = (response.headers.get("content-type") || "text/html")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      const sourceExtension = path.extname(current.pathname).toLowerCase();
      if (!SUPPORTED_CONTENT_TYPES.has(contentType) && !SUPPORTED_EXTENSIONS.has(sourceExtension)) {
        throw new Error("URL에서는 PDF, DOCX, ZIP, Markdown, TXT, CSV 또는 HTML 자료만 가져올 수 있습니다.");
      }
      const bytes = Buffer.from(await response.bytes());
      if (bytes.length > MAX_REMOTE_BYTES) throw new Error("URL 자료는 15MB 이하여야 합니다.");

      const result = await importBriefDocument({
        fileName: inferredFileName(current, contentType),
        mimeType: contentType,
        buffer: bytes,
      });
      return { ...result, sourceUrl: current.toString() };
    } finally {
      await dispatcher.close().catch(() => undefined);
    }
  }

  throw new Error("자료 URL을 가져오지 못했습니다.");
}
