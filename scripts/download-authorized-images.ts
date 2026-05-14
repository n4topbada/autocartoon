import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function getArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function readUrls() {
  const manifest = getArg("manifest");
  const inlineUrls = getArg("urls");

  if (manifest) {
    const text = await readFile(path.resolve(process.cwd(), manifest), "utf8");
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  }

  if (inlineUrls) {
    return inlineUrls
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
  }

  throw new Error("Provide --manifest=path/to/urls.txt or --urls=https://...");
}

function filenameFromUrl(url: string, index: number, mimeType: string) {
  const parsed = new URL(url);
  const basename = path.basename(parsed.pathname);
  const ext = EXT_BY_MIME[mimeType] ?? path.extname(basename) ?? ".jpg";
  const stem = basename.replace(/\.[^.]+$/, "") || `image-${index + 1}`;
  return `${String(index + 1).padStart(2, "0")}-${stem}${ext}`;
}

async function main() {
  const folder = getArg("folder");
  if (!folder) {
    throw new Error("Usage: npm run download:images -- --folder=assets/character --manifest=urls.txt");
  }

  const urls = (await readUrls()).slice(0, 4);
  if (urls.length === 0) throw new Error("No URLs found");

  const outputFolder = path.resolve(process.cwd(), folder);
  await mkdir(outputFolder, { recursive: true });

  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i], {
      headers: { "User-Agent": "AutoCartoon authorized image importer" },
    });
    if (!res.ok) throw new Error(`Failed to download ${urls[i]}: ${res.status}`);

    const contentType = res.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
    if (!EXT_BY_MIME[contentType]) {
      throw new Error(`Unsupported content type for ${urls[i]}: ${contentType || "unknown"}`);
    }

    const filename = filenameFromUrl(urls[i], i, contentType);
    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(path.join(outputFolder, filename), buffer);
    console.log(`saved ${filename}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
