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
