import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "valibot";
import { CityClientCommandSchema, CityPublicBuildingSchema, PlayerIdSchema, GameRevisionSchema, CityActionIdSchema } from "@hangul-rummikub/shared";
import { cityActionFixture, cityFinishedFixture } from "./city-role-test-fixtures.js";
import { createCityImpactTracker, deriveCityImpacts, type CityImpactSnapshot } from "../features/city-role/city-impact.js";
import { cityActionFeedback, cityProtectionRejection } from "../features/city-role/city-role-actions.js";
import { CityImpactBanner } from "../features/city-role/CityImpactLayer.js";
import { CITY_SOUND_CUES } from "../features/city-role/city-role-sound.js";

const pid = (id: string) => parse(PlayerIdSchema, id);
function action() { const s = cityActionFixture(); if (s.game.phase !== "ROLE_ACTION") throw new Error("fixture"); return { ...s, game: s.game }; }
function next(s: ReturnType<typeof action>) { const copy = structuredClone(s); copy.game.gameRevision++; return copy; }
function card(id = "stone", templateId = "CB-LAN-03") { return parse(CityPublicBuildingSchema, { cardId: id, templateId, name: "돌물결마당", category: "LANDMARK", cost: 2, victoryPoints: 2 }); }
function command(ability: object) { return parse(CityClientCommandSchema, { kind: "city:useRoleAbility", protocolVersion: 1, requestId: "impact-request", gameId: "city-web-game", actionId: "city-action-window", expectedGameRevision: 0, payload: ability }); }
function cues(a: CityImpactSnapshot, b: CityImpactSnapshot) { return deriveCityImpacts(a,b).map(e => e.cue); }

test("CR01 skipped own role creates target-only strike without source, target mark or hand leak", () => {
  const a = action(); a.game.privateState.selectedRoleIds = ["CR-04"];
  const b = next(a); if (b.game.phase !== "ROLE_ACTION") throw new Error(); b.game.window.activeRoleId = "CR-05"; b.game.window.activePlayerId = pid("P1");
  assert.ok(cues(a,b).includes("STRIKE"));
  assert.doesNotMatch(JSON.stringify(deriveCityImpacts(a,b)), /도시1|city-own-card|targetRoleId|marks/u);
  assert.ok(!cues({ ...a, self: { playerId: pid("P2") }, game: { ...a.game, privateState: { hand: [], selectedRoleIds: [], marks: [] } } }, { ...b, self: { playerId: pid("P2") }, game: { ...b.game, privateState: { hand: [], selectedRoleIds: [], marks: [] } } }).includes("STRIKE"));
});
test("CR01 repeated later snapshots do not repeat the same disabled role", () => {
  const a = action(); a.game.privateState.selectedRoleIds = ["CR-04"];
  const b = next(a); if (b.game.phase !== "ROLE_ACTION") throw new Error(); b.game.window.activeRoleId = "CR-05";
  const tracker = createCityImpactTracker(); tracker.accept(a);
  assert.equal(tracker.accept(b).filter(e => e.cue === "STRIKE").length, 1);
  assert.equal(tracker.accept(next(b)).filter(e => e.cue === "STRIKE").length, 0);
});
test("CR02 correlated transfer uses exact amount and actor/target messages differ", () => {
  const a = action(); a.game.playerStates[0]!.gold = 7;
  a.game.revealedRoles.push({ roundNumber: 1, roleId: "CR-02", playerId: pid("P1"), kind: "NORMAL" });
  const b = structuredClone(a); b.game.gameRevision++; b.game.window.actionId = parse(CityClientCommandSchema, { ...command({ ability: "REPLACE_OWN_CARDS", cardIds: ["x"] }), actionId: "new-window" }).actionId;
  b.game.playerStates[0]!.gold = 0; b.game.playerStates[1]!.gold += 7;
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "COIN_LOSS")!.message, /7個|7개/u);
  const other = (s: typeof a) => ({ ...s, self: { playerId: pid("P1") } });
  assert.match(deriveCityImpacts(other(a),other(b)).find(e => e.cue === "COIN_GAIN")!.message, /7개를 획득/u);
  b.game.playerStates[1]!.gold--;
  assert.ok(!cues(a,b).includes("COIN_LOSS"));
});
test("CR03 target receives hand count change, never opponent card identities", () => {
  const a = action(); a.game.window.activePlayerId = pid("P1");
  const b = structuredClone(a); b.game.gameRevision++; b.game.privateState.hand = [card("new-private")];
  const event = deriveCityImpacts(a,b).find(e => e.cue === "SHUFFLE")!;
  assert.match(event.message, /도시1님과 손패/u); assert.doesNotMatch(JSON.stringify(event), /new-private|돌물결|CB-LAN/u);
});
test("CR03 actor success ACK resolves full-swap versus self-replacement without guessing", () => {
  const a = action();
  const swap = cityActionFeedback(command({ ability: "EXCHANGE_HANDS", targetPlayerId: "P1" }), new Set(), a)!;
  assert.match(swap.impact!.event.message, /도시1님과 손패 전체/u);
  const replace = cityActionFeedback(command({ ability: "REPLACE_OWN_CARDS", cardIds: ["secret1", "secret2"] }), new Set())!;
  assert.match(replace.impact!.event.message, /카드 2장/u); assert.doesNotMatch(JSON.stringify(replace.impact), /secret/u);
});
test("CR04 role entry announces leadership even if leader was already self", () => {
  const a = action(), b = structuredClone(a); b.game.gameRevision++; b.game.window.activeRoleId = "CR-04"; b.game.window.actionId = parse(CityActionIdSchema, "new-role");
  assert.ok(cues(a,b).includes("LEADER"));
});
test("CR05 protection activation is self-only", () => {
  const a = action(), b = structuredClone(a); b.game.gameRevision++; b.game.protectedPlayerIds = [pid("P0")];
  assert.ok(cues(a,b).includes("SHIELD"));
  assert.ok(!cues({ ...a, self: { playerId: pid("P1") } }, { ...b, self: { playerId: pid("P1") } }).includes("SHIELD"));
});
test("CR05 rejected destruction is actor-private coarse feedback; no canonical success", () => {
  const a = action(); a.game.window.activeRoleId = "CR-08"; a.game.protectedPlayerIds = [pid("P1")];
  const c = command({ ability: "DESTROY_BUILDING", targetPlayerId: "P1", cardId: "public-card" });
  const feedback = cityProtectionRejection(c, "RULE_VIOLATION", a)!;
  assert.equal(feedback.impact?.event.cue, "SHIELD"); assert.match(feedback.message, /보호받고/u);
  assert.equal(cityProtectionRejection(c, "UNAUTHENTICATED", a), null);
  assert.equal(cityProtectionRejection(c, "RULE_VIOLATION", { ...a, self: { playerId: pid("P1") } }), null);
  assert.deepEqual(deriveCityImpacts(a,a), []);
});
test("CR06 acquisition distinguishes mandatory extra one gold", () => {
  const a = action(); a.game.window.activeRoleId = "CR-06"; a.game.privateState.action!.acquisition = "NOT_TAKEN";
  const b = structuredClone(a); b.game.gameRevision++; b.game.privateState.action!.acquisition = "COMPLETE";
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "COIN_GAIN")!.message, /추가 획득/u);
});
test("CR07 draw excludes already visible pending card and reports exact bonus count", () => {
  const a = action(); a.game.privateState.pendingCards = [card("pending")];
  const b = structuredClone(a); b.game.gameRevision++; b.game.window.activeRoleId = "CR-07";
  b.game.window.actionId = parse(CityClientCommandSchema, { ...command({ ability: "EXCHANGE_HANDS", targetPlayerId: "P1" }), actionId: "architect" }).actionId;
  b.game.privateState.hand.push(card("pending"), card("bonus"));
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "DRAW")!.message, /1장.*3개/u);
});
test("CR08 actor/target destruction messages reference only removed public building", () => {
  const a = action(); a.game.window.activeRoleId = "CR-08"; a.game.playerStates[1]!.builtBuildings = [card()];
  const b = structuredClone(a); b.game.gameRevision++; b.game.playerStates[1]!.builtBuildings = [];
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "BREAK")!.message, /돌물결마당 건물을 해체/u);
  assert.deepEqual(deriveCityImpacts(a,b).find(e => e.cue === "BREAK")!.departingBuilding, { templateId: "CB-LAN-03", category: "LANDMARK", name: "돌물결마당" });
  assert.match(deriveCityImpacts({ ...a, self: { playerId: pid("P1") } }, { ...b, self: { playerId: pid("P1") } }).find(e => e.cue === "BREAK")!.message, /내 돌물결마당/u);
  assert.ok(!cues({ ...a, self: { playerId: pid("P2") } }, { ...b, self: { playerId: pid("P2") } }).includes("BREAK"));
});
test("build feedback names canonical public card with gold before/after", () => {
  const a = action(), b = structuredClone(a); b.game.gameRevision++; b.game.playerStates[0]!.builtBuildings = [card()];
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "BUILD")!.message, /돌물결마당.*금화 2 → 2/u);
});
test("Landmark history yields exact one-shot, empty sundial and staircase remaining feedback", () => {
  const a = action(); a.game.rulesVersion = "city-rules-v2"; a.game.cardSetVersion = "city-cardset-v2";
  a.game.landmarkHistory = a.game.playerStates.map(p => ({ playerId: p.playerId, gardenUsed: false, sundialUsed: false, staircaseInitialized: true, staircaseRemaining: 3, staircaseSpent: 0, lastDiscountRound: null }));
  const b = structuredClone(a); b.game.gameRevision++;
  Object.assign(b.game.landmarkHistory![0]!, { gardenUsed: true, sundialUsed: true, staircaseRemaining: 2, staircaseSpent: 1, lastDiscountRound: 1 });
  const events = deriveCityImpacts(a,b);
  assert.match(events.find(e => e.cue === "WATER")!.message, /금화 1/u);
  assert.match(events.find(e => e.cue === "TICK")!.message, /카드가 없습니다/u);
  assert.match(events.find(e => e.cue === "WIND")!.message, /2\/3/u);
  assert.ok(!cues(b,next(b)).includes("WATER"));
});
test("first completion public bell and final winner are canonical only", () => {
  const a = action(), b = structuredClone(a); b.game.gameRevision++; b.game.firstCompletion = { playerId: pid("P1"), roundNumber: 1 };
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "BELL")!.message, /도시1.*마지막 라운드/u);
  const f = cityFinishedFixture(); f.game.gameRevision = parse(GameRevisionSchema, 1);
  assert.ok(cues(a,f).includes("VICTORY")); assert.deepEqual(deriveCityImpacts(f,f), []);
});
test("replay, presence, stale, reconnect, fresh mount and revision gaps remain silent", () => {
  const a = action(), b = structuredClone(a); b.game.gameRevision++; b.game.playerStates[0]!.builtBuildings = [card()];
  const tracker = createCityImpactTracker(); assert.deepEqual(tracker.accept(a), []);
  assert.ok(tracker.accept(b).length); assert.deepEqual(tracker.accept(b), []); assert.deepEqual(tracker.accept(a), []);
  tracker.reset(); assert.deepEqual(tracker.accept(b), []);
  const gap = structuredClone(b); gap.game.gameRevision = parse(GameRevisionSchema, gap.game.gameRevision + 3); gap.game.firstCompletion = { playerId: pid("P0"), roundNumber: 1 };
  assert.deepEqual(tracker.accept(gap), []); assert.deepEqual(createCityImpactTracker().accept(gap), []);
});
test("late/retried successful ACK at resume baseline never replays an old impact", () => {
  const a = action(); a.game.gameRevision = parse(GameRevisionSchema, 1);
  const feedback = cityActionFeedback(command({ ability: "REPLACE_OWN_CARDS", cardIds: ["private"] }), new Set())!;
  const tracker = createCityImpactTracker(); tracker.accept(a);
  assert.deepEqual(tracker.accept(a,feedback), []);
});
test("resume after a skipped role does not invent a delayed strike on the next revision", () => {
  const a = action(); a.game.privateState.selectedRoleIds = ["CR-04"]; a.game.window.activeRoleId = "CR-05";
  const tracker = createCityImpactTracker(); tracker.accept(a);
  assert.ok(!tracker.accept(next(a)).some(e => e.cue === "STRIKE"));
});
test("stone cost and both scoring Landmarks use public confirmed results only", () => {
  const a = action(); a.game.rulesVersion = "city-rules-v2"; a.game.window.activeRoleId = "CR-08"; a.game.playerStates[1]!.builtBuildings = [card()];
  const b = structuredClone(a); b.game.gameRevision++; b.game.playerStates[1]!.builtBuildings = [];
  assert.match(deriveCityImpacts(a,b).find(e => e.cue === "SHIELD")!.message, /비용.*금화 1/u);
  const f = cityFinishedFixture(); f.game.gameRevision++; f.game.rulesVersion = "city-rules-v2";
  f.game.playerStates[0]!.builtBuildings = [card("moon", "CB-LAN-05"), card("seven", "CB-LAN-06")];
  a.game.playerStates[0]!.builtBuildings = [...f.game.playerStates[0]!.builtBuildings];
  f.game.result.rankings[0]!.diversityBonus = 3; f.game.result.rankings[0]!.landmarkBonus = 3;
  const events = deriveCityImpacts(a,f);
  assert.equal(events.filter(e => e.cue === "MOON").length, 2);
  assert.match(events.find(e => e.id.endsWith(":seventh"))!.message, /\+3점/u);
});
test("same success ACK produces one impact independent of presence snapshots", () => {
  const a = action(), b = next(a), tracker = createCityImpactTracker(); tracker.accept(a); tracker.accept(b);
  const feedback = cityActionFeedback(command({ ability: "REPLACE_OWN_CARDS", cardIds: ["private"] }), new Set())!;
  assert.equal(tracker.accept(b,feedback).length, 1); assert.deepEqual(tracker.accept(b,feedback), []);
});
test("impact banner has text/live semantics and does not require sound", () => {
  const html = renderToStaticMarkup(createElement(CityImpactBanner, { events: [{ id: "test", cue: "SHIELD", intensity: "medium", message: "보호가 활성화되었습니다." }] }));
  assert.match(html, /aria-live="polite"/u); assert.match(html, /보호가 활성화/u); assert.match(html, /aria-hidden="true"/u);
});
test("short synthesized families, mute gate, reduced motion and top mobile placement", () => {
  for (const cue of Object.values(CITY_SOUND_CUES)) { assert.ok(cue.duration >= .15 && cue.duration <= .8); assert.ok(cue.gain <= .065); }
  const layer = readFileSync(new URL("../../src/features/city-role/CityImpactLayer.tsx", import.meta.url), "utf8");
  assert.match(layer, /playCityImpactSound\(loudest.cue\)/u); assert.match(layer, /slice\(-8\)/u);
  const css = readFileSync(new URL("../../src/features/city-role/city-role.css", import.meta.url), "utf8");
  assert.match(css, /city-impact-banner[^}]*top: max\(12px,env\(safe-area-inset-top\)\)/u);
  assert.match(css, /prefers-reduced-motion: reduce[^}]*city-impact-root[^}]*animation: none/u);
});
