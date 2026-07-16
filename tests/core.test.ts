import assert from "node:assert/strict";
import test from "node:test";
import type { JobWithArtifacts } from "../src/lib/generation-jobs";
import { jobToResponse } from "../src/lib/generation-jobs";
import { selectCharacterReferenceImages } from "../src/lib/generation-service";
import { buildStylizePrompt } from "../src/lib/background-prompts";

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
