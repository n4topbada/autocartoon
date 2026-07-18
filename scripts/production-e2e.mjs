import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const baseUrl = (process.env.E2E_BASE_URL || "").replace(/\/$/, "");
const primaryEmail = process.env.E2E_EMAIL || "";
const primaryPassword = process.env.E2E_PASSWORD || "";
const secondaryEmail = process.env.E2E_SECONDARY_EMAIL || "";
const secondaryPassword = process.env.E2E_SECONDARY_PASSWORD || "";
const runId = process.env.E2E_RUN_ID || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const reportPath = process.env.E2E_REPORT || path.join(process.cwd(), `.e2e-${runId}.json`);
const imageTimeoutMs = Number(process.env.E2E_IMAGE_TIMEOUT_MS || 12 * 60_000);
const videoTimeoutMs = Number(process.env.E2E_VIDEO_TIMEOUT_MS || 40 * 60_000);

if (process.env.E2E_ALLOW_PAID !== "true") {
  throw new Error("E2E_ALLOW_PAID=true is required because this runner invokes paid production AI services.");
}

for (const [name, value] of Object.entries({
  E2E_BASE_URL: baseUrl,
  E2E_EMAIL: primaryEmail,
  E2E_PASSWORD: primaryPassword,
  E2E_SECONDARY_EMAIL: secondaryEmail,
  E2E_SECONDARY_PASSWORD: secondaryPassword,
})) {
  if (!value) throw new Error(`${name} is required`);
}

class HttpClient {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }

  updateCookies(headers) {
    const values = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      if (cookieValue) this.cookies.set(name, cookieValue);
      else this.cookies.delete(name);
    }
  }

  async request(resource, options = {}) {
    const url = resource.startsWith("http") ? resource : `${baseUrl}${resource}`;
    const headers = new Headers(options.headers || {});
    if (this.cookies.size > 0 && !headers.has("cookie")) {
      headers.set("cookie", [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    }
    let body = options.body;
    if (options.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(options.json);
    }
    const started = Date.now();
    const response = await fetch(url, {
      method: options.method || (body === undefined ? "GET" : "POST"),
      headers,
      body,
      redirect: options.redirect || "manual",
      signal: AbortSignal.timeout(options.timeoutMs || 65_000),
    });
    this.updateCookies(response.headers);
    const contentType = response.headers.get("content-type") || "";
    let data;
    if (options.binary) {
      data = Buffer.from(await response.arrayBuffer());
    } else if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
    } else {
      data = await response.text();
    }
    return {
      status: response.status,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries()),
      data,
      elapsedMs: Date.now() - started,
      url,
    };
  }
}

const primary = new HttpClient("primary");
const secondary = new HttpClient("secondary");
const anonymous = new HttpClient("anonymous");
const state = {};
const report = {
  runId,
  baseUrl,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  summary: null,
  checks: [],
  state: {},
};

function assert(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    if (details !== undefined) error.details = details;
    throw error;
  }
}

function expectStatus(response, ...statuses) {
  assert(
    statuses.includes(response.status),
    `Expected HTTP ${statuses.join("/")}, received ${response.status}`,
    response.data,
  );
  return response;
}

function compact(value) {
  if (Buffer.isBuffer(value)) return { bytes: value.length };
  if (typeof value === "string") return value.length > 800 ? `${value.slice(0, 800)}...` : value;
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "string" && item.length > 1_000) return `${item.slice(0, 1_000)}...`;
    return item;
  }));
}

async function persist() {
  report.state = compact(state);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function check(name, fn) {
  const startedAt = new Date();
  process.stdout.write(`\n[E2E] ${name}\n`);
  try {
    const value = await fn();
    report.checks.push({
      name,
      status: "passed",
      startedAt: startedAt.toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      details: compact(value),
    });
    process.stdout.write(`[PASS] ${name}\n`);
    await persist();
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.checks.push({
      name,
      status: "failed",
      startedAt: startedAt.toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      error: message,
      details: compact(error?.details),
    });
    process.stdout.write(`[FAIL] ${name}: ${message}\n`);
    await persist();
    return null;
  }
}

function requireState(key) {
  assert(state[key], `Required state is missing: ${key}`);
  return state[key];
}

async function credits(client = primary) {
  const response = expectStatus(await client.request("/api/credits"), 200);
  return response.data;
}

async function waitForJob(client, jobId, timeoutMs) {
  const started = Date.now();
  let previous = "";
  while (Date.now() - started < timeoutMs) {
    const response = expectStatus(await client.request(`/api/jobs/${jobId}`, { timeoutMs: 70_000 }), 200);
    const job = response.data?.job;
    assert(job?.id === jobId, "Job response does not match the requested job", response.data);
    const marker = `${job.status}:${job.stage}:${job.progress}`;
    if (marker !== previous) {
      process.stdout.write(`[JOB ${jobId}] ${marker}\n`);
      previous = marker;
    }
    if (["succeeded", "failed", "canceled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, job.kind === "video" ? 15_000 : 5_000));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function runImageGeneration(name, body, expectedCost, options = {}) {
  return check(name, async () => {
    const before = await credits();
    const idempotencyKey = `e2e-${runId}-${options.key || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const first = expectStatus(await primary.request("/api/generate", {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      json: body,
      timeoutMs: 90_000,
    }), 202);
    const jobId = first.data?.job?.id;
    assert(jobId, "Generation request did not return a job id", first.data);
    if (options.verifyIdempotency) {
      const duplicate = expectStatus(await primary.request("/api/generate", {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        json: body,
        timeoutMs: 90_000,
      }), 202);
      assert(duplicate.data?.deduplicated === true, "Duplicate request was not marked as deduplicated", duplicate.data);
      assert(duplicate.data?.job?.id === jobId, "Duplicate request created a different job", duplicate.data);
    }
    const job = await waitForJob(primary, jobId, imageTimeoutMs);
    const after = await credits();
    if (job.status === "succeeded") {
      assert(before.balance - after.balance === expectedCost, "Unexpected credit charge", {
        before: before.balance,
        after: after.balance,
        expectedCost,
        job,
      });
      assert(job.artifacts?.length > 0, "Succeeded image job has no artifacts", job);
    } else {
      assert(after.balance === before.balance, "Failed job did not refund its credit reservation", {
        before: before.balance,
        after: after.balance,
        job,
      });
      throw Object.assign(new Error(`Generation job failed: ${job.error || job.stage}`), { details: job });
    }
    return { before: before.balance, after: after.balance, job };
  });
}

async function uploadWithTicket(ticket, buffer, mimeType, filename) {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields || {})) form.append(key, String(value));
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const response = await fetch(ticket.url.startsWith("http") ? ticket.url : `${baseUrl}${ticket.url}`, {
    method: "POST",
    body: form,
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  const body = await response.text();
  assert([200, 201, 204].includes(response.status), `Direct upload failed with HTTP ${response.status}`, body);
  return { status: response.status, ref: ticket.ref, objectPath: ticket.objectPath };
}

const robotBuffer = await readFile(path.join(process.cwd(), "public", "robot-wony.png"));
const robotBase64 = robotBuffer.toString("base64");
const robotMeta = await sharp(robotBuffer).metadata();
const maskWidth = robotMeta.width || 512;
const maskHeight = robotMeta.height || 512;
const maskRaw = Buffer.alloc(maskWidth * maskHeight * 4);
for (let y = 0; y < maskHeight; y += 1) {
  for (let x = 0; x < maskWidth; x += 1) {
    const offset = (y * maskWidth + x) * 4;
    const value = x < maskWidth / 2 ? 255 : 0;
    maskRaw[offset] = value;
    maskRaw[offset + 1] = value;
    maskRaw[offset + 2] = value;
    maskRaw[offset + 3] = 255;
  }
}
const maskBuffer = await sharp(maskRaw, { raw: { width: maskWidth, height: maskHeight, channels: 4 } })
  .png()
  .toBuffer();
const maskBase64 = maskBuffer.toString("base64");

await check("Public pages and anonymous auth boundary", async () => {
  const pages = {};
  for (const page of ["/login", "/terms", "/privacy", "/refund"]) {
    const response = await anonymous.request(page, { timeoutMs: 45_000 });
    expectStatus(response, 200);
    pages[page] = { status: response.status, elapsedMs: response.elapsedMs };
  }
  const me = expectStatus(await anonymous.request("/api/auth/me"), 401);
  assert(me.data?.code === "AUTH_REQUIRED", "Anonymous auth response is missing AUTH_REQUIRED", me.data);
  const protectedPage = expectStatus(await anonymous.request("/board"), 302, 307);
  assert(
    protectedPage.headers.location?.includes("/login?returnTo=%2Fboard"),
    "Protected page did not redirect to login with returnTo",
    protectedPage.headers,
  );
  pages["/board"] = { status: protectedPage.status, location: protectedPage.headers.location };
  return pages;
});

await check("Google OAuth entry point", async () => {
  const google = expectStatus(await anonymous.request("/api/auth/google?returnTo=%2Fcredits"), 302, 307);
  const googleLocation = google.headers.location || "";
  assert(googleLocation.includes("accounts.google.com"), "Google OAuth is not configured", { location: googleLocation });
  return { googleLocation };
});

await check("Kakao OAuth entry point", async () => {
  const kakao = expectStatus(await anonymous.request("/api/auth/kakao?returnTo=%2Fcredits"), 302, 307);
  const kakaoLocation = kakao.headers.location || "";
  assert(kakaoLocation.includes("kauth.kakao.com"), "Kakao OAuth is not configured", { location: kakaoLocation });
  return { kakaoLocation };
});

await check("Primary admin login", async () => {
  const login = expectStatus(await primary.request("/api/auth/login", {
    method: "POST",
    json: { email: primaryEmail, password: primaryPassword },
  }), 200);
  const me = expectStatus(await primary.request("/api/auth/me"), 200);
  assert(me.data?.role === "admin", "Primary fixture is not an admin", me.data);
  state.primaryUserId = me.data.id;
  state.primaryStartCredits = me.data.credits;
  return { login: login.data, me: me.data };
});

await check("Secondary user login", async () => {
  const login = expectStatus(await secondary.request("/api/auth/login", {
    method: "POST",
    json: { email: secondaryEmail, password: secondaryPassword },
  }), 200);
  const me = expectStatus(await secondary.request("/api/auth/me"), 200);
  assert(me.data?.role !== "admin", "Secondary fixture unexpectedly has admin access", me.data);
  state.secondaryUserId = me.data.id;
  return { login: login.data, me: me.data };
});

await check("Session, dashboard, and bootstrap reads", async () => {
  const endpoints = [
    "/api/auth/sessions",
    "/api/home/bootstrap",
    "/api/dashboard",
    "/api/announcements?limit=10",
    "/api/notifications",
    "/api/marketplace",
    "/api/archive?page=1&kind=all",
    "/api/studio/projects",
    "/api/studio/briefs",
    "/api/contents",
  ];
  const timings = {};
  for (const endpoint of endpoints) {
    const response = expectStatus(await primary.request(endpoint), 200);
    timings[endpoint] = response.elapsedMs;
  }
  return timings;
});

await check("Admin user management and permission boundary", async () => {
  const users = expectStatus(await primary.request("/api/admin/users"), 200);
  const secondaryUser = users.data.find((user) => user.id === requireState("secondaryUserId"));
  assert(secondaryUser, "Secondary fixture is missing from the admin user list");
  const grant = expectStatus(await primary.request(`/api/admin/users/${secondaryUser.id}`, {
    method: "PATCH",
    json: { addCredits: 1, name: `E2E User ${runId}` },
  }), 200);
  const forbidden = expectStatus(await secondary.request("/api/admin/users"), 403);
  return { grantedBalance: grant.data.credits, forbidden: forbidden.status };
});

await check("Plaza profiles", async () => {
  const adminNickname = `e2ea${runId.slice(-10)}`.slice(0, 20);
  const userNickname = `e2eu${runId.slice(-10)}`.slice(0, 20);
  expectStatus(await primary.request("/api/plaza/profile", { method: "POST", json: { nickname: adminNickname } }), 200);
  expectStatus(await secondary.request("/api/plaza/profile", { method: "POST", json: { nickname: userNickname } }), 200);
  return { adminNickname, userNickname };
});

await check("Character library, tags, and prompt presets", async () => {
  const group = expectStatus(await primary.request("/api/groups", {
    method: "POST",
    json: { name: `E2E Group ${runId}` },
  }), 200);
  state.groupId = group.data.id;
  const preset = expectStatus(await primary.request("/api/presets", {
    method: "POST",
    json: {
      name: `E2E Robot ${runId}`,
      groupId: group.data.id,
      isPublic: false,
      images: [{ base64: robotBase64, mimeType: "image/png", view: "front" }],
    },
    timeoutMs: 120_000,
  }), 200);
  state.presetId = preset.data.id;
  const tag = expectStatus(await primary.request("/api/tags", {
    method: "POST",
    json: { name: `e2e-${runId}`, color: "#147d64" },
  }), 200);
  state.tagId = tag.data.id;
  const promptPreset = expectStatus(await primary.request("/api/prompt-presets", {
    method: "POST",
    json: { text: `E2E production prompt ${runId}` },
  }), 200);
  state.promptPresetId = promptPreset.data.id;
  return { group: group.data, preset: preset.data, tag: tag.data, promptPreset: promptPreset.data };
});

await check("Saved background upload", async () => {
  const background = expectStatus(await primary.request("/api/backgrounds", {
    method: "POST",
    json: { name: `E2E Background ${runId}`, imageData: robotBase64, mimeType: "image/png" },
    timeoutMs: 120_000,
  }), 200);
  state.backgroundId = background.data.id;
  return background.data;
});

await check("Studio project, cuts, and saved brief CRUD", async () => {
  const created = expectStatus(await primary.request("/api/studio/projects", {
    method: "POST",
    json: { title: `E2E Project ${runId}`, description: "Production E2E project", aspectRatio: "9:16" },
  }), 201);
  const project = created.data.project;
  state.projectId = project.id;
  state.cutId = project.cuts[0].id;
  expectStatus(await primary.request(`/api/studio/cuts/${state.cutId}`, {
    method: "PATCH",
    json: {
      title: "Opening cut",
      prompt: "A friendly robot waves in a clean animation studio",
      dialogue: "Production E2E is running.",
      dialoguePlan: [{ id: "line-1", text: "Production E2E is running.", speakerPresetId: requireState("presetId") }],
      speakerPresetId: requireState("presetId"),
      durationMs: 4000,
      scene: { camera: "medium shot", lighting: "soft daylight" },
    },
  }), 200);
  const duplicate = expectStatus(await primary.request(`/api/studio/projects/${project.id}/cuts`, {
    method: "POST",
    json: { sourceCutId: state.cutId, title: "Duplicated cut" },
  }), 201);
  state.secondCutId = duplicate.data.cut.id;
  expectStatus(await primary.request(`/api/studio/projects/${project.id}/cuts`, {
    method: "PATCH",
    json: { orderedIds: [state.secondCutId, state.cutId] },
  }), 200);
  expectStatus(await primary.request(`/api/studio/projects/${project.id}`, {
    method: "PATCH",
    json: { coverCutId: state.cutId, title: `E2E Project Updated ${runId}` },
  }), 200);
  const brief = expectStatus(await primary.request("/api/studio/briefs", {
    method: "POST",
    json: { title: `E2E Brief ${runId}`, content: "A robot discovers that careful testing makes creative work reliable." },
  }), 201);
  state.briefId = brief.data.brief.id;
  const detail = expectStatus(await primary.request(`/api/studio/projects/${project.id}`), 200);
  assert(detail.data.project.cuts.length === 2, "Cut duplication or reorder did not persist", detail.data);
  return { projectId: project.id, cutIds: detail.data.project.cuts.map((cut) => cut.id), briefId: state.briefId };
});

await check("Direct GCS upload and studio asset confirm", async () => {
  const ticket = expectStatus(await primary.request("/api/studio/assets/upload", {
    method: "POST",
    json: { projectId: requireState("projectId"), contentType: "image/png" },
  }), 200).data;
  const upload = await uploadWithTicket(ticket, robotBuffer, "image/png", "e2e-robot.png");
  const confirmed = expectStatus(await primary.request("/api/studio/assets/upload/confirm", {
    method: "POST",
    json: { ref: ticket.ref, projectId: state.projectId, name: `E2E uploaded robot ${runId}` },
    timeoutMs: 120_000,
  }), 200);
  state.uploadedAssetId = confirmed.data.asset.id;
  return { upload, asset: confirmed.data.asset };
});

await check("Canvas save, version history, and restore", async () => {
  const first = expectStatus(await primary.request("/api/images/save", {
    method: "POST",
    json: {
      base64: robotBase64,
      mimeType: "image/png",
      projectId: requireState("projectId"),
      cutId: requireState("cutId"),
      aspectRatio: "9:16",
      operation: "edit",
      canvas: { version: 1, objects: [{ type: "image", name: "robot" }] },
    },
    timeoutMs: 120_000,
  }), 200);
  const second = expectStatus(await primary.request("/api/images/save", {
    method: "POST",
    json: {
      base64: robotBase64,
      mimeType: "image/png",
      projectId: state.projectId,
      cutId: state.cutId,
      aspectRatio: "9:16",
      operation: "cutout",
      canvas: { version: 2, objects: [{ type: "image", name: "robot-cutout" }] },
    },
    timeoutMs: 120_000,
  }), 200);
  const versions = expectStatus(await primary.request(`/api/studio/cuts/${state.cutId}/versions`), 200);
  assert(versions.data.versions.length >= 2, "Canvas version history did not retain both saves", versions.data);
  const restore = expectStatus(await primary.request(
    `/api/studio/cuts/${state.cutId}/versions/${versions.data.versions.at(-1).id}/restore`,
    { method: "POST" },
  ), 200);
  return { first: first.data, second: second.data, versionCount: versions.data.versions.length, restoredCutId: restore.data.cut.id };
});

await check("Gemini support chat", async () => {
  const before = await credits();
  const response = expectStatus(await primary.request("/api/chat", {
    method: "POST",
    json: { message: "Answer in one short sentence: what can this service create?", history: [] },
    timeoutMs: 70_000,
  }), 200);
  const after = await credits();
  assert(typeof response.data.reply === "string" && response.data.reply.length > 3, "Chat returned an empty reply", response.data);
  assert(before.balance - after.balance === 1, "Chat credit charge is incorrect", { before: before.balance, after: after.balance });
  return { reply: response.data.reply, charged: before.balance - after.balance };
});

await check("Gemini character designer structured output", async () => {
  const before = await credits();
  const response = expectStatus(await primary.request("/api/character-designer", {
    method: "POST",
    json: {
      message: "Design a trendy but dependable Korean webtoon robot creator named Test Wony.",
      history: [],
      requestedSections: ["World Rules", "Favorite Memes"],
    },
    timeoutMs: 70_000,
  }), 200);
  const after = await credits();
  assert(Array.isArray(response.data?.sections), "Character designer returned no structured sections", response.data);
  const titles = response.data.sections.map((section) => section.title);
  assert(titles.includes("World Rules") && titles.includes("Favorite Memes"), "Requested dynamic sections are missing", titles);
  assert(before.balance - after.balance === 2, "Character designer credit charge is incorrect", { before: before.balance, after: after.balance });
  state.characterDesign = response.data;
  return { sectionTitles: titles, reply: response.data.reply };
});

await check("Gemini OCR and Google TTS", async () => {
  const before = await credits();
  const ocr = expectStatus(await primary.request("/api/studio/ocr", {
    method: "POST",
    json: { image: { base64: robotBase64, mimeType: "image/png" } },
    timeoutMs: 70_000,
  }), 200);
  const tts = expectStatus(await primary.request("/api/tts/preview", {
    method: "POST",
    json: { text: "Production end to end test completed.", voiceId: "ko-KR-Chirp3-HD-Aoede" },
    binary: true,
    timeoutMs: 70_000,
  }), 200);
  const after = await credits();
  assert(typeof ocr.data.text === "string", "OCR response is malformed", ocr.data);
  assert(Buffer.isBuffer(tts.data) && tts.data.length > 1_000, "TTS response is not a usable MP3", { bytes: tts.data?.length });
  assert(before.balance - after.balance === 2, "OCR and TTS credit charge is incorrect", { before: before.balance, after: after.balance });
  return { ocrText: ocr.data.text, ttsBytes: tts.data.length, charged: before.balance - after.balance };
});

await check("Gemini project creation from brief", async () => {
  const before = await credits();
  const response = expectStatus(await primary.request("/api/studio/projects/from-brief", {
    method: "POST",
    json: {
      title: `E2E AI Project ${runId}`,
      brief: "Create a concise three-cut vertical webtoon where a friendly robot tests an image studio, catches one mistake, and celebrates the fix.",
      aspectRatio: "9:16",
      characterPresetIds: [requireState("presetId")],
    },
    timeoutMs: 70_000,
  }), 201);
  const after = await credits();
  assert(response.data.project?.cuts?.length > 0, "AI project has no planned cuts", response.data);
  assert(before.balance - after.balance === 2, "AI project brief credit charge is incorrect", { before: before.balance, after: after.balance });
  state.aiProjectId = response.data.project.id;
  state.aiProjectCutId = response.data.project.cuts[0].id;
  return { projectId: state.aiProjectId, cutCount: response.data.project.cuts.length, charged: before.balance - after.balance };
});

await check("Gemini video dialogue plan", async () => {
  const before = await credits();
  const response = expectStatus(await primary.request(`/api/studio/projects/${requireState("aiProjectId")}/video-plan`, {
    method: "POST",
    timeoutMs: 70_000,
  }), 200);
  const after = await credits();
  assert(Array.isArray(response.data.plan) && response.data.plan.length > 0, "Video plan returned no cuts", response.data);
  assert(before.balance - after.balance === 2, "Video plan credit charge is incorrect", { before: before.balance, after: after.balance });
  return { plannedCuts: response.data.plan.length, charged: before.balance - after.balance };
});

const characterResult = await runImageGeneration("Vertex character image 2K and idempotency", {
  jobKind: "character",
  presetIds: [],
  mode: "text",
  aspectRatio: "1:1",
  imageSize: "2K",
  prompt: "A polished full-body friendly yellow service robot character, clean modern Korean webtoon style, plain light background, consistent turnaround-ready design",
}, 20, { key: "character-2k", verifyIdempotency: true });
if (characterResult) {
  state.characterJobId = characterResult.job.id;
  state.characterArtifactId = characterResult.job.artifacts[0].id;
  state.characterArtifactUrl = characterResult.job.artifacts[0].blobUrl;
  state.characterImageId = characterResult.job.output?.imageIds?.[0];
}

await check("Save generated character as reusable preset", async () => {
  const imageId = requireState("characterImageId");
  const response = expectStatus(await primary.request("/api/presets/from-generated", {
    method: "POST",
    json: { name: `E2E Generated Robot ${runId}`, description: "Created by production E2E", imageId },
    timeoutMs: 120_000,
  }), 200);
  state.generatedPresetId = response.data.preset.id;
  return response.data.preset;
});

const backgroundResult = await runImageGeneration("Vertex background batch generation", {
  jobKind: "background",
  presetIds: [],
  mode: "text",
  aspectRatio: "16:9",
  imageSize: "1K",
  count: 2,
  prompt: "A very sparse modern animation studio background with wide empty floor and wall areas, only a desk and one monitor, low prop density, soft daylight, no people, no text",
}, 20, { key: "background-batch" });
if (backgroundResult) {
  state.backgroundJobId = backgroundResult.job.id;
  state.backgroundArtifactId = backgroundResult.job.artifacts[0].id;
  state.backgroundArtifactUrl = backgroundResult.job.artifacts[0].blobUrl;
  state.backgroundImageIds = backgroundResult.job.output?.imageIds || [];
}

await check("Save generated background artifact", async () => {
  const response = expectStatus(await primary.request("/api/backgrounds", {
    method: "POST",
    json: { name: `E2E Generated Background ${runId}`, artifactId: requireState("backgroundArtifactId") },
    timeoutMs: 120_000,
  }), 200);
  state.generatedBackgroundId = response.data.id;
  return response.data;
});

const gestureResult = await runImageGeneration("Vertex gesture generation", {
  jobKind: "gesture",
  presetIds: [requireState("generatedPresetId")],
  mode: "text",
  aspectRatio: "1:1",
  imageSize: "1K",
  prompt: "The same robot gives a confident thumbs-up, full body, preserve identity and costume, clean readable silhouette",
}, 10, { key: "gesture" });
if (gestureResult) {
  state.gestureJobId = gestureResult.job.id;
  state.gestureArtifactId = gestureResult.job.artifacts[0].id;
}

const sceneResult = await runImageGeneration("Vertex project scene generation", {
  jobKind: "image",
  presetIds: [requireState("generatedPresetId")],
  mode: "text",
  aspectRatio: "9:16",
  imageSize: "1K",
  prompt: "The robot notices a failed image preview and calmly fixes the settings, vertical Korean webtoon panel, clear storytelling composition, no text",
  backgroundImageId: requireState("generatedBackgroundId"),
  projectId: requireState("projectId"),
  cutId: requireState("cutId"),
  referenceAssetIds: [requireState("uploadedAssetId")],
}, 10, { key: "project-scene" });
if (sceneResult) {
  state.sceneJobId = sceneResult.job.id;
  state.sceneArtifactId = sceneResult.job.artifacts[0].id;
  state.sceneArtifactUrl = sceneResult.job.artifacts[0].blobUrl;
  state.sceneImageId = sceneResult.job.output?.imageIds?.[0];
}

const sketchResult = await runImageGeneration("Vertex sketch-to-image mode", {
  jobKind: "image",
  presetIds: [requireState("generatedPresetId")],
  mode: "sketch",
  aspectRatio: "1:1",
  imageSize: "1K",
  prompt: "Turn the reference layout into a clean webtoon illustration of the robot waving, preserve the character design, no text",
  inputImage: { base64: robotBase64, mimeType: "image/png" },
}, 10, { key: "sketch" });
if (sketchResult) state.sketchJobId = sketchResult.job.id;

const transformResult = await runImageGeneration("Vertex style transform mode", {
  jobKind: "image",
  presetIds: [requireState("generatedPresetId")],
  mode: "transform",
  aspectRatio: "1:1",
  imageSize: "1K",
  prompt: "Transform the reference into a polished flat-color Korean webtoon panel while preserving the robot identity and pose, no text",
  inputImage: { base64: robotBase64, mimeType: "image/png" },
}, 10, { key: "transform" });
if (transformResult) state.transformJobId = transformResult.job.id;

const editResult = await runImageGeneration("Vertex manual masked edit mode", {
  jobKind: "image",
  presetIds: [],
  mode: "edit",
  aspectRatio: "1:1",
  imageSize: "1K",
  prompt: "Add a small modern tool cart only inside the editable region while keeping the robot and all other pixels visually consistent",
  inputImage: { base64: robotBase64, mimeType: "image/png" },
  editRegionMode: "manual",
  editMask: { base64: maskBase64, mimeType: "image/png" },
  preserveOutsideMask: true,
}, 10, { key: "manual-edit" });
if (editResult) {
  state.editJobId = editResult.job.id;
  state.editArtifactUrl = editResult.job.artifacts[0].blobUrl;
}

await check("Opaque manual mask preserves protected pixels", async () => {
  const gateway = expectStatus(await primary.request(requireState("editArtifactUrl"), {
    redirect: "manual",
    timeoutMs: 90_000,
  }), 302, 307);
  const signedUrl = gateway.headers.location;
  assert(signedUrl, "Media gateway did not return a signed artifact URL", gateway.headers);
  const downloaded = await fetch(new URL(signedUrl, baseUrl), {
    signal: AbortSignal.timeout(90_000),
  });
  assert(downloaded.ok, `Signed edit artifact download failed with HTTP ${downloaded.status}`);
  const resultBuffer = Buffer.from(await downloaded.arrayBuffer());
  const source = await sharp(robotBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const result = await sharp(resultBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert(
    source.info.width === result.info.width && source.info.height === result.info.height,
    "Masked edit changed the source dimensions",
    { source: source.info, result: result.info },
  );

  let protectedChangedValues = 0;
  let protectedChangedPixels = 0;
  let editableChangedPixels = 0;
  for (let y = 0; y < source.info.height; y += 1) {
    for (let x = 0; x < source.info.width; x += 1) {
      const offset = (y * source.info.width + x) * 4;
      let changed = false;
      for (let channel = 0; channel < 4; channel += 1) {
        if (source.data[offset + channel] !== result.data[offset + channel]) {
          changed = true;
          if (x >= source.info.width / 2) protectedChangedValues += 1;
        }
      }
      if (!changed) continue;
      if (x >= source.info.width / 2) protectedChangedPixels += 1;
      else editableChangedPixels += 1;
    }
  }

  assert(protectedChangedValues === 0, "Opaque black mask pixels were modified", {
    protectedChangedValues,
    protectedChangedPixels,
    editableChangedPixels,
  });
  return {
    width: source.info.width,
    height: source.info.height,
    protectedChangedValues,
    protectedChangedPixels,
    editableChangedPixels,
  };
});

await check("Generated image metadata, content slots, and IDOR boundary", async () => {
  const imageIds = [requireState("characterImageId"), requireState("sceneImageId")];
  const favorite = expectStatus(await primary.request(`/api/images/${imageIds[0]}`, {
    method: "PATCH",
    json: { favorite: true },
  }), 200);
  assert(favorite.data.favorite === true, "Favorite flag was not persisted", favorite.data);
  const tag = expectStatus(await primary.request(`/api/images/${imageIds[0]}/tags`, {
    method: "POST",
    json: { tagId: requireState("tagId") },
  }), 200);
  assert(tag.data.action === "added", "Tag was not attached", tag.data);
  const content = expectStatus(await primary.request("/api/contents", {
    method: "POST",
    json: { title: `E2E Content ${runId}` },
  }), 200);
  state.contentId = content.data.id;
  for (const [order, imageId] of imageIds.entries()) {
    expectStatus(await primary.request(`/api/contents/${content.data.id}/slots`, {
      method: "POST",
      json: { imageId, order },
    }), 200);
  }
  const list = expectStatus(await primary.request("/api/contents"), 200);
  const listed = list.data.find((item) => item.id === content.data.id);
  assert(listed?.slotCount === 2, "Content list reports the wrong slot count", listed);
  const detail = expectStatus(await primary.request(`/api/contents/${content.data.id}`), 200);
  assert(detail.data.slots.length === 2, "Content detail reports the wrong slots", detail.data);
  const forbidden = expectStatus(await secondary.request(`/api/contents/${content.data.id}`), 403);
  return { favorite: favorite.data, tag: tag.data, listItem: listed, forbidden: forbidden.status };
});

await check("Private media gateway blocks another user", async () => {
  const resource = requireState("sceneArtifactUrl");
  const response = await secondary.request(resource);
  expectStatus(response, 403);
  return { status: response.status, resource };
});

await check("Board post, public media, likes, comments, and reports", async () => {
  const post = expectStatus(await primary.request("/api/board", {
    method: "POST",
    json: {
      title: `[E2E ${runId}] Generated scene verification`,
      content: "Temporary production E2E post. This will be removed after verification.",
      imageIds: [requireState("sceneImageId")],
      links: [baseUrl],
    },
  }), 201);
  state.postId = post.data.id;
  const like = expectStatus(await secondary.request(`/api/board/${post.data.id}/like`, { method: "POST" }), 200);
  assert(like.data.liked === true, "Post like did not turn on", like.data);
  const comment = expectStatus(await secondary.request(`/api/board/${post.data.id}/comments`, {
    method: "POST",
    json: { content: `E2E comment ${runId}` },
  }), 201);
  state.commentId = comment.data.id;
  const commentLike = expectStatus(await primary.request(`/api/board/${post.data.id}/comments/${comment.data.id}/like`, { method: "POST" }), 200);
  assert(commentLike.data.liked === true, "Comment like did not turn on", commentLike.data);
  const reportOne = expectStatus(await secondary.request(`/api/board/${post.data.id}/report`, {
    method: "POST",
    json: { reason: `Production E2E report ${runId}` },
  }), 200);
  const reportTwo = expectStatus(await secondary.request(`/api/board/${post.data.id}/report`, {
    method: "POST",
    json: { reason: `Duplicate production E2E report ${runId}` },
  }), 200);
  assert(reportTwo.data.duplicated === true, "Duplicate report was not deduplicated", reportTwo.data);
  const detail = expectStatus(await secondary.request(`/api/board/${post.data.id}`), 200);
  assert(detail.data.images?.length === 1, "Board post does not expose its attached image", detail.data);
  assert(detail.data.comments?.length === 1, "Board post does not expose its comment", detail.data);
  const publicMedia = await anonymous.request(requireState("sceneArtifactUrl"));
  expectStatus(publicMedia, 302);
  const signedUrl = publicMedia.headers.location;
  assert(signedUrl?.startsWith("https://storage.googleapis.com/"), "Media gateway did not return a signed GCS URL", publicMedia.headers);
  const signedResponse = await fetch(signedUrl, { signal: AbortSignal.timeout(120_000) });
  assert(signedResponse.ok, `Signed media download failed with HTTP ${signedResponse.status}`);
  const mediaBytes = (await signedResponse.arrayBuffer()).byteLength;
  assert(mediaBytes > 1_000, "Signed media response is unexpectedly small", { mediaBytes });
  return { postId: post.data.id, commentId: comment.data.id, reportOne: reportOne.data, mediaBytes };
});

await check("Help request delivery integrations", async () => {
  const response = expectStatus(await primary.request("/api/help", {
    method: "POST",
    json: { message: `[PRODUCTION E2E ${runId}] Automated delivery test. Safe to ignore.` },
    timeoutMs: 70_000,
  }), 200);
  assert(response.data.ok === true, "Help request was not stored", response.data);
  return response.data;
});

await check("Deprecated paid endpoints do not charge", async () => {
  const before = await credits();
  const background = expectStatus(await primary.request("/api/background-generate", {
    method: "POST",
    json: { prompt: "legacy" },
  }), 410);
  const refund = expectStatus(await primary.request("/api/credits/refund", {
    method: "POST",
    json: { anything: true },
  }), 410);
  const after = await credits();
  assert(after.balance === before.balance, "Deprecated endpoints changed the credit balance", { before: before.balance, after: after.balance });
  return { background: background.status, refund: refund.status };
});

await check("KakaoPay ready and cancel lifecycle", async () => {
  const before = await credits();
  const ready = expectStatus(await primary.request("/api/payments/kakao/ready", {
    method: "POST",
    json: { productCode: "light" },
    timeoutMs: 70_000,
  }), 200);
  assert(ready.data.paymentId && ready.data.redirectUrl, "KakaoPay ready response is incomplete", ready.data);
  state.paymentId = ready.data.paymentId;
  expectStatus(await primary.request(`/api/payments/kakao/cancel?order=${encodeURIComponent(ready.data.paymentId)}`), 302, 307);
  const wallet = await credits();
  const payment = wallet.payments.find((item) => item.id === ready.data.paymentId);
  assert(payment?.status === "cancelled", "Cancelled KakaoPay order did not persist as cancelled", payment);
  assert(wallet.balance === before.balance, "Cancelled payment changed the credit balance", { before: before.balance, after: wallet.balance });
  return { paymentId: ready.data.paymentId, redirectHost: new URL(ready.data.redirectUrl).host, status: payment.status };
});

const videoResult = await check("Vertex Veo video generation", async () => {
  const before = await credits();
  const idempotencyKey = `e2e-${runId}-veo-4s`;
  const response = expectStatus(await primary.request("/api/jobs", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    json: {
      kind: "video",
      prompt: "A friendly yellow robot in a bright sparse animation studio gives a thumbs-up to camera, subtle natural movement, clean webtoon-inspired 3D animation, no text",
      negativePrompt: "text, watermark, extra limbs, distorted face, camera shake",
      aspectRatio: "9:16",
      durationSeconds: 4,
      resolution: "720p",
      generateAudio: false,
      projectId: requireState("projectId"),
      cutId: requireState("cutId"),
      sourceAssetId: requireState("uploadedAssetId"),
    },
    timeoutMs: 90_000,
  }), 202);
  const jobId = response.data?.job?.id;
  assert(jobId, "Veo request did not return a job id", response.data);
  const duplicate = expectStatus(await primary.request("/api/jobs", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    json: {
      kind: "video",
      prompt: "A friendly yellow robot in a bright sparse animation studio gives a thumbs-up to camera, subtle natural movement, clean webtoon-inspired 3D animation, no text",
      aspectRatio: "9:16",
      durationSeconds: 4,
      resolution: "720p",
      generateAudio: false,
      projectId: state.projectId,
      cutId: state.cutId,
      sourceAssetId: state.uploadedAssetId,
    },
    timeoutMs: 90_000,
  }), 202);
  assert(duplicate.data.deduplicated === true && duplicate.data.job.id === jobId, "Veo idempotency failed", duplicate.data);
  const job = await waitForJob(primary, jobId, videoTimeoutMs);
  const after = await credits();
  if (job.status === "succeeded") {
    assert(before.balance - after.balance === 60, "Unexpected Veo credit charge", { before: before.balance, after: after.balance, job });
    assert(job.artifacts?.some((artifact) => artifact.mimeType.startsWith("video/")), "Succeeded Veo job has no video artifact", job);
  } else {
    assert(after.balance === before.balance, "Failed Veo job did not refund credits", { before: before.balance, after: after.balance, job });
    throw Object.assign(new Error(`Veo job failed: ${job.error || job.stage}`), { details: job });
  }
  state.videoJobId = job.id;
  state.videoArtifactId = job.artifacts.find((artifact) => artifact.mimeType.startsWith("video/"))?.id;
  state.videoArtifactUrl = job.artifacts.find((artifact) => artifact.mimeType.startsWith("video/"))?.blobUrl;
  return { before: before.balance, after: after.balance, job };
});

await check("Shorts GCS upload and confirmation", async () => {
  assert(videoResult, "Veo result is required for the shorts upload test");
  const gateway = expectStatus(await primary.request(requireState("videoArtifactUrl")), 302);
  const download = await fetch(gateway.headers.location, { signal: AbortSignal.timeout(180_000) });
  assert(download.ok, `Could not download the generated video: HTTP ${download.status}`);
  const videoBuffer = Buffer.from(await download.arrayBuffer());
  assert(videoBuffer.length > 10_000, "Generated video is unexpectedly small", { bytes: videoBuffer.length });
  const ticket = expectStatus(await primary.request("/api/shorts/upload", {
    method: "POST",
    json: { projectId: requireState("projectId"), contentType: "video/mp4" },
  }), 200).data;
  const upload = await uploadWithTicket(ticket, videoBuffer, "video/mp4", "e2e-short.mp4");
  const confirm = expectStatus(await primary.request("/api/shorts/upload/confirm", {
    method: "POST",
    json: { ref: ticket.ref, projectId: state.projectId, title: `E2E Short ${runId}`, cutCount: 2 },
    timeoutMs: 120_000,
  }), 200);
  state.shortJobId = confirm.data.jobId;
  return { sourceBytes: videoBuffer.length, upload, confirm: confirm.data };
});

await check("Archive, history, notifications, and project asset integration", async () => {
  const history = expectStatus(await primary.request("/api/history?limit=100"), 200);
  assert(history.data.some((request) => request.images?.some((image) => image.id === requireState("sceneImageId"))), "Scene image is missing from history");
  const archive = expectStatus(await primary.request("/api/archive?page=1&kind=all"), 200);
  assert(archive.data.items.some((item) => item.id === requireState("sceneArtifactId")), "Scene artifact is missing from the archive", archive.data);
  if (state.videoArtifactId) {
    assert(archive.data.items.some((item) => item.id === state.videoArtifactId), "Video artifact is missing from the archive", archive.data);
  }
  const notifications = expectStatus(await primary.request("/api/notifications"), 200);
  assert(notifications.data.notifications.some((item) => item.id === requireState("sceneJobId")), "Scene completion notification is missing", notifications.data);
  expectStatus(await primary.request("/api/notifications", { method: "PATCH", json: { all: true } }), 200);
  const project = expectStatus(await primary.request(`/api/studio/projects/${requireState("projectId")}`), 200);
  assert(project.data.project.assets.length >= 2, "Generated/uploaded assets are missing from the project", project.data.project.assets);
  return {
    historyRequests: history.data.length,
    archiveItems: archive.data.items.length,
    unreadNotifications: notifications.data.unreadCount,
    projectAssets: project.data.project.assets.length,
  };
});

await check("Session cap keeps at most two active sessions", async () => {
  const extraOne = new HttpClient("extra-one");
  const extraTwo = new HttpClient("extra-two");
  expectStatus(await extraOne.request("/api/auth/login", {
    method: "POST",
    headers: { "user-agent": `WONY-E2E-extra-one-${runId}` },
    json: { email: primaryEmail, password: primaryPassword },
  }), 200);
  expectStatus(await extraTwo.request("/api/auth/login", {
    method: "POST",
    headers: { "user-agent": `WONY-E2E-extra-two-${runId}` },
    json: { email: primaryEmail, password: primaryPassword },
  }), 200);
  const sessions = expectStatus(await extraTwo.request("/api/auth/sessions"), 200);
  const values = Array.isArray(sessions.data) ? sessions.data : sessions.data.sessions;
  assert(Array.isArray(values) && values.length <= 2, "More than two active sessions remain", sessions.data);
  state.finalPrimaryClient = "extraTwo";
  return { activeSessions: values.length, sessions: values };
});

report.finishedAt = new Date().toISOString();
report.summary = {
  passed: report.checks.filter((item) => item.status === "passed").length,
  failed: report.checks.filter((item) => item.status === "failed").length,
  total: report.checks.length,
};
await persist();

process.stdout.write(`\n[E2E SUMMARY] ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.total} total\n`);
process.stdout.write(`[E2E REPORT] ${reportPath}\n`);
if (report.summary.failed > 0) process.exitCode = 1;
