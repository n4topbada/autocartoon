import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { importBriefDocument } from "../src/lib/brief-import";

test("imports and normalizes a text brief", async () => {
  const result = await importBriefDocument({
    fileName: "launch-plan.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# Launch\r\n\r\n\r\n\r\n- Hook: hello\u0000\n"),
  });

  assert.equal(result.title, "launch-plan");
  assert.equal(result.content, "# Launch\n\n\n- Hook: hello");
  assert.deepEqual(result.sourceFiles, ["launch-plan.md"]);
  assert.equal(result.truncated, false);
});

test("combines supported documents from a zip archive", async () => {
  const zip = new JSZip();
  zip.file("01-outline.md", "# Outline\nFirst scene");
  zip.file("notes/02-copy.txt", "CTA: 지금 시작");
  zip.file("image.png", Buffer.from([1, 2, 3]));
  const result = await importBriefDocument({
    fileName: "campaign.zip",
    mimeType: "application/zip",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });

  assert.equal(result.sourceFiles.length, 2);
  assert.match(result.content, /## 01-outline\.md/);
  assert.match(result.content, /CTA: 지금 시작/);
});

test("rejects unsupported files", async () => {
  await assert.rejects(
    () => importBriefDocument({ fileName: "brief.exe", buffer: Buffer.from("no") }),
    /PDF, DOCX, ZIP/,
  );
});
