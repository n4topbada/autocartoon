import path from "node:path";
import JSZip from "jszip";

const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 20_000;
const MAX_ZIP_FILES = 30;

const TEXT_EXTENSIONS = new Set([".md", ".markdown", ".txt", ".csv"]);
const HTML_EXTENSIONS = new Set([".html", ".htm"]);
const DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx"]);

export interface BriefImportResult {
  title: string;
  content: string;
  sourceFiles: string[];
  truncated: boolean;
}

function cleanTitle(fileName: string) {
  const base = path.basename(fileName, path.extname(fileName));
  return base.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "가져온 기획서";
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, token: string) => {
    if (token[0] === "#") {
      const hex = token[1]?.toLowerCase() === "x";
      const code = Number.parseInt(token.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    return named[token.toLowerCase()] ?? entity;
  });
}

function htmlToText(value: string) {
  return normalizeText(decodeHtmlEntities(
    value
      .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " ")
  ));
}

async function extractPdf(buffer: Buffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return normalizeText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return normalizeText(result.value);
}

function supportedEntry(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) || HTML_EXTENSIONS.has(extension) || DOCUMENT_EXTENSIONS.has(extension);
}

async function extractOne(fileName: string, buffer: Buffer) {
  const extension = path.extname(fileName).toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return normalizeText(buffer.toString("utf8"));
  if (HTML_EXTENSIONS.has(extension)) return htmlToText(buffer.toString("utf8"));
  if (extension === ".pdf") return extractPdf(buffer);
  if (extension === ".docx") return extractDocx(buffer);
  throw new Error("지원하지 않는 기획 자료 형식입니다.");
}

async function extractZip(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && supportedEntry(entry.name))
    .slice(0, MAX_ZIP_FILES);
  if (entries.length === 0) {
    throw new Error("ZIP 안에서 PDF, DOCX, Markdown, TXT 또는 HTML 문서를 찾지 못했습니다.");
  }

  let expandedBytes = 0;
  const sections: string[] = [];
  const sourceFiles: string[] = [];
  for (const entry of entries) {
    const declaredSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (declaredSize > MAX_UNCOMPRESSED_BYTES || expandedBytes + declaredSize > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("ZIP 압축 해제 크기는 30MB 이하여야 합니다.");
    }
    const fileBuffer = await entry.async("nodebuffer");
    expandedBytes += fileBuffer.length;
    if (expandedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("ZIP 압축 해제 크기는 30MB 이하여야 합니다.");
    }
    const text = await extractOne(entry.name, fileBuffer);
    if (!text) continue;
    sourceFiles.push(entry.name);
    sections.push(`## ${path.basename(entry.name)}\n\n${text}`);
  }
  if (sections.length === 0) throw new Error("ZIP 문서에서 읽을 수 있는 글자를 찾지 못했습니다.");
  return { text: sections.join("\n\n---\n\n"), sourceFiles };
}

export async function importBriefDocument(params: {
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
}): Promise<BriefImportResult> {
  const { fileName, buffer } = params;
  if (!fileName || buffer.length === 0) throw new Error("가져올 파일이 필요합니다.");
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error("기획 자료는 15MB 이하여야 합니다.");

  const extension = path.extname(fileName).toLowerCase();
  let extracted: { text: string; sourceFiles: string[] };
  if (extension === ".zip" || params.mimeType === "application/zip") {
    extracted = await extractZip(buffer);
  } else {
    if (!supportedEntry(fileName)) {
      throw new Error("PDF, DOCX, ZIP, Markdown, TXT 또는 HTML 파일을 선택해주세요.");
    }
    extracted = { text: await extractOne(fileName, buffer), sourceFiles: [path.basename(fileName)] };
  }

  const normalized = normalizeText(extracted.text);
  if (!normalized) throw new Error("문서에서 읽을 수 있는 글자를 찾지 못했습니다.");
  const truncated = normalized.length > MAX_EXTRACTED_CHARACTERS;
  return {
    title: cleanTitle(fileName),
    content: normalized.slice(0, MAX_EXTRACTED_CHARACTERS),
    sourceFiles: extracted.sourceFiles,
    truncated,
  };
}
