import assert from "node:assert/strict";
import test from "node:test";
import type { JobWithArtifacts } from "../src/lib/generation-jobs";
import { jobToResponse } from "../src/lib/generation-jobs";
import { selectCharacterReferenceImages } from "../src/lib/generation-service";
import { buildStylizePrompt } from "../src/lib/background-prompts";
import { normalizePlannedProject } from "../src/lib/project-brief";
import { buildOriginalCharacterPrompt } from "../src/lib/character-creator";
import {
  buildStudioGenerationPrompt,
  normalizeStudioSceneSettings,
} from "../src/lib/studio-scene";

test("single-character generation uses directional references in a stable order", () => {
  const images = [
    { id: "reference", view: "reference", order: 0 },
    { id: "back", view: "back", order: 4 },
    { id: "right", view: "right", order: 3 },
    { id: "front", view: "front", order: 1 },
    { id: "left", view: "left", order: 2 },
  ];

  assert.deepEqual(
    selectCharacterReferenceImages(images, "reference", false).map((image) => image.id),
    ["front", "left", "right", "back"]
  );
});

test("multi-character generation limits each character to its representative", () => {
  const images = [
    { id: "front", view: "front", order: 0 },
    { id: "chosen", view: "right", order: 1 },
  ];

  assert.deepEqual(
    selectCharacterReferenceImages(images, "chosen", true).map((image) => image.id),
    ["chosen"]
  );
});

test("background stylization always carries low-density guardrails", () => {
  const prompt = buildStylizePrompt("따뜻한 오후의 작은 카페");
  assert.match(prompt, /density extremely low/i);
  assert.match(prompt, /Do NOT add any text/i);
  assert.match(prompt, /따뜻한 오후의 작은 카페/);
});

test("original character prompts preserve identity and clean output constraints", () => {
  const prompt = buildOriginalCharacterPrompt({
    name: "하나",
    gender: "여성",
    age: "20대",
    mood: "밝고 친근한",
    hair: "짧은 검은 단발",
    outfit: "노란 재킷",
    style: "현대 한국 웹툰",
    details: "왼쪽 눈 아래 작은 점",
    background: "scene",
  });

  assert.match(prompt, /하나/);
  assert.match(prompt, /왼쪽 눈 아래 작은 점/);
  assert.match(prompt, /배경의 시각적 밀도를 훨씬 낮게/);
  assert.match(prompt, /글자·로고·워터마크·말풍선을 넣지 않는다/);
});

test("job responses expose durable progress and artifacts", () => {
  const now = new Date("2026-07-16T03:00:00.000Z");
  const job: JobWithArtifacts = {
    id: "job-1",
    userId: "user-1",
    projectId: "project-1",
    cutId: "cut-1",
    kind: "video",
    status: "succeeded",
    stage: "completed",
    progress: 100,
    provider: "vertex",
    model: "veo-3.1-fast-generate-001",
    idempotencyKey: "request-1",
    prompt: "A quiet scene",
    input: { durationSeconds: 4 },
    output: { videoCount: 1 },
    error: null,
    runId: "run-1",
    operationName: "operation-1",
    creditSource: "tier",
    creditUnits: 1,
    estimatedCostUsdMicros: null,
    startedAt: now,
    completedAt: now,
    notifiedAt: null,
    createdAt: now,
    updatedAt: now,
    artifacts: [
      {
        id: "artifact-1",
        jobId: "job-1",
        kind: "video",
        blobUrl: "https://example.test/video.mp4",
        thumbnailUrl: null,
        mimeType: "video/mp4",
        metadata: null,
        createdAt: now,
      },
    ],
  };

  const response = jobToResponse(job);
  assert.equal(response.status, "succeeded");
  assert.equal(response.progress, 100);
  assert.equal(response.artifacts[0].mimeType, "video/mp4");
});

test("project brief results are normalized into bounded production cuts", () => {
  const project = normalizePlannedProject({
    title: "  피부 고민 4컷  ",
    summary: "짧은 정보형 툰",
    cuts: [
      {
        title: "도입",
        prompt: "주인공이 거울을 보며 놀라는 장면",
        negativePrompt: "텍스트",
        dialogue: "이게 뭐지?",
        speakerName: "Wony",
        durationMs: 500,
      },
      { title: "빈 컷", prompt: "" },
    ],
  });

  assert.equal(project.title, "피부 고민 4컷");
  assert.equal(project.cuts.length, 1);
  assert.equal(project.cuts[0].durationMs, 2_000);
  assert.equal(project.cuts[0].speakerName, "Wony");
});

test("studio scene settings bound character and reference selections", () => {
  const settings = normalizeStudioSceneSettings({
    cameraAngle: "low",
    gestureLayout: "two",
    backgroundMode: "none",
    characterPresetIds: ["a", "b", "c", "d", "e", "a"],
    referenceAssetIds: ["r1", "r2", "r3", "r4", "r1"],
    characterDirections: { a: "손을 든다", b: 42 },
  });

  assert.deepEqual(settings.characterPresetIds, ["a", "b", "c", "d"]);
  assert.deepEqual(settings.referenceAssetIds, ["r1", "r2", "r3"]);
  assert.deepEqual(settings.characterDirections, { a: "손을 든다" });
});

test("studio prompts preserve angle, background, and per-character direction", () => {
  const prompt = buildStudioGenerationPrompt({
    prompt: "두 사람이 대화한다",
    mode: "gesture",
    settings: normalizeStudioSceneSettings({
      cameraAngle: "over-shoulder",
      gestureLayout: "two",
      backgroundMode: "none",
      characterDirections: { a: "설명한다", b: "고개를 끄덕인다" },
    }),
    characters: [{ id: "a", name: "A" }, { id: "b", name: "B" }],
  });

  assert.match(prompt, /오버 숄더/);
  assert.match(prompt, /순수 흰색 또는 투명/);
  assert.match(prompt, /A: 설명한다/);
  assert.match(prompt, /B: 고개를 끄덕인다/);
});
