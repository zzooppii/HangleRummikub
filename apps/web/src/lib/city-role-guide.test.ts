import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CityGameHelp, CityHelpDialog } from "../features/city-role/CityGameHelp.js";
import { CITY_TUTORIAL_STEPS, CITY_GUIDE_SECTIONS, CITY_TUTORIAL_PREFERENCE, hasSeenCityTutorial, markCityTutorialSeen, nextCityTutorialStep } from "../features/city-role/city-role-guide.js";

const source = readFileSync(new URL("../../src/features/city-role/CityGameHelp.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/features/city-role/city-role-help.css", import.meta.url), "utf8");
test("CITY first visit offers seven-step tutorial in Lobby without blocking live Playing", () => {
  const lobby = renderToStaticMarkup(createElement(CityGameHelp, { placement: "LOBBY" }));
  const playing = renderToStaticMarkup(createElement(CityGameHelp, { placement: "PLAYING" }));
  assert.match(lobby, /7단계|간단히 배우기/);
  assert.match(lobby, /지금은 건너뛰기/);
  assert.match(lobby, /게임 방법 보기/);
  assert.match(playing, /게임 방법/);
  assert.doesNotMatch(lobby + playing, /<dialog/);
  assert.doesNotMatch(playing, /지금은 건너뛰기/);
});
test("CITY seven tutorial steps cover exact approved loop and end rather than wrap", () => {
  assert.equal(CITY_TUTORIAL_STEPS.length, 7);
  for (let step = 0; step < 6; step++) assert.equal(nextCityTutorialStep(step), step + 1);
  assert.equal(nextCityTutorialStep(6), null);
  const text = JSON.stringify(CITY_TUTORIAL_STEPS);
  for (const part of ["8개", "2~3명", "역할 2개", "4~6명", "역할 1개", "45초", "금화 2개", "최대 2장", "1장을", "최대 3개", "중복 건설", "+4점", "+2점", "+3점", "공동 우승"]) assert.ok(text.includes(part), part);
});
test("CITY skip and completion persist one optional preference independent from credentials", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(hasSeenCityTutorial(storage), false);
  markCityTutorialSeen(storage);
  assert.equal(hasSeenCityTutorial(storage), true);
  assert.deepEqual([...values], [[CITY_TUTORIAL_PREFERENCE, "seen"]]);
  assert.match(source, /function finish\(\) \{ markCityTutorialSeen\(\); setSeen\(true\); setMode\(null\); \}/);
  assert.match(source, /onClick=\{onFinish\}>건너뛰기/);
  assert.match(source, /next === null\) onFinish\(\)/);
});
test("CITY tutorial storage denied or unavailable is safe for guide and dismissal", () => {
  const denied = { getItem(): string { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(hasSeenCityTutorial(denied), false);
  assert.doesNotThrow(() => markCityTutorialSeen(denied));
  assert.equal(hasSeenCityTutorial(undefined), false);
  assert.doesNotThrow(() => markCityTutorialSeen(undefined));
});
test("CITY Guide can reopen tutorial and explains all eight roles without invented mechanics", () => {
  const html = renderToStaticMarkup(createElement(CityHelpDialog, { tutorial: false, onTutorial() {}, onDismiss() {}, onFinish() {} }));
  for (const section of CITY_GUIDE_SECTIONS) assert.ok(html.includes(section.title));
  for (const term of ["가림꾼", "징수꾼", "교환꾼", "길잡이", "수호꾼", "장터지기", "설계꾼", "해체꾼", "7단계 튜토리얼 다시 보기", "금화 1개 적게", "1장 이상", "자동 건설은 없습니다", "연속 3회", "공동 우승"]) assert.ok(html.includes(term), term);
  assert.doesNotMatch(html, /영구 할인|프리즘|특수 건물 능력|Citadels|암살자|주교/);
});
test("CITY dialog uses native focus trap, Escape and connected-trigger focus restoration", () => {
  const html = renderToStaticMarkup(createElement(CityHelpDialog, { tutorial: true, onTutorial() {}, onDismiss() {}, onFinish() {} }));
  assert.match(html, /<dialog[^>]*aria-modal="true" aria-labelledby="city-help-heading"/);
  assert.match(html, /aria-label="게임 방법 닫기"/);
  assert.match(source, /dialog.showModal\(\)/);
  assert.match(source, /dialog.close\(\)/);
  assert.match(source, /onCancel=[\s\S]*event.preventDefault\(\); onDismiss\(\)/);
  assert.match(source, /previousFocus.isConnected\) previousFocus.focus\(\)/);
  assert.match(source, /returnFocusRef\?\.current\?\.focus\(\)/);
  assert.match(source, /disabled=\{step === 0\}/);
  assert.match(source, /scrollTop = 0/);
});
test("CITY guide has no command or timer authority and explicitly keeps 45/90-second time running", () => {
  assert.doesNotMatch(source, /snapshot|gameRevision|requestId|sessionToken|socket|fetch\(|setInterval|onBuild|onSelectRole/);
  assert.match(source, /선택 45초 · 행동 90초/);
  assert.match(source, /설명을 열어도 게임 시간은 계속 흐릅니다/);
});
test("CITY guide styles are scoped, internally scrollable and readable at 320px with 44px targets", () => {
  assert.match(css, /max-height: min\(780px, calc\(100dvh - 24px\)\)/);
  assert.match(css, /\.city-help-scroll \{ overflow-y: auto; min-height: 0/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /\.city-help-footer button \{[^}]*white-space: nowrap; flex-shrink: 0/);
  assert.match(css, /max-width: 420px/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)|\.gem-|\.number-/);
});
