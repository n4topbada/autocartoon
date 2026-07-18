import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home navigation keeps every primary destination at one depth", async () => {
  const source = await readFile("src/app/page.tsx", "utf8");

  assert.match(source, /aria-label="홈으로 이동"/);
  assert.doesNotMatch(source, />\s*더보기\s*</);
  assert.doesNotMatch(source, /LuHouse|moreMenuOpen|moreMenuRef/);

  for (const label of [
    "장면 생성",
    "캐릭터 만들기",
    "배경 생성",
    "통합 스튜디오",
    "제스처 생성",
    "숏폼 제작",
    "작업 보관함",
    "게시판",
    "My Contents",
  ]) {
    assert.match(source, new RegExp(label));
  }
});

test("account, character design, and owned characters use their integrated workspaces", async () => {
  const [home, avatar, route] = await Promise.all([
    readFile("src/app/page.tsx", "utf8"),
    readFile("src/components/UserAvatar.tsx", "utf8"),
    readFile("src/app/api/character-designer/route.ts", "utf8"),
  ]);

  assert.match(home, /<UserAvatar onOpenSettings=/);
  assert.match(avatar, /> 계정 설정/);
  assert.match(home, /> 이미지 만들기/);
  assert.match(home, /> 설정 설계/);
  assert.match(home, /> 내 캐릭터/);
  assert.match(home, /> 콘텐츠 보드/);

  assert.match(route, /requireAuth\(\)/);
  assert.doesNotMatch(route, /requireCharacterDesigner/);
});
