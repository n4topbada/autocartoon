import assert from "node:assert/strict";
import test from "node:test";
import { parseAnnouncementInput, parseAnnouncementLimit } from "../src/lib/announcements";

test("announcement list limit keeps the default when the query is absent", () => {
  assert.equal(parseAnnouncementLimit(null), 30);
  assert.equal(parseAnnouncementLimit(""), 30);
  assert.equal(parseAnnouncementLimit("invalid"), 30);
  assert.equal(parseAnnouncementLimit("3"), 3);
  assert.equal(parseAnnouncementLimit("0"), 1);
  assert.equal(parseAnnouncementLimit("500"), 50);
});

test("announcement input is trimmed and normalized", () => {
  const result = parseAnnouncementInput({
    title: "  새 기능 안내  ",
    content: "  생성 기록이 개선되었습니다.  ",
    category: "update",
    pinned: true,
    published: true,
    expiresAt: "2026-08-01T09:00:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, "새 기능 안내");
  assert.equal(result.value.content, "생성 기록이 개선되었습니다.");
  assert.equal(result.value.category, "update");
  assert.equal(result.value.expiresAt?.toISOString(), "2026-08-01T09:00:00.000Z");
});

test("announcement input rejects invalid content", () => {
  assert.deepEqual(parseAnnouncementInput({ title: "", content: "내용" }), {
    ok: false,
    error: "제목을 입력해주세요.",
  });
  assert.deepEqual(parseAnnouncementInput({ title: "제목", content: "내용", category: "unknown" }), {
    ok: false,
    error: "지원하지 않는 공지 분류입니다.",
  });
  assert.deepEqual(parseAnnouncementInput({ title: "제목", content: "내용", expiresAt: "not-a-date" }), {
    ok: false,
    error: "만료 시각을 확인해주세요.",
  });
});
