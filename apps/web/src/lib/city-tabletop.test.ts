import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CityBuildTrack, CityResourceTokens, CityRoleTrack } from "../features/city-role/CityTabletop.js";
import { citySelectionFixture, cityActionFixture } from "./city-role-test-fixtures.js";

test("CITY public role track never changes when private selections change", () => {
  const fixture = citySelectionFixture();
  const before = renderToStaticMarkup(createElement(CityRoleTrack, { players: fixture.room.players, game: fixture.game }));
  const after = renderToStaticMarkup(createElement(CityRoleTrack, { players: fixture.room.players, game: { ...fixture.game, privateState: { ...fixture.game.privateState, selectedRoleIds: ["CR-02"] } } }));
  assert.equal(before, after);
  assert.equal((before.match(/<li/g) ?? []).length, 8);
  assert.equal(before.includes('aria-current="step"'), false);
  for (const player of fixture.room.players) assert.equal(before.includes(`${player.nickname}님`), false);
});
test("CITY public action track marks exactly the current role", () => {
  const fixture = cityActionFixture();
  const html = renderToStaticMarkup(createElement(CityRoleTrack, { players: fixture.room.players, game: fixture.game }));
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
  assert.match(html, />도시0님<\/small>/);
  assert.doesNotMatch(html, /공개됨/);
});
test("CITY role owners come only from this round's public reveals, including disabled identities", () => {
  const fixture = cityActionFixture();
  const [first, second] = fixture.room.players;
  assert.ok(first && second);
  const html = renderToStaticMarkup(createElement(CityRoleTrack, { players: fixture.room.players, game: {
    ...fixture.game, roundNumber: 2,
    revealedRoles: [
      { roundNumber: 1, roleId: 'CR-01', playerId: first.playerId, kind: 'NORMAL' },
      { roundNumber: 2, roleId: 'CR-03', playerId: second.playerId, kind: 'NORMAL' },
      { roundNumber: 2, roleId: 'CR-02', playerId: second.playerId, kind: 'DISABLED' },
    ],
  } }));
  assert.doesNotMatch(html, /도시0님/);
  assert.match(html, />도시1님<\/small>/);
  assert.match(html, />도시1님 · 암살됨<\/small>/);
  assert.equal((html.match(/aria-current="step"/g) ?? []).length, 1);
});
test("CITY city progress is a goal not a building cap", () => {
  for (const count of [0, 4, 8, 9]) {
    const html = renderToStaticMarkup(createElement(CityBuildTrack, { count }));
    assert.ok(html.includes(`도시 건설 ${count}개, 완성 목표 8개`));
    assert.equal((html.match(/class="is-built"/g) ?? []).length, Math.min(count, 8));
  }
});
test("CITY public resource tokens expose counts with text labels", () => {
  const html = renderToStaticMarkup(createElement(CityResourceTokens, { gold: 12, handCount: 4, score: 9 }));
  for (const label of ["금화", "손패", "건물 점수"]) assert.ok(html.includes(label));
  assert.ok(html.includes("<dd>12</dd>"));
});
