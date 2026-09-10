import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CitySecretDraft } from "../features/city-role/CitySecretDraft.js";
import { CITY_MUSIC_CHORDS, CITY_MUSIC_PREFERENCE } from "../features/city-role/city-ambience.js";
import { CITY_SOUND_PREFERENCE } from "../features/city-role/city-role-sound.js";

test("CITY secret draft renders only supplied private choices and requires atomic confirmation", () => {
  const html = renderToStaticMarkup(createElement(CitySecretDraft, { roles: ["CR-03", "CR-05", "CR-07"], locked: false, onAction() { assert.fail("render never sends command"); } }));
  assert.equal((html.match(/class="city-role-card/g) ?? []).length, 3);
  assert.match(html, /45초/); assert.match(html, /비공개 버리기/);
  assert.match(html, /city-draft-confirm" disabled/);
  assert.doesNotMatch(html, /가림꾼|징수꾼|hiddenRemoved|sessionToken/);
});
test("CITY secret draft locks all actions while waiting for server", () => {
  const html = renderToStaticMarkup(createElement(CitySecretDraft, { roles: ["CR-01", "CR-02", "CR-03"], locked: true, onAction() {} }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 7);
});
test("CITY original ambience has independent opt-in preference and bounded quiet chords", () => {
  assert.notEqual(CITY_MUSIC_PREFERENCE, CITY_SOUND_PREFERENCE);
  assert.equal(CITY_MUSIC_CHORDS.length, 4);
  for (const chord of CITY_MUSIC_CHORDS) for (const frequency of chord) assert.ok(frequency > 100 && frequency < 400);
  const source = readFileSync(new URL("../../src/features/city-role/city-ambience.ts", import.meta.url), "utf8");
  assert.match(source, /=== "true"/); assert.match(source, /document.hidden/);
  assert.match(source, /old.close/); assert.match(source, /clearInterval/);
});
test("CITY role environments cover all eight identities and retain mobile touch targets", () => {
  const css = readFileSync(new URL("../../src/features/city-role/city-role.css", import.meta.url), "utf8");
  for (let n = 1; n <= 8; n++) assert.ok(css.includes(`data-role='CR-0${n}'`));
  assert.match(css, /city-draft-card-actions button[^}]*min-height:44px/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});


test("CITY corrected first draft shows keep-only controls and the current selection timer", () => {
  const html = renderToStaticMarkup(createElement(CitySecretDraft, { roles: ["CR-02", "CR-03", "CR-04"], locked: false,
    discardRequired: false, automaticLast: false, selectionSeconds: 10, onAction() {} }));
  assert.match(html, /첫 선택에서는 가져갈 역할 1장만/);
  assert.match(html, /10초가 지나면 서버가 한 장을/);
  assert.match(html, /직업 선택 확정/);
  assert.equal((html.match(/<button/g) ?? []).length, 4);
  assert.doesNotMatch(html, /비공개 버리기<\/button>|자동 배정|버릴 역할 선택/);
});

test("CITY corrected final draft offers both choices with no automatic assignment notice", () => {
  const html = renderToStaticMarkup(createElement(CitySecretDraft, { roles: ["CR-04", "CR-08"], locked: false,
    discardRequired: true, automaticLast: false, selectionSeconds: 30, onAction() {} }));
  assert.equal((html.match(/class="city-role-card/g) ?? []).length, 2);
  assert.equal((html.match(/비공개 버리기<\/button>/g) ?? []).length, 2);
  assert.match(html, /30초가 지나면 서버가 두 장을/);
  assert.doesNotMatch(html, /자동 배정/);
});
