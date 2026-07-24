import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home navigation exposes five core workspaces and keeps utilities in order", async () => {
  const [source, dashboard] = await Promise.all([
    readFile("src/app/page.tsx", "utf8"),
    readFile("src/components/CreatorDashboard.tsx", "utf8"),
  ]);

  assert.match(source, /aria-label="홈으로 이동"/);
  assert.doesNotMatch(source, />\s*더보기\s*</);
  assert.doesNotMatch(source, /LuHouse|moreMenuOpen|moreMenuRef/);

  const primaryNav = source.match(/<nav className=\{styles\.tabNav\}[\s\S]*?<\/nav>/)?.[0];
  assert.ok(primaryNav);
  for (const label of ["캐릭터", "배경/장면", "통합 스튜디오", "숏폼", "내 작업"]) {
    assert.match(primaryNav, new RegExp(label));
  }
  assert.doesNotMatch(primaryNav, /제스처 생성|작업 보관함|게시판|My Contents/);

  const boardIndex = source.indexOf("styles.utilityTab");
  const wonyIndex = source.indexOf("styles.chatToggleBtn", boardIndex);
  const avatarIndex = source.indexOf("<UserAvatar", wonyIndex);
  assert.ok(boardIndex >= 0 && wonyIndex > boardIndex && avatarIndex > wonyIndex);
  assert.doesNotMatch(dashboard, /빠른 실행|styles\.quick/);
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
  assert.match(home, /> 제스처/);
  assert.match(home, /> 장면 만들기/);
  assert.match(home, /> 배경 만들기/);
  assert.match(home, /> 작업 보관함/);
  assert.match(home, /> 내 캐릭터/);
  assert.match(home, /> My Content/);

  assert.match(route, /requireAuth\(\)/);
  assert.doesNotMatch(route, /requireCharacterDesigner/);
});

test("gesture and background workspaces share durable assets with scene and canvas", async () => {
  const [home, gesture, background, canvas, studio] = await Promise.all([
    readFile("src/app/page.tsx", "utf8"),
    readFile("src/components/GestureGenerator.tsx", "utf8"),
    readFile("src/components/BackgroundGenerator.tsx", "utf8"),
    readFile("src/components/CanvasEditor.tsx", "utf8"),
    readFile("src/components/StudioWorkspace.tsx", "utf8"),
  ]);

  assert.match(gesture, /jobKind: "gesture"/);
  assert.match(gesture, /\/api\/jobs\?kind=gesture/);
  assert.match(canvas, /\/api\/archive\?kind=gesture/);
  assert.match(canvas, /\/api\/archive\?kind=background/);

  assert.match(background, /onBackgroundSaved\?\.\(saved\)/);
  assert.match(studio, /selectedCharacterIds\.length === 0[\s\S]*\? "background"[\s\S]*: "image"/);
  assert.match(home, /onBackgroundSaved=\{\(saved\) =>/);
  assert.match(home, /setSelectedBgImageId\(saved\.id\)/);
  assert.match(home, /active=\{sceneWorkspaceView === "background"\}/);
});
