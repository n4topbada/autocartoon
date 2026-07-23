// Supplemental E2E runner for the AutoCartoon local dev server.
// Covers the endpoints listed in gap-audit.md section 1 that are testable
// without paid Vertex/Veo generation (single exception: /api/shorts/prompt, 1 credit).
//
// Requirements on the server side:
//   - next dev on 127.0.0.1 (default http://127.0.0.1:3000)
//   - DEV_E2E_ROUTE=true (fixture API /api/dev/e2e)
//   - GCS_BUCKET unset (local /uploads storage), Cloud Tasks unset (inline jobs)
//   - Seedance/RemoveBG/Instagram/SOLAPI keys unset; KakaoPay TC0ONETIME set; RESEND_API_KEY set
//
// Usage: node supplement-e2e.mjs
//   E2E_BASE_URL                (default http://127.0.0.1:3000)
//   E2E_SUP_PASSWORD            (required; >=16 chars, letters+digits — for local sup-* fixtures)
//   E2E_SUPPLEMENT_REPORT       (default ./.e2e-supplement-{runId}.json)
//   E2E_SUPPLEMENT_SKIP_PAID    (set "true" to skip the 1-credit /api/shorts/prompt check)

import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const baseUrl = (process.env.E2E_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const runId = process.env.E2E_RUN_ID || new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const runTag = (runId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "20260720").toLowerCase();
const reportPath =
  process.env.E2E_SUPPLEMENT_REPORT || path.join(process.cwd(), `.e2e-supplement-${runId}.json`);
const SUP_PASSWORD = process.env.E2E_SUP_PASSWORD || "";
const skipPaid = process.env.E2E_SUPPLEMENT_SKIP_PAID === "true";

// 자격 증명은 기본값 없이 환경 변수로만 받는다(production-e2e.mjs와 동일 규율).
if (SUP_PASSWORD.length < 16 || Buffer.byteLength(SUP_PASSWORD, "utf8") > 72) {
  throw new Error("E2E_SUP_PASSWORD must be set to a 16..72 byte value (fixture API requirement).");
}

// 1x1 transparent PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_BUFFER = Buffer.from(PNG_BASE64, "base64");

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

const admin = new HttpClient("sup-admin");
const user1 = new HttpClient("sup-user1");
const user2 = new HttpClient("sup-user2");
const poor = new HttpClient("sup-poor");
const anonymous = new HttpClient("anonymous");
const state = { warnings: [] };
const report = {
  runId,
  baseUrl,
  kind: "supplement",
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
  process.stdout.write(`\n[SUPPLEMENT] ${name}\n`);
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

function b64url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function balance(client) {
  const response = expectStatus(await client.request("/api/credits"), 200);
  return response.data.balance;
}

async function devE2E(json) {
  return anonymous.request("/api/dev/e2e", {
    method: "POST",
    json,
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
}

async function login(client, email, password = SUP_PASSWORD, userAgent) {
  return client.request("/api/auth/login", {
    method: "POST",
    json: { email, password },
    headers: userAgent ? { "user-agent": userAgent } : {},
  });
}

async function uploadViaTicket(client, ticket, buffer, mimeType, filename) {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields || {})) form.append(key, String(value));
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  return client.request(ticket.url, { method: "POST", body: form, timeoutMs: 180_000 });
}

async function uploadLocal(client, objectPath, buffer, mimeType, filename) {
  const form = new FormData();
  form.append("objectPath", objectPath);
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  return client.request("/api/media/upload", { method: "POST", body: form, timeoutMs: 180_000 });
}

const FIX = {
  admin: { email: "sup-admin@dev-e2e.local", role: "admin", credits: 100_000 },
  user1: { email: "sup-user1@dev-e2e.local", credits: 2_000 },
  user2: { email: "sup-user2@dev-e2e.local", credits: 500 },
  poor: { email: "sup-poor@dev-e2e.local", credits: 0 },
  oauth: { email: "sup-oauth@dev-e2e.local", kakaoId: `sup-oauth-kakao-${runTag}` },
  verify: {
    email: "sup-verify@dev-e2e.local",
    emailVerified: false,
    verifyToken: `sup_verify_${runTag}_${"v".repeat(40)}`,
  },
  sess: { email: "sup-sess@dev-e2e.local" },
  cap: { email: "sup-cap@dev-e2e.local" },
  cp: {
    email: "sup-cp@dev-e2e.local",
    resetToken: `sup_reset_${runTag}_${"r".repeat(40)}`,
  },
  victim: { email: "sup-victim@dev-e2e.local" },
  forgot: { email: "sup-forgot@dev-e2e.local" },
  temp: { email: "sup-temp@dev-e2e.local" },
};

// ─────────────────────────────────────────────────────────── setup ──

await check("setup: dev fixture route available and fixtures created", async () => {
  const status = await anonymous.request("/api/dev/e2e", {
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
  expectStatus(status, 200);
  assert(status.data?.enabled === true, "Fixture route is not enabled (DEV_E2E_ROUTE)", status.data);
  state.userIds = {};
  for (const [key, fixture] of Object.entries(FIX)) {
    const { email, ...extra } = fixture;
    const created = expectStatus(await devE2E({
      action: "create-user",
      email,
      password: SUP_PASSWORD,
      ...extra,
    }), 200);
    assert(created.data?.ok === true && created.data?.user?.id, `Fixture upsert failed for ${email}`, created.data);
    state.userIds[key] = created.data.user.id;
  }
  return state.userIds;
});

await check("setup: fixture logins (admin, user1, user2, poor)", async () => {
  const adminLogin = expectStatus(await login(admin, FIX.admin.email, SUP_PASSWORD, `SUP-admin-${runId}`), 200);
  const adminMe = expectStatus(await admin.request("/api/auth/me"), 200);
  assert(adminMe.data?.role === "admin", "sup-admin is not an admin", adminMe.data);
  expectStatus(await login(user1, FIX.user1.email, SUP_PASSWORD, `SUP-user1-${runId}`), 200);
  const user1Me = expectStatus(await user1.request("/api/auth/me"), 200);
  assert(user1Me.data?.id === state.userIds.user1, "user1 id mismatch", user1Me.data);
  expectStatus(await login(user2, FIX.user2.email, SUP_PASSWORD, `SUP-user2-${runId}`), 200);
  const user2Me = expectStatus(await user2.request("/api/auth/me"), 200);
  assert(user2Me.data?.role !== "admin", "sup-user2 unexpectedly admin", user2Me.data);
  expectStatus(await login(poor, FIX.poor.email, SUP_PASSWORD, `SUP-poor-${runId}`), 200);
  const poorMe = expectStatus(await poor.request("/api/auth/me"), 200);
  assert(poorMe.data?.credits === 0, "sup-poor should start with 0 credits", poorMe.data);
  return { admin: adminLogin.data?.id, user1: user1Me.data.id, user2: user2Me.data.id, poor: poorMe.data.id };
});

// ─────────────────────────────────────────────────────────── auth ──

await check("auth: email registration validation is active", async () => {
  const bare = new HttpClient("bare-register");
  const invalidEmail = expectStatus(await bare.request("/api/auth/register", {
    method: "POST",
    json: { email: "not-an-email", password: "Password!" },
  }), 400);
  const missingSpecial = expectStatus(await bare.request("/api/auth/register", {
    method: "POST",
    json: { email: `sup-new-${runTag}@dev-e2e.local`, password: "Password123" },
  }), 400);
  const tooShort = expectStatus(await bare.request("/api/auth/register", {
    method: "POST",
    json: { email: `sup-new-${runTag}@dev-e2e.local`, password: "Pass!12" },
  }), 400);
  const noBody = expectStatus(await bare.request("/api/auth/register", { method: "POST" }), 400);
  return {
    invalidEmail: invalidEmail.status,
    missingSpecial: missingSpecial.status,
    tooShort: tooShort.status,
    noBody: noBody.status,
  };
});

await check("auth: logout is idempotent with and without a session", async () => {
  const bare = new HttpClient("bare-logout");
  const anonLogout = expectStatus(await bare.request("/api/auth/logout", { method: "POST" }), 200);
  assert(anonLogout.data?.ok === true, "Cookieless logout should still be ok:true", anonLogout.data);
  const client = new HttpClient("victim-logout");
  expectStatus(await login(client, FIX.victim.email), 200);
  expectStatus(await client.request("/api/auth/me"), 200);
  const logout = expectStatus(await client.request("/api/auth/logout", { method: "POST" }), 200);
  assert(logout.data?.ok === true, "Logout should return ok:true", logout.data);
  expectStatus(await client.request("/api/auth/me"), 401);
  const again = expectStatus(await client.request("/api/auth/logout", { method: "POST" }), 200);
  return { anon: anonLogout.data, again: again.data };
});

await check("auth: email verify token flow (blocked login, invalid, happy)", async () => {
  const preVerify = expectStatus(await login(new HttpClient("verify-pre"), FIX.verify.email), 403);
  const invalidToken = `sup_bogus_${runTag}_${"x".repeat(40)}`;
  const invalid = expectStatus(await anonymous.request(`/api/auth/verify?token=${invalidToken}`), 302, 307);
  assert(
    (invalid.headers.location || "").includes("/verify?error=invalid_token"),
    "Invalid token should redirect to /verify?error=invalid_token",
    invalid.headers,
  );
  const missing = expectStatus(await anonymous.request("/api/auth/verify"), 302, 307);
  assert((missing.headers.location || "").includes("error=invalid_token"), "Missing token should redirect", missing.headers);
  const verifyClient = new HttpClient("verify-happy");
  const happy = expectStatus(await verifyClient.request(
    `/api/auth/verify?token=${encodeURIComponent(FIX.verify.verifyToken)}`,
  ), 302, 307);
  const location = happy.headers.location || "";
  assert(!location.includes("error="), "Happy verify redirected with an error", happy.headers);
  const me = expectStatus(await verifyClient.request("/api/auth/me"), 200);
  assert(me.data?.email === FIX.verify.email, "Verify auto-login cookie does not work on /api/auth/me", me.data);
  const reuse = expectStatus(await anonymous.request(
    `/api/auth/verify?token=${encodeURIComponent(FIX.verify.verifyToken)}`,
  ), 302, 307);
  assert((reuse.headers.location || "").includes("error=invalid_token"), "Consumed token should be invalid", reuse.headers);
  return { preVerify: preVerify.status, happyLocation: location, me: me.data.email };
});

await check("auth: OAuth-linked account cannot use password login", async () => {
  const blocked = expectStatus(await login(new HttpClient("oauth-login"), FIX.oauth.email), 401);
  return { status: blocked.status, error: blocked.data?.error };
});

await check("auth: OAuth entry/callback guard redirects", async () => {
  const google = expectStatus(await anonymous.request("/api/auth/google?returnTo=%2Fcredits"), 302, 307);
  assert(
    (google.headers.location || "").includes("google=not_configured"),
    "Unconfigured Google OAuth should redirect back to /login",
    google.headers,
  );
  const googleCb = expectStatus(await new HttpClient("gcb").request("/api/auth/google/callback?code=x&state=y"), 302, 307);
  assert((googleCb.headers.location || "").includes("google=invalid_state"), "Google callback without cookies should be invalid_state", googleCb.headers);
  const kakaoCb = expectStatus(await new HttpClient("kcb").request("/api/auth/kakao/callback?code=x&state=y"), 302, 307);
  assert((kakaoCb.headers.location || "").includes("kakao=invalid_state"), "Kakao callback without cookies should be invalid_state", kakaoCb.headers);
  return {
    google: google.headers.location,
    googleCallback: googleCb.headers.location,
    kakaoCallback: kakaoCb.headers.location,
  };
});

await check("auth: session revocation by id, others:true, and self-revoke", async () => {
  const sessA = new HttpClient("sess-A");
  const sessB = new HttpClient("sess-B");
  expectStatus(await login(sessA, FIX.sess.email, SUP_PASSWORD, `SUP-sess-A-${runId}`), 200);
  expectStatus(await login(sessB, FIX.sess.email, SUP_PASSWORD, `SUP-sess-B-${runId}`), 200);
  const listed = expectStatus(await sessA.request("/api/auth/sessions"), 200);
  const rows = listed.data?.sessions || [];
  assert(rows.length === 2, "Expected exactly two device sessions", listed.data);
  const otherRow = rows.find((row) => row.current !== true);
  const ownRow = rows.find((row) => row.current === true);
  assert(otherRow && ownRow, "Sessions list is missing current flags", rows);

  const revokeOther = expectStatus(await sessA.request("/api/auth/sessions", {
    method: "DELETE",
    json: { id: otherRow.id },
  }), 200);
  assert(revokeOther.data?.currentRevoked === false, "Revoking another session flagged currentRevoked", revokeOther.data);
  expectStatus(await sessB.request("/api/auth/me"), 401);

  expectStatus(await login(sessB, FIX.sess.email, SUP_PASSWORD, `SUP-sess-B2-${runId}`), 200);
  expectStatus(await sessB.request("/api/auth/me"), 200);
  const revokeOthers = expectStatus(await sessA.request("/api/auth/sessions", {
    method: "DELETE",
    json: { others: true },
  }), 200);
  assert(revokeOthers.data?.ok === true && revokeOthers.data?.currentRevoked === false, "others:true contract broken", revokeOthers.data);
  expectStatus(await sessB.request("/api/auth/me"), 401);
  expectStatus(await sessA.request("/api/auth/me"), 200);

  expectStatus(await sessA.request("/api/auth/sessions", { method: "DELETE", json: {} }), 400);
  expectStatus(await sessA.request("/api/auth/sessions", {
    method: "DELETE",
    json: { id: "sup-nonexistent-session-id" },
  }), 404);

  const selfRevoke = expectStatus(await sessA.request("/api/auth/sessions", {
    method: "DELETE",
    json: { id: ownRow.id },
  }), 200);
  assert(selfRevoke.data?.currentRevoked === true, "Self-revoke should flag currentRevoked:true", selfRevoke.data);
  expectStatus(await sessA.request("/api/auth/me"), 401);
  return { revoked: otherRow.id, selfRevoked: ownRow.id };
});

await check("auth: device cap evicts oldest session (evicted cookie gets 401)", async () => {
  const capA = new HttpClient("cap-A");
  const capB = new HttpClient("cap-B");
  const capC = new HttpClient("cap-C");
  expectStatus(await login(capA, FIX.cap.email, SUP_PASSWORD, `SUP-cap-A-${runId}`), 200);
  expectStatus(await capA.request("/api/auth/me"), 200);
  expectStatus(await login(capB, FIX.cap.email, SUP_PASSWORD, `SUP-cap-B-${runId}`), 200);
  expectStatus(await login(capC, FIX.cap.email, SUP_PASSWORD, `SUP-cap-C-${runId}`), 200);
  const evicted = expectStatus(await capA.request("/api/auth/me"), 401);
  const sessions = expectStatus(await capC.request("/api/auth/sessions"), 200);
  const rows = sessions.data?.sessions || [];
  assert(rows.length <= 2, "More than two active sessions remain after third login", sessions.data);
  return { evictedStatus: evicted.status, activeSessions: rows.length };
});

await check("auth: password reset link flow (validation, success, revocation, one-time use)", async () => {
  const cpA = new HttpClient("cp-A");
  const cpB = new HttpClient("cp-B");
  expectStatus(await login(cpA, FIX.cp.email, SUP_PASSWORD, `SUP-cp-A-${runId}`), 200);
  expectStatus(await login(cpB, FIX.cp.email, SUP_PASSWORD, `SUP-cp-B-${runId}`), 200);
  const newPassword = `SupReset!${runTag}x9`;

  expectStatus(await anonymous.request("/api/auth/reset-password", {
    method: "POST",
    json: { token: `invalid_${"x".repeat(40)}`, newPassword },
  }), 400);
  expectStatus(await anonymous.request("/api/auth/reset-password", {
    method: "POST",
    json: { token: FIX.cp.resetToken, newPassword: "short!" },
  }), 400);
  expectStatus(await anonymous.request("/api/auth/reset-password", {
    method: "POST",
    json: { token: FIX.cp.resetToken, newPassword: "Password123" },
  }), 400);
  expectStatus(await anonymous.request("/api/auth/reset-password", { method: "POST", json: {} }), 400);

  const success = expectStatus(await anonymous.request("/api/auth/reset-password", {
    method: "POST",
    json: { token: FIX.cp.resetToken, newPassword },
  }), 200);
  expectStatus(await cpB.request("/api/auth/me"), 401);
  expectStatus(await cpA.request("/api/auth/me"), 401);
  expectStatus(await login(new HttpClient("cp-old"), FIX.cp.email, SUP_PASSWORD), 401);
  expectStatus(await login(new HttpClient("cp-new"), FIX.cp.email, newPassword, `SUP-cp-new-${runId}`), 200);
  expectStatus(await anonymous.request("/api/auth/reset-password", {
    method: "POST",
    json: { token: FIX.cp.resetToken, newPassword: `${newPassword}Again!` },
  }), 400);
  return { message: success.data?.message };
});

await check("auth: forgot-password contract and cooldown", async () => {
  const bare = new HttpClient("forgot");
  expectStatus(await bare.request("/api/auth/forgot-password", {
    method: "POST",
    json: { email: "not-an-email" },
  }), 400);
  const unknown = expectStatus(await bare.request("/api/auth/forgot-password", {
    method: "POST",
    json: { email: `sup-ghost-${runTag}@dev-e2e.local` },
  }), 200);
  const first = await bare.request("/api/auth/forgot-password", {
    method: "POST",
    json: { email: FIX.forgot.email },
  });
  // dev server: 200 = Resend accepted, 502 = Resend rejected the unverified recipient (rolled back).
  assert([200, 502].includes(first.status), `Unexpected forgot-password status ${first.status}`, first.data);
  const second = await bare.request("/api/auth/forgot-password", {
    method: "POST",
    json: { email: FIX.forgot.email },
  });
  if (first.status === 200) {
    expectStatus(second, 429);
    assert(second.headers["retry-after"] === "60", "429 should carry Retry-After: 60", second.headers);
  } else {
    // Send failure rolls back passwordResetRequestedAt, so the cooldown may not engage.
    assert([429, 502].includes(second.status), `Unexpected second forgot-password status ${second.status}`, second.data);
  }
  return { unknown: unknown.status, first: first.status, second: second.status };
});

await check("auth: account withdrawal (wrong confirmation, success, dead login)", async () => {
  const vic = new HttpClient("victim");
  expectStatus(await login(vic, FIX.victim.email, SUP_PASSWORD, `SUP-victim-${runId}`), 200);
  expectStatus(await vic.request("/api/auth/account", { method: "DELETE", json: {} }), 400);
  expectStatus(await vic.request("/api/auth/account", {
    method: "DELETE",
    json: { password: SUP_PASSWORD, emailConfirmation: `wrong-${runTag}@dev-e2e.local` },
  }), 400);
  expectStatus(await vic.request("/api/auth/account", {
    method: "DELETE",
    json: { password: "Wrong-Password-123456", emailConfirmation: FIX.victim.email },
  }), 400);
  expectStatus(await vic.request("/api/auth/account", {
    method: "DELETE",
    body: "{not-json",
    headers: { "content-type": "application/json" },
  }), 400);
  const success = expectStatus(await vic.request("/api/auth/account", {
    method: "DELETE",
    json: { password: SUP_PASSWORD, emailConfirmation: FIX.victim.email },
  }), 200);
  expectStatus(await vic.request("/api/auth/me"), 401);
  expectStatus(await login(new HttpClient("victim-dead"), FIX.victim.email, SUP_PASSWORD), 401);
  return { message: success.data?.message };
});

await check("auth+admin: temporary password issue, validation, and temp login", async () => {
  const tempId = requireState("userIds").temp;
  const tempSession = new HttpClient("temp-live");
  expectStatus(await login(tempSession, FIX.temp.email, SUP_PASSWORD, `SUP-temp-${runId}`), 200);

  const tempPassword = `T3mp${runTag}`.padEnd(12, "9").slice(0, 12);
  expectStatus(await admin.request(`/api/admin/users/${tempId}/temporary-password`, {
    method: "POST",
    json: { temporaryPassword: "abc", expiresInMinutes: 30 },
  }), 400);
  expectStatus(await admin.request(`/api/admin/users/${tempId}/temporary-password`, {
    method: "POST",
    json: { temporaryPassword: tempPassword, expiresInMinutes: 60 },
  }), 400);
  expectStatus(await admin.request("/api/admin/users/sup-nonexistent-user/temporary-password", {
    method: "POST",
    json: { temporaryPassword: tempPassword, expiresInMinutes: 30 },
  }), 404);
  expectStatus(await admin.request(`/api/admin/users/${requireState("userIds").oauth}/temporary-password`, {
    method: "POST",
    json: { temporaryPassword: tempPassword, expiresInMinutes: 30 },
  }), 400);
  expectStatus(await user2.request(`/api/admin/users/${tempId}/temporary-password`, {
    method: "POST",
    json: { temporaryPassword: tempPassword, expiresInMinutes: 30 },
  }), 403);

  const issued = expectStatus(await admin.request(`/api/admin/users/${tempId}/temporary-password`, {
    method: "POST",
    json: { temporaryPassword: tempPassword, expiresInMinutes: 30 },
  }), 200);
  assert(issued.data?.ok === true && issued.data?.selfReset === false, "Temporary password response contract broken", issued.data);
  assert(issued.data?.revokedSessions >= 1, "Target sessions were not revoked", issued.data);
  expectStatus(await tempSession.request("/api/auth/me"), 401);
  expectStatus(await login(new HttpClient("temp-old"), FIX.temp.email, SUP_PASSWORD), 401);
  const tempLogin = expectStatus(await login(new HttpClient("temp-new"), FIX.temp.email, tempPassword, `SUP-temp-new-${runId}`), 200);
  assert(tempLogin.data?.mustChangePassword === true, "Temp-password login should flag mustChangePassword", tempLogin.data);
  return { expiresAt: issued.data.expiresAt, revokedSessions: issued.data.revokedSessions };
});

// ─────────────────────────────────────────────────────────── admin ──

await check("admin: users PATCH validation and permission boundary", async () => {
  const targetId = requireState("userIds").user2;
  expectStatus(await admin.request(`/api/admin/users/${targetId}`, { method: "PATCH", json: { addCredits: 0 } }), 400);
  expectStatus(await admin.request(`/api/admin/users/${targetId}`, { method: "PATCH", json: { addCredits: 1_000_001 } }), 400);
  expectStatus(await admin.request(`/api/admin/users/${targetId}`, { method: "PATCH", json: { addCredits: 1.5 } }), 400);
  expectStatus(await admin.request(`/api/admin/users/${targetId}`, {
    method: "PATCH",
    json: { name: "x".repeat(81) },
  }), 400);
  const grant = expectStatus(await admin.request(`/api/admin/users/${targetId}`, {
    method: "PATCH",
    json: { addCredits: 1, name: `Sup User2 ${runTag}` },
  }), 200);
  expectStatus(await user2.request(`/api/admin/users/${targetId}`, { method: "PATCH", json: { addCredits: 1 } }), 403);
  expectStatus(await new HttpClient("anon-admin").request(`/api/admin/users/${targetId}`, {
    method: "PATCH",
    json: { addCredits: 1 },
  }), 401);
  return { credits: grant.data?.credits };
});

await check("admin: announcements lifecycle (draft, publish, unpublish, delete)", async () => {
  expectStatus(await user2.request("/api/admin/announcements"), 403);
  expectStatus(await admin.request("/api/admin/announcements", {
    method: "POST",
    json: { title: `sup ${runTag}`, content: "x", category: "event" },
  }), 400);
  const draft = expectStatus(await admin.request("/api/admin/announcements", {
    method: "POST",
    json: { title: `[SUP ${runTag}] draft`, content: "supplement draft", category: "notice", published: false },
  }), 201);
  assert(draft.data?.publishedAt === null, "Draft should have null publishedAt", draft.data);
  const id = draft.data.id;
  const list = expectStatus(await admin.request("/api/admin/announcements"), 200);
  assert(list.data.some((item) => item.id === id), "Admin list is missing the draft", { id });

  const publish = expectStatus(await admin.request("/api/admin/announcements", {
    method: "PATCH",
    json: { id, title: `[SUP ${runTag}] published`, content: "supplement published", category: "update", published: true, pinned: true },
  }), 200);
  assert(publish.data?.publishedAt, "Publishing should set publishedAt", publish.data);
  const republish = expectStatus(await admin.request("/api/admin/announcements", {
    method: "PATCH",
    json: { id, title: `[SUP ${runTag}] published`, content: "supplement published 2", category: "update", published: true, pinned: false },
  }), 200);
  assert(republish.data?.publishedAt === publish.data.publishedAt, "Re-publish should keep the original publishedAt", {
    before: publish.data.publishedAt,
    after: republish.data.publishedAt,
  });
  const unpublish = expectStatus(await admin.request("/api/admin/announcements", {
    method: "PATCH",
    json: { id, title: `[SUP ${runTag}] unpublished`, content: "supplement unpublished", category: "notice", published: false },
  }), 200);
  assert(unpublish.data?.publishedAt === null, "Unpublish should clear publishedAt", unpublish.data);

  expectStatus(await admin.request("/api/admin/announcements", {
    method: "PATCH",
    json: { title: "no id", content: "x", category: "notice" },
  }), 400);
  expectStatus(await admin.request("/api/admin/announcements", {
    method: "PATCH",
    json: { id: "sup-nonexistent-announcement", title: "x", content: "y", category: "notice" },
  }), 404);
  expectStatus(await admin.request("/api/admin/announcements", { method: "DELETE" }), 400);
  expectStatus(await admin.request(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: "DELETE" }), 200);
  return { id };
});

await check("admin+community: announcement read-marking for users", async () => {
  const created = expectStatus(await admin.request("/api/admin/announcements", {
    method: "POST",
    json: { title: `[SUP ${runTag}] read-me`, content: "supplement read-marking", category: "notice", published: true },
  }), 201);
  const id = created.data.id;
  state.announcementId = id;
  const before = expectStatus(await user1.request("/api/announcements?limit=50"), 200);
  const entry = (before.data?.announcements || []).find((item) => item.id === id);
  assert(entry && entry.isRead === false, "Fresh announcement should be listed unread", entry);
  const mark = expectStatus(await user1.request("/api/announcements", { method: "PATCH", json: { ids: [id] } }), 200);
  assert(mark.data?.ok === true, "Read-marking should be ok:true", mark.data);
  const after = expectStatus(await user1.request("/api/announcements?limit=50"), 200);
  const readEntry = (after.data?.announcements || []).find((item) => item.id === id);
  assert(readEntry?.isRead === true, "Announcement should be read after PATCH ids", readEntry);
  const repeat = expectStatus(await user1.request("/api/announcements", { method: "PATCH", json: { ids: [id] } }), 200);
  assert(repeat.data?.count === 0, "Repeated read-marking should skip duplicates", repeat.data);
  expectStatus(await user1.request("/api/announcements", { method: "PATCH", json: {} }), 400);
  return { id, markedCount: mark.data?.count };
});

await check("admin: knowledge CRUD", async () => {
  expectStatus(await user2.request("/api/admin/knowledge"), 403);
  expectStatus(await admin.request("/api/admin/knowledge"), 200);
  expectStatus(await admin.request("/api/admin/knowledge", {
    method: "POST",
    json: { category: "faq", title: "no content" },
  }), 400);
  const created = expectStatus(await admin.request("/api/admin/knowledge", {
    method: "POST",
    json: { category: "faq", title: `[SUP ${runTag}] knowledge`, content: "supplement knowledge" },
  }), 200);
  const id = created.data?.id;
  assert(id, "Knowledge create did not return an id", created.data);
  const patched = expectStatus(await admin.request("/api/admin/knowledge", {
    method: "PATCH",
    json: { id, title: `[SUP ${runTag}] knowledge v2` },
  }), 200);
  assert(patched.data?.content === "supplement knowledge", "PATCH should keep untouched fields", patched.data);
  expectStatus(await admin.request("/api/admin/knowledge", { method: "PATCH", json: { title: "no id" } }), 400);
  expectStatus(await admin.request("/api/admin/knowledge", { method: "DELETE" }), 400);
  expectStatus(await admin.request(`/api/admin/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" }), 200);
  return { id };
});

await check("admin: reports review flow (create, dedupe, review, filter)", async () => {
  const post = expectStatus(await user1.request("/api/board", {
    method: "POST",
    json: { title: `[SUP ${runTag}] report target`, content: "supplement report target post" },
  }), 201);
  const postId = post.data.id;
  const reported = expectStatus(await user2.request(`/api/board/${postId}/report`, {
    method: "POST",
    json: { reason: `supplement report ${runTag}` },
  }), 200);
  const dup = expectStatus(await user2.request(`/api/board/${postId}/report`, {
    method: "POST",
    json: { reason: `supplement duplicate ${runTag}` },
  }), 200);
  assert(dup.data?.duplicated === true, "Duplicate report was not deduplicated", dup.data);
  expectStatus(await user2.request("/api/admin/reports?status=open"), 403);
  const open = expectStatus(await admin.request("/api/admin/reports?status=open"), 200);
  const row = (open.data?.reports || []).find((item) => item.post?.id === postId);
  assert(row, "Report is missing from the open queue", { postId });
  expectStatus(await admin.request("/api/admin/reports", { method: "PATCH", json: { id: row.id, status: "closed" } }), 400);
  expectStatus(await admin.request("/api/admin/reports", {
    method: "PATCH",
    json: { id: "sup-nonexistent-report", status: "reviewed" },
  }), 404);
  expectStatus(await admin.request("/api/admin/reports", { method: "PATCH", json: { id: row.id, status: "reviewed" } }), 200);
  const reviewed = expectStatus(await admin.request("/api/admin/reports?status=reviewed"), 200);
  assert((reviewed.data?.reports || []).some((item) => item.id === row.id), "Reviewed filter is missing the report", { id: row.id });
  expectStatus(await user1.request(`/api/board/${postId}`, { method: "DELETE" }), 200);
  return { postId, reportId: row.id, reported: reported.data };
});

// ────────────────────────────────────────────── characters-assets ──

await check("characters: group rename, foreign 404, delete orphans presets", async () => {
  const group = expectStatus(await user1.request("/api/groups", {
    method: "POST",
    json: { name: `SUP Group ${runTag}` },
  }), 200);
  const groupId = group.data.id;
  const renamed = expectStatus(await user1.request(`/api/groups/${groupId}`, {
    method: "PATCH",
    json: { name: `SUP Group v2 ${runTag}`, order: 5 },
  }), 200);
  expectStatus(await user2.request(`/api/groups/${groupId}`, { method: "PATCH", json: { name: "hijack" } }), 404);
  expectStatus(await user2.request(`/api/groups/${groupId}`, { method: "DELETE" }), 404);

  const preset = expectStatus(await user1.request("/api/presets", {
    method: "POST",
    json: {
      name: `SUP Preset ${runTag}`,
      groupId,
      isPublic: false,
      images: [{ base64: PNG_BASE64, mimeType: "image/png", view: "front" }],
    },
    timeoutMs: 120_000,
  }), 200);
  state.presetId = preset.data.id;

  expectStatus(await user1.request(`/api/groups/${groupId}`, { method: "DELETE" }), 200);
  const listing = expectStatus(await user1.request("/api/presets"), 200);
  const ungrouped = listing.data?.ungrouped || [];
  assert(ungrouped.some((item) => item.id === state.presetId), "Preset was not orphaned to ungrouped after group delete", {
    presetId: state.presetId,
  });
  return { groupId, renamed: renamed.data?.name, presetId: state.presetId };
});

await check("characters: preset CRUD and validation", async () => {
  expectStatus(await user1.request("/api/presets", {
    method: "POST",
    json: { name: "no images", images: [] },
  }), 400);
  expectStatus(await user1.request("/api/presets", {
    method: "POST",
    json: {
      name: "too many",
      images: Array.from({ length: 5 }, () => ({ base64: PNG_BASE64, mimeType: "image/png", view: "front" })),
    },
  }), 400);
  expectStatus(await user1.request("/api/presets", {
    method: "POST",
    json: { name: "bad mime", images: [{ base64: PNG_BASE64, mimeType: "image/bmp", view: "front" }] },
  }), 400);
  expectStatus(await user1.request("/api/presets", {
    method: "POST",
    json: {
      name: "bad group",
      groupId: "sup-nonexistent-group",
      images: [{ base64: PNG_BASE64, mimeType: "image/png", view: "front" }],
    },
  }), 404);

  const presetId = requireState("presetId");
  const detail = expectStatus(await user1.request(`/api/presets/${presetId}`), 200);
  assert(detail.data?.preset?.id === presetId, "Preset detail mismatch", detail.data);
  const patched = expectStatus(await user1.request(`/api/presets/${presetId}`, {
    method: "PATCH",
    json: {
      name: `SUP Preset v2 ${runTag}`,
      description: "supplement preset",
      voiceConfig: [{ label: "기본", voiceId: "ko-KR-Wavenet-A" }],
      isDefault: true,
    },
  }), 200);
  expectStatus(await user1.request(`/api/presets/${presetId}`, {
    method: "PATCH",
    json: { voiceConfig: [{ label: "no voice id" }] },
  }), 400);
  return { presetId, name: patched.data?.preset?.name };
});

await check("characters: preset representative and thumbnail redirect", async () => {
  const presetId = requireState("presetId");
  const images = expectStatus(await user1.request(`/api/presets/${presetId}/images`), 200);
  const first = (images.data?.images || [])[0];
  assert(first?.id, "Preset has no images", images.data);
  state.presetImageId = first.id;
  const rep = expectStatus(await user1.request(`/api/presets/${presetId}/representative`, {
    method: "PATCH",
    json: { imageId: first.id },
  }), 200);
  expectStatus(await user1.request(`/api/presets/${presetId}/representative`, {
    method: "PATCH",
    json: { imageId: "sup-nonexistent-image" },
  }), 404);
  const thumb = expectStatus(await user1.request(`/api/presets/${presetId}/thumbnail`), 302, 307);
  assert((thumb.headers.location || "").includes("/uploads/"), "Thumbnail should redirect to a local /uploads path", thumb.headers);
  return { representative: rep.data?.representativeImage?.id, thumbLocation: thumb.headers.location };
});

await check("characters: preset images CRUD (add, relabel, delete, min-1 guard)", async () => {
  const presetId = requireState("presetId");
  expectStatus(await user1.request(`/api/presets/${presetId}/images`, { method: "POST", json: { images: [] } }), 400);
  const added = expectStatus(await user1.request(`/api/presets/${presetId}/images`, {
    method: "POST",
    json: { images: [{ base64: PNG_BASE64, mimeType: "image/png", view: "left" }] },
    timeoutMs: 120_000,
  }), 200);
  assert(added.data?.total === 2, "Preset should now have two images", added.data);
  const secondId = added.data.images[0].id;
  expectStatus(await user1.request(`/api/presets/${presetId}/images`, {
    method: "POST",
    json: { images: Array.from({ length: 3 }, () => ({ base64: PNG_BASE64, mimeType: "image/png", view: "back" })) },
  }), 400);
  const relabeled = expectStatus(await user1.request(`/api/presets/${presetId}/images`, {
    method: "PATCH",
    json: { imageId: secondId, view: "back" },
  }), 200);
  assert(relabeled.data?.image?.view === "back", "Image view was not updated", relabeled.data);
  expectStatus(await user1.request(`/api/presets/${presetId}/images`, {
    method: "PATCH",
    json: { imageId: secondId, view: "top" },
  }), 400);
  expectStatus(await user1.request(`/api/presets/${presetId}/images`, {
    method: "PATCH",
    json: { imageId: "sup-nonexistent-image", view: "back" },
  }), 404);
  expectStatus(await user1.request(`/api/presets/${presetId}/images`, { method: "DELETE", json: { imageId: "" } }), 400);
  expectStatus(await user1.request(`/api/presets/${presetId}/images`, { method: "DELETE", json: { imageId: secondId } }), 200);
  const lastGuard = expectStatus(await user1.request(`/api/presets/${presetId}/images`, {
    method: "DELETE",
    json: { imageId: requireState("presetImageId") },
  }), 400);
  return { secondId, lastGuard: lastGuard.data?.error };
});

await check("characters: generated image save, favorite, IDOR, delete", async () => {
  const saves = [];
  for (let index = 0; index < 3; index += 1) {
    const saved = expectStatus(await user1.request("/api/images/save", {
      method: "POST",
      json: { base64: PNG_BASE64, mimeType: "image/png", operation: index === 2 ? "cutout" : "edit" },
      timeoutMs: 120_000,
    }), 200);
    saves.push(saved.data.id);
  }
  [state.imgA, state.imgB, state.imgC] = saves;
  const favorite = expectStatus(await user1.request(`/api/images/${state.imgA}`, {
    method: "PATCH",
    json: { favorite: true },
  }), 200);
  assert(favorite.data?.favorite === true, "Favorite flag was not persisted", favorite.data);
  expectStatus(await user2.request(`/api/images/${state.imgA}`, { method: "PATCH", json: { favorite: true } }), 403);
  expectStatus(await user2.request(`/api/images/${state.imgA}`, { method: "DELETE" }), 403);

  const temp = expectStatus(await user1.request("/api/images/save", {
    method: "POST",
    json: { base64: PNG_BASE64, mimeType: "image/png" },
    timeoutMs: 120_000,
  }), 200);
  expectStatus(await user1.request(`/api/images/${temp.data.id}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/images/${temp.data.id}`, { method: "DELETE" }), 404);
  return { imgA: state.imgA, imgB: state.imgB, imgC: state.imgC };
});

await check("characters: edited-image ticket upload and blobUrl save", async () => {
  expectStatus(await user1.request("/api/images/upload", {
    method: "POST",
    json: { contentType: "image/jpeg" },
  }), 400);
  const ticket = expectStatus(await user1.request("/api/images/upload", { method: "POST", json: {} }), 200).data;
  assert(ticket?.url && ticket?.ref && ticket?.fields?.objectPath, "Edited upload ticket is malformed", ticket);
  const objectPath = ticket.fields.objectPath;
  const uploaded = await uploadViaTicket(user1, ticket, PNG_BUFFER, "image/png", objectPath.split("/").pop());
  expectStatus(uploaded, 200, 201, 204);
  const saved = expectStatus(await user1.request("/api/images/save", {
    method: "POST",
    json: { blobUrl: ticket.ref, mimeType: "image/png" },
    timeoutMs: 120_000,
  }), 200);
  state.imgD = saved.data.id;
  expectStatus(await user1.request("/api/images/save", {
    method: "POST",
    json: { blobUrl: `/uploads/u/${requireState("userIds").user2}/edited/${Date.now()}-abc123.png` },
  }), 400);
  expectStatus(await user1.request("/api/images/save", {
    method: "POST",
    json: { blobUrl: `/uploads/u/${requireState("userIds").user1}/edited/${Date.now()}-zzzzz9.png` },
  }), 404);
  return { ticketRef: ticket.ref, savedId: state.imgD };
});

await check("characters: tags list, toggle on image, delete", async () => {
  const tag = expectStatus(await user1.request("/api/tags", {
    method: "POST",
    json: { name: `sup-${runTag}`, color: "#147d64" },
  }), 200);
  const tagId = tag.data.id;
  expectStatus(await user1.request("/api/tags", { method: "POST", json: { name: `sup-${runTag}` } }), 400);
  const list = expectStatus(await user1.request("/api/tags"), 200);
  assert(list.data.some((item) => item.id === tagId), "Tag list is missing the new tag", { tagId });
  const on = expectStatus(await user1.request(`/api/images/${requireState("imgA")}/tags`, {
    method: "POST",
    json: { tagId },
  }), 200);
  assert(on.data?.action === "added", "First toggle should add the tag", on.data);
  const off = expectStatus(await user1.request(`/api/images/${requireState("imgA")}/tags`, {
    method: "POST",
    json: { tagId },
  }), 200);
  assert(off.data?.action === "removed", "Second toggle should remove the tag", off.data);
  expectStatus(await user2.request(`/api/tags/${tagId}`, { method: "DELETE" }), 404);
  expectStatus(await user1.request(`/api/tags/${tagId}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/tags/${tagId}`, { method: "DELETE" }), 404);
  return { tagId };
});

await check("characters: prompt presets CRUD", async () => {
  const created = expectStatus(await user1.request("/api/prompt-presets", {
    method: "POST",
    json: { text: `sup prompt ${runTag}` },
  }), 200);
  const duplicate = expectStatus(await user1.request("/api/prompt-presets", {
    method: "POST",
    json: { text: `sup prompt ${runTag}` },
  }), 200);
  assert(duplicate.data?.id === created.data.id, "Duplicate prompt text should refresh the same row", {
    first: created.data.id,
    second: duplicate.data.id,
  });
  expectStatus(await user1.request("/api/prompt-presets", { method: "POST", json: { text: "   " } }), 400);
  const list = expectStatus(await user1.request("/api/prompt-presets"), 200);
  assert(list.data.some((item) => item.id === created.data.id), "Prompt preset list is missing the row", list.data);
  expectStatus(await user1.request("/api/prompt-presets", { method: "DELETE", json: { id: created.data.id } }), 200);
  expectStatus(await user1.request("/api/prompt-presets", { method: "DELETE", json: { id: created.data.id } }), 404);
  return { id: created.data.id };
});

await check("characters: backgrounds CRUD and validation", async () => {
  const created = expectStatus(await user1.request("/api/backgrounds", {
    method: "POST",
    json: { name: `SUP BG ${runTag}`, imageData: PNG_BASE64, mimeType: "image/png" },
    timeoutMs: 120_000,
  }), 200);
  state.backgroundId = created.data.id;
  expectStatus(await user1.request("/api/backgrounds", {
    method: "POST",
    json: { name: "x".repeat(101), imageData: PNG_BASE64, mimeType: "image/png" },
  }), 400);
  expectStatus(await user1.request("/api/backgrounds", {
    method: "POST",
    json: { name: "gif bg", imageData: PNG_BASE64, mimeType: "image/gif" },
  }), 400);
  expectStatus(await user1.request("/api/backgrounds", { method: "POST", json: { name: "no image" } }), 400);
  const list = expectStatus(await user1.request("/api/backgrounds"), 200);
  assert(list.data.some((item) => item.id === state.backgroundId), "Background list is missing the new row", {
    id: state.backgroundId,
  });
  return { id: state.backgroundId };
});

await check("characters: admin ?userId= impersonation vs silent ignore", async () => {
  const user1Id = requireState("userIds").user1;
  const presetId = requireState("presetId");
  const impersonated = expectStatus(await admin.request(`/api/presets?userId=${encodeURIComponent(user1Id)}`), 200);
  const allAdminSees = [
    ...(impersonated.data?.ungrouped || []),
    ...((impersonated.data?.groups || []).flatMap((group) => group.presets || [])),
  ];
  assert(allAdminSees.some((item) => item.id === presetId), "Admin impersonation did not surface user1's preset", {
    presetId,
  });
  const ignored = expectStatus(await user2.request(`/api/presets?userId=${encodeURIComponent(user1Id)}`), 200);
  const allUser2Sees = [
    ...(ignored.data?.ungrouped || []),
    ...((ignored.data?.groups || []).flatMap((group) => group.presets || [])),
  ];
  assert(!allUser2Sees.some((item) => item.id === presetId), "Non-admin userId= must be silently ignored", { presetId });
  return { adminSaw: allAdminSees.length, user2Saw: allUser2Sees.length };
});

await check("characters: cross-user IDOR negatives", async () => {
  const presetId = requireState("presetId");
  expectStatus(await user2.request(`/api/presets/${presetId}`), 404);
  expectStatus(await user2.request(`/api/presets/${presetId}`, { method: "PATCH", json: { name: "hijack" } }), 404);
  expectStatus(await user2.request(`/api/backgrounds/${requireState("backgroundId")}`, { method: "DELETE" }), 404);
  return { presetId };
});

// ─────────────────────────────────────────────────────────── studio ──

await check("studio: project create and cut PATCH validation (videoApproved)", async () => {
  const created = expectStatus(await user1.request("/api/studio/projects", {
    method: "POST",
    json: { title: `SUP Project ${runTag}`, description: "supplement project", aspectRatio: "9:16" },
  }), 201);
  const project = created.data.project;
  assert(project?.cuts?.length === 1, "New project should have exactly one cut", created.data);
  state.projectId = project.id;
  state.cutId = project.cuts[0].id;
  const patched = expectStatus(await user1.request(`/api/studio/cuts/${state.cutId}`, {
    method: "PATCH",
    json: { title: "SUP cut", durationMs: 500 },
  }), 200);
  assert(patched.data?.cut ? patched.data.cut.durationMs === 1000 : true, "durationMs should clamp to 1000", patched.data);
  expectStatus(await user1.request(`/api/studio/cuts/${state.cutId}`, {
    method: "PATCH",
    json: { dialoguePlan: "oops" },
  }), 400);
  expectStatus(await user1.request(`/api/studio/cuts/${state.cutId}`, {
    method: "PATCH",
    json: { videoApproved: true },
  }), 400);
  expectStatus(await user1.request(`/api/studio/cuts/${state.cutId}`, {
    method: "PATCH",
    json: { videoApproved: false },
  }), 200);
  expectStatus(await user2.request(`/api/studio/cuts/${state.cutId}`, {
    method: "PATCH",
    json: { title: "hijack" },
  }), 404);
  return { projectId: state.projectId, cutId: state.cutId };
});

await check("studio: canvas-presets batch (watermark apply, invalid kinds)", async () => {
  const projectId = requireState("projectId");
  expectStatus(await user1.request(`/api/studio/projects/${projectId}/canvas-presets`, {
    method: "POST",
    json: { kind: "stamp", action: "apply" },
  }), 400);
  expectStatus(await user1.request(`/api/studio/projects/${projectId}/canvas-presets`, {
    method: "POST",
    json: { kind: "caption", action: "delete" },
  }), 400);
  const watermark = expectStatus(await user1.request(`/api/studio/projects/${projectId}/canvas-presets`, {
    method: "POST",
    json: { kind: "watermark", action: "apply", scope: "all", settings: { text: `SUP ${runTag}` } },
  }), 200);
  assert(watermark.data?.ok === true && watermark.data?.updated >= 1, "Watermark batch should update at least one cut", watermark.data);
  const caption = expectStatus(await user1.request(`/api/studio/projects/${projectId}/canvas-presets`, {
    method: "POST",
    json: { kind: "caption", action: "apply", scope: "all", settings: {} },
  }), 200);
  expectStatus(await user2.request(`/api/studio/projects/${projectId}/canvas-presets`, {
    method: "POST",
    json: { kind: "watermark", action: "apply" },
  }), 404);
  return { watermark: watermark.data, caption: caption.data };
});

await check("studio: cut duplicate and delete", async () => {
  const projectId = requireState("projectId");
  expectStatus(await user1.request(`/api/studio/projects/${projectId}/cuts`, {
    method: "POST",
    json: { sourceCutId: "sup-nonexistent-cut" },
  }), 404);
  const duplicated = expectStatus(await user1.request(`/api/studio/projects/${projectId}/cuts`, {
    method: "POST",
    json: { sourceCutId: requireState("cutId"), title: "SUP dup cut" },
  }), 201);
  const cut2 = duplicated.data.cut.id;
  expectStatus(await user2.request(`/api/studio/cuts/${cut2}`, { method: "DELETE" }), 404);
  expectStatus(await user1.request(`/api/studio/cuts/${cut2}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/studio/cuts/${cut2}`, { method: "DELETE" }), 404);
  return { cut2 };
});

await check("studio: briefs PATCH/DELETE", async () => {
  const created = expectStatus(await user1.request("/api/studio/briefs", {
    method: "POST",
    json: { content: `# SUP 브리프 ${runTag}\n로봇이 테스트를 통과한다.` },
  }), 201);
  const briefId = created.data.brief.id;
  expectStatus(await user1.request("/api/studio/briefs", { method: "POST", json: { content: "" } }), 400);
  const patched = expectStatus(await user1.request(`/api/studio/briefs/${briefId}`, {
    method: "PATCH",
    json: { title: `SUP 수정 ${runTag}` },
  }), 200);
  expectStatus(await user1.request(`/api/studio/briefs/${briefId}`, { method: "PATCH", json: {} }), 400);
  expectStatus(await user2.request(`/api/studio/briefs/${briefId}`, { method: "PATCH", json: { title: "hijack" } }), 404);
  expectStatus(await user1.request(`/api/studio/briefs/${briefId}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/studio/briefs/${briefId}`, { method: "DELETE" }), 404);
  return { briefId, title: patched.data?.brief?.title };
});

await check("studio: brief file import (md happy, unsupported, missing)", async () => {
  const emptyForm = new FormData();
  expectStatus(await user1.request("/api/studio/briefs/import", {
    method: "POST",
    body: emptyForm,
    timeoutMs: 120_000,
  }), 400);

  const mdForm = new FormData();
  mdForm.append(
    "file",
    new Blob([`# SUP 기획 ${runTag}\n\n브리프 본문입니다.`], { type: "text/markdown" }),
    "sup-brief.md",
  );
  const imported = expectStatus(await user1.request("/api/studio/briefs/import", {
    method: "POST",
    body: mdForm,
    timeoutMs: 120_000,
  }), 200);
  assert(
    typeof imported.data?.content === "string" && imported.data.content.includes("브리프 본문"),
    "Imported markdown content is missing",
    imported.data,
  );
  assert(imported.data?.title === "sup-brief", "Import title should derive from the filename", imported.data);

  const badForm = new FormData();
  badForm.append("file", new Blob([Buffer.from("MZfakebinary")], { type: "application/octet-stream" }), "sup.exe");
  expectStatus(await user1.request("/api/studio/briefs/import", {
    method: "POST",
    body: badForm,
    timeoutMs: 120_000,
  }), 400);
  return { title: imported.data.title, truncated: imported.data.truncated };
});

await check("studio: brief import-url SSRF guard rejects loopback", async () => {
  expectStatus(await user1.request("/api/studio/briefs/import-url", { method: "POST", json: {} }), 400);
  const loopback = expectStatus(await user1.request("/api/studio/briefs/import-url", {
    method: "POST",
    json: { url: "http://127.0.0.1/sup-brief.md" },
  }), 400);
  const localhost = expectStatus(await user1.request("/api/studio/briefs/import-url", {
    method: "POST",
    json: { url: "http://localhost/sup-brief.md" },
  }), 400);
  const devPort = expectStatus(await user1.request("/api/studio/briefs/import-url", {
    method: "POST",
    json: { url: `${baseUrl}/uploads/sup.md` },
  }), 400);
  return {
    loopback: loopback.data?.error,
    localhost: localhost.data?.error,
    devPort: devPort.data?.error,
  };
});

await check("studio: asset ticket upload, confirm, and delete", async () => {
  const projectId = requireState("projectId");
  expectStatus(await user1.request("/api/studio/assets/upload", {
    method: "POST",
    json: { projectId, contentType: "image/svg+xml" },
  }), 400);
  const ticket = expectStatus(await user1.request("/api/studio/assets/upload", {
    method: "POST",
    json: { projectId, contentType: "image/png" },
  }), 200).data;
  assert(ticket?.provider === "local" && ticket?.url === "/api/media/upload", "Local ticket contract broken", ticket);
  expectStatus(await uploadViaTicket(user1, ticket, PNG_BUFFER, "image/png", ticket.fields.objectPath.split("/").pop()), 200, 201, 204);
  const confirmed = expectStatus(await user1.request("/api/studio/assets/upload/confirm", {
    method: "POST",
    json: { ref: ticket.ref, projectId, name: `SUP asset ${runTag}` },
    timeoutMs: 120_000,
  }), 200);
  const assetId = confirmed.data.asset.id;
  expectStatus(await user1.request("/api/studio/assets/upload/confirm", {
    method: "POST",
    json: {
      ref: `/uploads/u/${requireState("userIds").user2}/studio-assets/${Date.now()}-abc123.png`,
      projectId,
    },
  }), 403);
  expectStatus(await user1.request("/api/studio/assets/upload/confirm", {
    method: "POST",
    json: {
      ref: `/uploads/u/${requireState("userIds").user1}/studio-assets/${Date.now()}-zzzzz9.png`,
      projectId,
    },
  }), 404);
  expectStatus(await user1.request(`/api/studio/assets/${assetId}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/studio/assets/${assetId}`, { method: "DELETE" }), 404);
  return { assetId, ref: ticket.ref };
});

await check("studio: remove-background provider status", async () => {
  const status = expectStatus(await user1.request("/api/studio/remove-background"), 200);
  assert(status.data?.provider === "nano-banana-2", "Cutout should use Nano Banana 2", status.data);
  assert(typeof status.data?.configured === "boolean", "Configured status should be explicit", status.data);
  return { provider: status.data.provider, configured: status.data.configured };
});

// ──────────────────────────────────────────────── generation-jobs ──

await check("jobs: list and filters", async () => {
  const list = expectStatus(await user1.request("/api/jobs"), 200);
  assert(Array.isArray(list.data?.jobs), "Jobs list should return an array", list.data);
  const clamped = expectStatus(await user1.request("/api/jobs?limit=999"), 200);
  assert(Array.isArray(clamped.data?.jobs) && clamped.data.jobs.length <= 50, "limit must clamp to 50", {
    length: clamped.data?.jobs?.length,
  });
  const filtered = expectStatus(await user1.request("/api/jobs?kind=video&status=succeeded&limit=10"), 200);
  assert(
    (filtered.data?.jobs || []).every((job) => job.kind === "video" && job.status === "succeeded"),
    "kind/status filters leaked other jobs",
    filtered.data,
  );
  return { total: list.data.jobs.length, filtered: filtered.data.jobs.length };
});

await check("jobs: /api/tasks/* reject without shared secret", async () => {
  const bare = new HttpClient("tasks");
  for (const endpoint of ["/api/tasks/image", "/api/tasks/video", "/api/tasks/video-poll"]) {
    expectStatus(await bare.request(endpoint, { method: "POST", json: { jobId: "x", operationName: "y" } }), 401);
    expectStatus(await bare.request(endpoint, {
      method: "POST",
      json: { jobId: "x", operationName: "y" },
      headers: { "x-tasks-token": "sup-bogus-token" },
    }), 401);
  }
  return { endpoints: 3 };
});

await check("jobs: insufficient credits return 402 (generate, video, chat)", async () => {
  const generate = expectStatus(await poor.request("/api/generate", {
    method: "POST",
    json: { jobKind: "character", mode: "text", prompt: `sup broke character ${runTag}` },
    timeoutMs: 90_000,
  }), 402);
  const video = expectStatus(await poor.request("/api/jobs", {
    method: "POST",
    json: { kind: "video", prompt: `sup broke video ${runTag}`, durationSeconds: 4, generateAudio: false },
    timeoutMs: 90_000,
  }), 402);
  const chat = expectStatus(await poor.request("/api/chat", {
    method: "POST",
    json: { message: "sup broke chat", history: [] },
    timeoutMs: 90_000,
  }), 402);
  const badMode = expectStatus(await user1.request("/api/generate", {
    method: "POST",
    json: { jobKind: "character", mode: "bogus", prompt: "x" },
  }), 400);
  const jobs = expectStatus(await poor.request("/api/jobs?status=failed"), 200);
  const rejected = (jobs.data?.jobs || []).find((job) => job.stage === "credit_rejected");
  assert(rejected, "402 requests should leave a failed credit_rejected job", jobs.data);
  state.poorFailedJobId = rejected.id;
  return { generate: generate.status, video: video.status, chat: chat.status, badMode: badMode.status, jobId: rejected.id };
});

await check("jobs: video contract (kind image 400, bad duration 400, seedance 503 no charge)", async () => {
  expectStatus(await user1.request("/api/jobs", { method: "POST", json: { kind: "image", prompt: "x" } }), 400);
  expectStatus(await user1.request("/api/jobs", {
    method: "POST",
    json: { kind: "video", prompt: "x", durationSeconds: 5 },
  }), 400);
  const before = await balance(user1);
  const seedance = expectStatus(await user1.request("/api/jobs", {
    method: "POST",
    json: { kind: "video", provider: "seedance", prompt: `sup seedance ${runTag}`, durationSeconds: 6 },
    timeoutMs: 90_000,
  }), 503);
  assert(seedance.data?.code === "provider_not_configured", "Seedance should be provider_not_configured", seedance.data);
  const after = await balance(user1);
  assert(after === before, "Seedance 503 must not charge credits", { before, after });
  return { seedance: seedance.data };
});

await check("jobs: retry contract (invalid action 400, foreign 404, broke retry 402)", async () => {
  const failedJobId = requireState("poorFailedJobId");
  expectStatus(await poor.request(`/api/jobs/${failedJobId}`, { method: "POST", json: { action: "cancel" } }), 400);
  expectStatus(await user2.request(`/api/jobs/${failedJobId}`, { method: "POST", json: { action: "retry" } }), 404);
  const brokeRetry = expectStatus(await poor.request(`/api/jobs/${failedJobId}`, {
    method: "POST",
    json: { action: "retry" },
    timeoutMs: 90_000,
  }), 402);
  return { failedJobId, brokeRetry: brokeRetry.status };
});

// ────────────────────────────────────────────────── media-storage ──

await check("media: local upload policy negatives (403/400/413)", async () => {
  const user1Id = requireState("userIds").user1;
  const user2Id = requireState("userIds").user2;
  const foreign = await uploadLocal(
    user1,
    `u/${user2Id}/studio-assets/${Date.now()}-abc123.png`,
    PNG_BUFFER,
    "image/png",
    "sup.png",
  );
  expectStatus(foreign, 403);
  const badFolder = await uploadLocal(
    user1,
    `u/${user1Id}/foo/${Date.now()}-abc123.png`,
    PNG_BUFFER,
    "image/png",
    "sup.png",
  );
  expectStatus(badFolder, 400);
  const mimeMismatch = await uploadLocal(
    user1,
    `u/${user1Id}/studio-assets/${Date.now()}-abc123.png`,
    PNG_BUFFER,
    "image/jpeg",
    "sup.png",
  );
  expectStatus(mimeMismatch, 400);
  const oversize = await uploadLocal(
    user1,
    `u/${user1Id}/edited/${Date.now()}-abc123.png`,
    Buffer.alloc(21 * 1024 * 1024, 7),
    "image/png",
    "sup-big.png",
  );
  expectStatus(oversize, 413);
  const missingFile = new FormData();
  missingFile.append("objectPath", `u/${user1Id}/edited/${Date.now()}-abc123.png`);
  expectStatus(await user1.request("/api/media/upload", { method: "POST", body: missingFile }), 400);
  return {
    foreign: foreign.status,
    badFolder: badFolder.status,
    mimeMismatch: mimeMismatch.status,
    oversize: oversize.status,
  };
});

await check("media: gateway key ACL branches (400/403 + local 500)", async () => {
  const user1Id = requireState("userIds").user1;
  const user2Id = requireState("userIds").user2;
  expectStatus(await user1.request("/api/media/!!!"), 400);
  expectStatus(await user1.request(`/api/media/${b64url("../etc/passwd")}`), 400);
  expectStatus(await user1.request(`/api/media/${b64url(`u/${user2Id}/images/sup.png`)}`), 403);
  expectStatus(await user1.request(`/api/media/${b64url("shared/sup.png")}`), 403);
  expectStatus(await anonymous.request(`/api/media/${b64url(`u/${user1Id}/images/sup.png`)}`), 403);
  // public/* passes the ACL and then hits the documented local "no bucket" branch.
  const publicPath = expectStatus(await anonymous.request(`/api/media/${b64url("public/sup.png")}`), 500);
  return { publicPathLocal: publicPath.status };
});

await check("media: shorts ticket upload, confirm idempotency, retry 409", async () => {
  const projectId = requireState("projectId");
  expectStatus(await user1.request("/api/shorts/upload", {
    method: "POST",
    json: { projectId, contentType: "video/webm" },
  }), 400);
  const ticket = expectStatus(await user1.request("/api/shorts/upload", {
    method: "POST",
    json: { projectId, contentType: "video/mp4" },
  }), 200).data;
  assert(ticket?.provider === "local" && ticket?.ref, "Shorts ticket contract broken", ticket);
  const mp4 = Buffer.from(`sup-e2e-fake-mp4-${runTag}`);
  expectStatus(await uploadViaTicket(user1, ticket, mp4, "video/mp4", ticket.fields.objectPath.split("/").pop()), 200, 201, 204);
  const confirm = expectStatus(await user1.request("/api/shorts/upload/confirm", {
    method: "POST",
    json: { ref: ticket.ref, projectId, title: `SUP Short ${runTag}`, cutCount: 2 },
    timeoutMs: 120_000,
  }), 200);
  assert(confirm.data?.created === true && confirm.data?.jobId, "Shorts confirm should create a job", confirm.data);
  state.shortJobId = confirm.data.jobId;
  state.shortBlobUrl = confirm.data.blobUrl || ticket.ref;
  const replay = expectStatus(await user1.request("/api/shorts/upload/confirm", {
    method: "POST",
    json: { ref: ticket.ref, projectId, title: `SUP Short ${runTag}`, cutCount: 2 },
    timeoutMs: 120_000,
  }), 200);
  assert(replay.data?.created === false && replay.data?.jobId === state.shortJobId, "Confirm replay should be idempotent", replay.data);
  expectStatus(await user1.request("/api/shorts/upload/confirm", {
    method: "POST",
    json: {
      ref: `/uploads/u/${requireState("userIds").user2}/shorts/${Date.now()}-abc123.mp4`,
      projectId,
    },
  }), 403);
  // Succeeded (non-failed) job cannot be retried.
  const retry = expectStatus(await user1.request(`/api/jobs/${state.shortJobId}`, {
    method: "POST",
    json: { action: "retry" },
  }), 409);
  return { jobId: state.shortJobId, retryOnSucceeded: retry.status };
});

await check("media: archive filters and delete", async () => {
  const all = expectStatus(await user1.request("/api/archive?page=1&kind=all"), 200);
  assert(all.data?.pagination?.pageSize === 24, "Archive pagination contract broken", all.data?.pagination);
  const items = all.data?.items || [];
  const legacyKey = `image:${requireState("imgC")}`;
  assert(items.some((item) => item.key === legacyKey), "Legacy image is missing from the archive", { legacyKey });
  const artifactItem = items.find((item) => item.key?.startsWith("artifact:") && item.url === state.shortBlobUrl);
  expectStatus(await user1.request("/api/archive?page=1&kind=video"), 200);
  expectStatus(await user1.request(`/api/archive?page=1&kind=all&q=${encodeURIComponent("sup-no-match-zzz")}`), 200);
  expectStatus(await user1.request("/api/archive?page=999&kind=bogus"), 200);

  expectStatus(await user1.request("/api/archive/bogus", { method: "DELETE" }), 400);
  const deleted = expectStatus(await user1.request(`/api/archive/${encodeURIComponent(legacyKey)}`, { method: "DELETE" }), 200);
  assert(deleted.data?.ok === true, "Archive delete should return ok:true", deleted.data);
  expectStatus(await user1.request(`/api/archive/${encodeURIComponent(legacyKey)}`, { method: "DELETE" }), 404);
  if (artifactItem) {
    expectStatus(await user1.request(`/api/archive/${encodeURIComponent(artifactItem.key)}`, { method: "DELETE" }), 200);
    state.shortArtifactDeleted = true;
  }
  return { legacyKey, artifactKey: artifactItem?.key || null, freedBytes: deleted.data?.freedBytes };
});

await check("media: history favorites and presetId filters", async () => {
  const base = expectStatus(await user1.request("/api/history?limit=5"), 200);
  assert(Array.isArray(base.data), "History should be an array", base.data);
  const favorites = expectStatus(await user1.request("/api/history?favorites=true&limit=100"), 200);
  assert(
    favorites.data.some((request) => (request.images || []).some((image) => image.id === requireState("imgA"))),
    "Favorited image is missing from favorites history",
    { imgA: state.imgA },
  );
  assert(
    favorites.data.every((request) => (request.images || []).every((image) => image.favorite === true)),
    "favorites=true leaked non-favorite images",
    favorites.data,
  );
  const byPreset = expectStatus(await user1.request(`/api/history?presetId=${encodeURIComponent(requireState("presetId"))}&limit=100`), 200);
  assert(Array.isArray(byPreset.data), "presetId filter should still return an array", byPreset.data);
  return { total: base.data.length, favorites: favorites.data.length, byPreset: byPreset.data.length };
});

await check("media: shorts providers catalog", async () => {
  const providers = expectStatus(await user1.request("/api/shorts/providers"), 200);
  assert(providers.data?.promptCreditCost === 1, "promptCreditCost should be 1", providers.data);
  const ids = (providers.data?.providers || []).map((provider) => provider.id);
  assert(ids.includes("veo") && ids.includes("seedance"), "Provider catalog should list veo and seedance", ids);
  const seedance = providers.data.providers.find((provider) => provider.id === "seedance");
  assert(seedance?.configured === false, "Seedance should be unconfigured locally", seedance);
  expectStatus(await new HttpClient("anon-providers").request("/api/shorts/providers"), 401);
  return { ids };
});

if (skipPaid) {
  await check("media: shorts prompt (SKIPPED via E2E_SUPPLEMENT_SKIP_PAID)", async () => ({ skipped: true }));
} else {
  await check("media: shorts prompt generation charges exactly 1 credit", async () => {
    const cutId = requireState("cutId");
    expectStatus(await user1.request("/api/shorts/prompt", {
      method: "POST",
      json: { cutId, brief: "", provider: "veo", durationSeconds: 4 },
    }), 400);
    expectStatus(await user1.request("/api/shorts/prompt", {
      method: "POST",
      json: { cutId, brief: "카페", provider: "veo", durationSeconds: 5 },
    }), 400);
    expectStatus(await user2.request("/api/shorts/prompt", {
      method: "POST",
      json: { cutId, brief: "남의 컷", provider: "veo", durationSeconds: 4 },
    }), 404);
    const before = await balance(user1);
    const generated = expectStatus(await user1.request("/api/shorts/prompt", {
      method: "POST",
      json: {
        cutId,
        brief: "카페에서 커피를 마시는 로봇, 테스트용 짧은 장면",
        provider: "veo",
        durationSeconds: 4,
        resolution: "720p",
        generateAudio: false,
      },
      timeoutMs: 90_000,
    }), 200);
    assert(typeof generated.data?.prompt === "string" && generated.data.prompt.length >= 20, "Video prompt is too short", generated.data);
    const after = await balance(user1);
    assert(before - after === 1, "Shorts prompt must charge exactly 1 credit", { before, after });
    return { charged: before - after, promptLength: generated.data.prompt.length };
  });
}

// ──────────────────────────────────────────────────────── community ──

await check("community: plaza profile and nickname conflict 409", async () => {
  const profile = expectStatus(await user1.request("/api/plaza/profile"), 200);
  expectStatus(await user1.request("/api/plaza/profile", { method: "POST", json: { nickname: "a" } }), 400);
  const nick1 = `s1${runTag}`;
  const nick2 = `s2${runTag}`;
  expectStatus(await user1.request("/api/plaza/profile", { method: "POST", json: { nickname: nick1 } }), 200);
  expectStatus(await user2.request("/api/plaza/profile", { method: "POST", json: { nickname: nick1 } }), 409);
  expectStatus(await user2.request("/api/plaza/profile", { method: "POST", json: { nickname: nick2 } }), 200);
  return { initial: profile.data, nick1, nick2 };
});

await check("community: board list API and filters", async () => {
  const bare = new HttpClient("board-anon");
  const list = expectStatus(await bare.request("/api/board?page=1&limit=20"), 200);
  assert(Array.isArray(list.data?.posts) && typeof list.data?.total === "number", "Board list contract broken", list.data);
  const clamped = expectStatus(await bare.request("/api/board?limit=999"), 200);
  assert(clamped.data?.limit === 100, "limit should clamp to 100", clamped.data);
  const popular = expectStatus(await bare.request("/api/board?sort=popular"), 200);
  assert(popular.data?.sort === "popular", "sort=popular should be echoed", popular.data);
  return { total: list.data.total, clampedLimit: clamped.data.limit };
});

await check("community: board post lifecycle (likes, comment unlike, pin, delete)", async () => {
  const post = expectStatus(await user1.request("/api/board", {
    method: "POST",
    json: {
      title: `[SUP ${runTag}] lifecycle post`,
      content: "supplement lifecycle post",
      imageIds: [requireState("imgA")],
      links: [baseUrl],
    },
  }), 201);
  const postId = post.data.id;
  expectStatus(await user1.request("/api/board", { method: "POST", json: { title: "", content: "x" } }), 400);

  const likeOn = expectStatus(await user2.request(`/api/board/${postId}/like`, { method: "POST" }), 200);
  assert(likeOn.data?.liked === true, "First like should turn on", likeOn.data);
  const likeOff = expectStatus(await user2.request(`/api/board/${postId}/like`, { method: "POST" }), 200);
  assert(likeOff.data?.liked === false, "Second like should toggle off", likeOff.data);

  const comment = expectStatus(await user2.request(`/api/board/${postId}/comments`, {
    method: "POST",
    json: { content: `sup comment ${runTag}` },
  }), 201);
  const commentId = comment.data.id;
  expectStatus(await user2.request(`/api/board/${postId}/comments`, { method: "POST", json: { content: "   " } }), 400);
  const cLikeOn = expectStatus(await user1.request(`/api/board/${postId}/comments/${commentId}/like`, { method: "POST" }), 200);
  assert(cLikeOn.data?.liked === true, "Comment like should turn on", cLikeOn.data);
  const cLikeOff = expectStatus(await user1.request(`/api/board/${postId}/comments/${commentId}/like`, { method: "POST" }), 200);
  assert(cLikeOff.data?.liked === false, "Comment like should toggle off", cLikeOff.data);

  const pinOn = expectStatus(await admin.request(`/api/board/${postId}/pin`, { method: "POST" }), 200);
  assert(pinOn.data?.pinned === true, "Admin pin should turn on", pinOn.data);
  expectStatus(await user2.request(`/api/board/${postId}/pin`, { method: "POST" }), 403);
  const pinOff = expectStatus(await admin.request(`/api/board/${postId}/pin`, { method: "POST" }), 200);
  assert(pinOff.data?.pinned === false, "Admin pin should toggle off", pinOff.data);

  const detail = expectStatus(await user2.request(`/api/board/${postId}`), 200);
  assert(detail.data?.comments?.length === 1, "Post detail should expose the comment", detail.data);

  expectStatus(await user2.request(`/api/board/${postId}`, { method: "DELETE" }), 403);
  expectStatus(await user1.request(`/api/board/${postId}`, { method: "DELETE" }), 200);
  expectStatus(await user2.request(`/api/board/${postId}`), 404);
  return { postId, commentId };
});

await check("community: notifications PATCH ids variant", async () => {
  const list = expectStatus(await user1.request("/api/notifications"), 200);
  assert(Array.isArray(list.data?.notifications), "Notifications list contract broken", list.data);
  expectStatus(await user1.request("/api/notifications", { method: "PATCH", json: {} }), 400);
  const noop = expectStatus(await user1.request("/api/notifications", {
    method: "PATCH",
    json: { ids: ["sup-nonexistent-job"] },
  }), 200);
  assert(noop.data?.count === 0, "Unknown ids should be a silent no-op", noop.data);
  const ids = (list.data.notifications || []).slice(0, 3).map((item) => item.id);
  const marked = ids.length > 0
    ? expectStatus(await user1.request("/api/notifications", { method: "PATCH", json: { ids } }), 200)
    : null;
  expectStatus(await user1.request("/api/notifications", { method: "PATCH", json: { all: true } }), 200);
  const after = expectStatus(await user1.request("/api/notifications"), 200);
  assert(after.data?.unreadCount === 0, "unreadCount should be 0 after all:true", after.data);
  return { idsMarked: marked?.data?.count ?? 0, unreadAfter: after.data.unreadCount };
});

await check("community: marketplace catalog and purchase flow", async () => {
  const catalog = expectStatus(await user2.request("/api/marketplace"), 200);
  assert(Array.isArray(catalog.data), "Marketplace should return an array", catalog.data);
  expectStatus(await user2.request("/api/marketplace/purchase", { method: "POST", json: {} }), 400);
  expectStatus(await user2.request("/api/marketplace/purchase", {
    method: "POST",
    json: { presetId: "a", groupId: "b" },
  }), 400);
  expectStatus(await user2.request("/api/marketplace/purchase", {
    method: "POST",
    json: { presetId: "sup-nonexistent-preset" },
  }), 404);

  const items = catalog.data;
  const target = items.find((item) => item.owned === false) || items[0];
  assert(target, "Marketplace is empty; seeded presets (wony/anian) are missing", items);
  const body = target.type === "group" ? { groupId: target.id } : { presetId: target.id };
  if (target.owned === false) {
    const bought = expectStatus(await user2.request("/api/marketplace/purchase", { method: "POST", json: body }), 200);
    assert(bought.data?.ok === true, "Purchase should be ok:true", bought.data);
  }
  const duplicate = expectStatus(await user2.request("/api/marketplace/purchase", { method: "POST", json: body }), 400);
  const refreshed = expectStatus(await user2.request("/api/marketplace"), 200);
  const owned = refreshed.data.find((item) => item.id === target.id && item.type === target.type);
  assert(owned?.owned === true, "Purchased item should be flagged owned", owned);
  return { target: { id: target.id, type: target.type, name: target.name }, duplicate: duplicate.data?.error };
});

await check("community: contents CRUD with slots reorder and slot delete", async () => {
  const content = expectStatus(await user1.request("/api/contents", { method: "POST", json: {} }), 200);
  const contentId = content.data.id;
  assert(content.data?.title === "새 콘텐츠", "Default content title mismatch", content.data);
  expectStatus(await user1.request(`/api/contents/${contentId}`, {
    method: "PATCH",
    json: { title: `SUP 콘텐츠 ${runTag}`, comment: "supplement" },
  }), 200);
  expectStatus(await user2.request(`/api/contents/${contentId}`), 403);
  expectStatus(await user2.request(`/api/contents/${contentId}`, { method: "PATCH", json: { title: "hijack" } }), 403);

  expectStatus(await user1.request(`/api/contents/${contentId}/slots`, { method: "POST", json: {} }), 400);
  expectStatus(await user1.request(`/api/contents/${contentId}/slots`, {
    method: "POST",
    json: { imageId: "sup-nonexistent-image" },
  }), 404);
  const slotA = expectStatus(await user1.request(`/api/contents/${contentId}/slots`, {
    method: "POST",
    json: { imageId: requireState("imgA"), order: 0 },
  }), 200);
  const slotB = expectStatus(await user1.request(`/api/contents/${contentId}/slots`, {
    method: "POST",
    json: { imageId: requireState("imgB"), order: 1 },
  }), 200);

  expectStatus(await user1.request(`/api/contents/${contentId}/slots`, {
    method: "PUT",
    json: { slots: [{ id: slotA.data.id }] },
  }), 400);
  expectStatus(await user1.request(`/api/contents/${contentId}/slots`, {
    method: "PUT",
    json: { slots: [{ id: slotA.data.id, order: 1 }, { id: slotB.data.id, order: 0 }] },
  }), 200);
  const detail = expectStatus(await user1.request(`/api/contents/${contentId}`), 200);
  const ordered = (detail.data?.slots || []).map((slot) => slot.id);
  assert(ordered[0] === slotB.data.id && ordered[1] === slotA.data.id, "Slot reorder did not persist", ordered);

  expectStatus(await user1.request(`/api/contents/${contentId}/slots/${slotB.data.id}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/contents/${contentId}/slots/${slotB.data.id}`, { method: "DELETE" }), 404);
  const afterDelete = expectStatus(await user1.request(`/api/contents/${contentId}`), 200);
  assert(afterDelete.data?.slots?.length === 1, "Slot delete did not persist", afterDelete.data);

  expectStatus(await user1.request(`/api/contents/${contentId}`, { method: "DELETE" }), 200);
  expectStatus(await user1.request(`/api/contents/${contentId}`), 404);
  return { contentId, slotA: slotA.data.id, slotB: slotB.data.id };
});

// ────────────────────────────────────────────── payments-external ──

await check("payments: credits wallet shape", async () => {
  const wallet = expectStatus(await user1.request("/api/credits"), 200);
  assert(typeof wallet.data?.balance === "number", "Wallet balance missing", wallet.data);
  assert(Array.isArray(wallet.data?.products) && wallet.data.products.length === 4, "Wallet should list 4 products", wallet.data?.products);
  assert(wallet.data?.provider?.configured === true, "KakaoPay provider should be configured locally", wallet.data?.provider);
  assert(Array.isArray(wallet.data?.ledger) && Array.isArray(wallet.data?.payments), "Ledger/payments arrays missing", {
    ledger: Array.isArray(wallet.data?.ledger),
    payments: Array.isArray(wallet.data?.payments),
  });
  expectStatus(await new HttpClient("anon-credits").request("/api/credits"), 401);
  return { balance: wallet.data.balance, products: wallet.data.products.length, testMode: wallet.data.provider.testMode };
});

await check("payments: kakao approve/fail garbage-param redirects", async () => {
  const approveNoParams = expectStatus(await user1.request("/api/payments/kakao/approve"), 302, 307);
  assert((approveNoParams.headers.location || "").includes("payment=failed"), "approve without params should redirect failed", approveNoParams.headers);
  const approveBogus = expectStatus(await user1.request(
    "/api/payments/kakao/approve?order=sup-bogus-order&pg_token=sup-bogus-token",
  ), 302, 307);
  assert((approveBogus.headers.location || "").includes("payment=failed"), "approve with bogus order should redirect failed", approveBogus.headers);
  const approveAnon = expectStatus(await new HttpClient("anon-approve").request("/api/payments/kakao/approve"), 302, 307);
  assert((approveAnon.headers.location || "").includes("/login"), "unauthenticated approve should redirect to /login", approveAnon.headers);

  const failNoParams = expectStatus(await user1.request("/api/payments/kakao/fail"), 302, 307);
  assert((failNoParams.headers.location || "").includes("payment=failed"), "fail without order should still redirect failed", failNoParams.headers);
  const failAnon = expectStatus(await new HttpClient("anon-fail").request("/api/payments/kakao/fail"), 302, 307);
  assert((failAnon.headers.location || "").includes("/login"), "unauthenticated fail should redirect to /login", failAnon.headers);
  return {
    approveNoParams: approveNoParams.headers.location,
    approveBogus: approveBogus.headers.location,
    failNoParams: failNoParams.headers.location,
  };
});

await check("external: all six instagram endpoints local contract", async () => {
  expectStatus(await new HttpClient("anon-ig").request("/api/instagram/auth"), 401);
  const auth = expectStatus(await user1.request("/api/instagram/auth"), 200);
  const authUrl = auth.data?.url || "";
  assert(authUrl.includes("facebook.com") && authUrl.includes("state="), "Instagram auth URL contract broken", auth.data);
  const oauthState = new URL(authUrl).searchParams.get("state");
  assert(oauthState, "Instagram auth URL is missing state", authUrl);

  const noCode = expectStatus(await user1.request(
    `/api/instagram/callback?state=${encodeURIComponent(oauthState)}`,
  ), 302, 307);
  assert((noCode.headers.location || "").includes("ig_error=no_code"), "callback with state but no code should be no_code", noCode.headers);
  const invalidState = expectStatus(await user2.request("/api/instagram/callback?state=whatever&code=x"), 302, 307);
  assert((invalidState.headers.location || "").includes("ig_error=invalid_state"), "callback without cookie should be invalid_state", invalidState.headers);
  const anonCallback = expectStatus(await new HttpClient("anon-igcb").request("/api/instagram/callback"), 302, 307);
  assert((anonCallback.headers.location || "").includes("/login"), "unauthenticated callback should redirect /login", anonCallback.headers);

  const disconnect = expectStatus(await user1.request("/api/instagram/disconnect", { method: "DELETE" }), 200);
  assert(disconnect.data?.ok === true, "Disconnect should be idempotent ok:true", disconnect.data);
  expectStatus(await user1.request("/api/instagram/disconnect", { method: "DELETE" }), 200);

  const posts = expectStatus(await user1.request("/api/instagram/posts"), 400);
  expectStatus(await user1.request("/api/instagram/publish", { method: "POST", json: { imageId: "" } }), 400);
  const publish = expectStatus(await user1.request("/api/instagram/publish", {
    method: "POST",
    json: { imageId: "sup-whatever", caption: "sup" },
  }), 400);
  const insights = expectStatus(await user1.request("/api/instagram/insights"), 400);
  return {
    authState: oauthState,
    posts: posts.data?.error,
    publish: publish.data?.error,
    insights: insights.data?.error,
  };
});

// ─────────────────────────────────────────────────────────── cleanup ──

await check("cleanup: delete created resources (failures are warnings)", async () => {
  const attempts = [];
  async function tryCleanup(label, fn) {
    try {
      const response = await fn();
      const ok = [200, 204, 404].includes(response?.status ?? 200);
      attempts.push({ label, status: response?.status ?? null, ok });
      if (!ok) state.warnings.push(`${label}: HTTP ${response?.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push({ label, error: message, ok: false });
      state.warnings.push(`${label}: ${message}`);
    }
  }

  if (state.presetId) await tryCleanup("preset", () => user1.request(`/api/presets/${state.presetId}`, { method: "DELETE" }));
  if (state.backgroundId) await tryCleanup("background", () => user1.request(`/api/backgrounds/${state.backgroundId}`, { method: "DELETE" }));
  for (const key of ["imgA", "imgB", "imgD"]) {
    if (state[key]) await tryCleanup(key, () => user1.request(`/api/images/${state[key]}`, { method: "DELETE" }));
  }
  if (state.projectId) await tryCleanup("project", () => user1.request(`/api/studio/projects/${state.projectId}`, { method: "DELETE" }));
  if (state.announcementId) {
    await tryCleanup("announcement", () => admin.request(`/api/admin/announcements?id=${encodeURIComponent(state.announcementId)}`, { method: "DELETE" }));
  }
  // Not deletable via API (left in place by design): fixture users (@dev-e2e.local),
  // marketplace PurchasedPreset rows, GenerationJob rows, and CreditLedger entries.
  return { attempts, warnings: state.warnings };
});

// ─────────────────────────────────────────────────────────── summary ──

report.finishedAt = new Date().toISOString();
report.summary = {
  passed: report.checks.filter((item) => item.status === "passed").length,
  failed: report.checks.filter((item) => item.status === "failed").length,
  total: report.checks.length,
};
await persist();

process.stdout.write(
  `\n[SUPPLEMENT SUMMARY] ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.total} total\n`,
);
process.stdout.write(`[SUPPLEMENT REPORT] ${reportPath}\n`);
if (state.warnings.length > 0) {
  process.stdout.write(`[SUPPLEMENT WARNINGS] ${state.warnings.join(" | ")}\n`);
}
if (report.summary.failed > 0) process.exitCode = 1;
