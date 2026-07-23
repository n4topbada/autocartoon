import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getGptImageSize } from "../src/lib/image-generation";

test("GPT Image 2 sizes preserve the requested aspect at 1K and 2K", () => {
  assert.equal(getGptImageSize("1K", "1:1"), "1024x1024");
  assert.equal(getGptImageSize("1K", "9:16"), "1024x1824");
  assert.equal(getGptImageSize("2K", "4:5"), "1632x2048");
  assert.equal(getGptImageSize("2K", "16:9"), "2048x1152");
});

test("style reference requests explicitly reserve the first model image", async () => {
  const [characterCreator, gestureGenerator, service, gemini] = await Promise.all([
    readFile("src/components/CharacterCreator.tsx", "utf8"),
    readFile("src/components/GestureGenerator.tsx", "utf8"),
    readFile("src/lib/generation-service.ts", "utf8"),
    readFile("src/lib/gemini.ts", "utf8"),
  ]);
  assert.match(characterCreator, /styleReferenceFirst: true/);
  assert.match(gestureGenerator, /\.\.\.\(styleReference \? \[styleReference\] : \[\]\)/);
  assert.match(service, /priorityImages = input\.styleReferenceFirst/);
  assert.ok(gemini.indexOf("if (req.priorityImages)") < gemini.indexOf("if (req.referenceImages)"));
});
