import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { GemCollectSelectionDto, RequestId, TurnId } from "@hangul-rummikub/shared";
import { GemCardPlayingScreen, type GemCardPlayingScreenProps } from "../features/gem-card/GemCardPlayingScreen.js";
import { GemCardFinishedScreen } from "../features/gem-card/GemCardFinishedScreen.js";
import {
  GEM_RESOURCE_IDS, GEM_RESOURCE_LABELS, GEM_RESOURCE_MARKERS, formatGemCountdown, gemCardAccessibleLabel,
  gemCollectPreview, gemFairRoundLabel, gemFinishReasonLabel, gemHasMainActionHint, gemPaymentPreview,
  gemResourceTotal, resolveGemSelectedCard, toggleGemCollectSelection,
} from "../features/gem-card/gem-card-ui.js";
import { markGemFeedback, readGemSoundStorage, shouldAnnounceGemTurn, writeGemSoundStorage } from "../features/gem-card/gem-card-sound.js";
import { gemFinishedFixture, gemLobbyFixture, gemPlayingFixture } from "./gem-card-test-fixtures.js";

function playingProps(snapshot = gemPlayingFixture()): GemCardPlayingScreenProps {
  return { snapshot, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null, sessionReplaced: false,
    actionPending: false, commandRetryKind: null, actionFeedback: null, selectionResetGeneration: 0, roomLeavePending: false, canAct: true,
    onCollect() {}, onPurchase() {}, onReserve() {}, onYield() {}, onRetry() {}, onLeaveRoom() {}, onGoHome() {},
  };
}
function renderPlaying(snapshot = gemPlayingFixture(), extras: Partial<GemCardPlayingScreenProps> = {}) {
  return renderToStaticMarkup(createElement(GemCardPlayingScreen, { ...playingProps(snapshot), ...extras }));
}
function self(snapshot = gemPlayingFixture()) {
  const player = snapshot.game.playerStates.find(value => value.playerId === snapshot.self.playerId);
  if (!player) throw new Error("Missing fixture self.");
  return player;
}
function card(snapshot = gemPlayingFixture()) {
  const first = snapshot.game.market[0]?.slots[0];
  if (!first) throw new Error("Missing fixture card.");
  return first;
}

test("GEM UI fixtures parse strict rack-free Lobby/Playing/all four Finished snapshots", () => {
  assert.equal(gemLobbyFixture().game, null);
  assert.equal(gemPlayingFixture().game.turn.deadlineAt - gemPlayingFixture().game.turn.startedAt, 45000);
  for (const reason of ["SCORE_THRESHOLD_ROUND_END", "MARKET_EXHAUSTED_ROUND_END", "NO_PROGRESS", "LAST_PLAYER_STANDING"] as const)
    assert.equal(gemFinishedFixture(reason).game.result.reason, reason);
});

test("GEM Collect selects one/two distinct basics, toggles off and never permits third/basic+PRISM", () => {
  let selection: GemCollectSelectionDto | null = toggleGemCollectSelection(null, "DAWN");
  assert.deepEqual(selection, { kind: "BASIC", resources: ["DAWN"] });
  selection = toggleGemCollectSelection(selection, "TIDE");
  assert.deepEqual(selection, { kind: "BASIC", resources: ["DAWN", "TIDE"] });
  assert.equal(toggleGemCollectSelection(selection, "GROVE"), selection);
  assert.deepEqual(toggleGemCollectSelection(selection, "DAWN"), { kind: "BASIC", resources: ["TIDE"] });
  selection = toggleGemCollectSelection(selection, "PRISM");
  assert.deepEqual(selection, { kind: "PRISM" });
  assert.equal(toggleGemCollectSelection(selection, "PRISM"), null);
  assert.deepEqual(toggleGemCollectSelection(selection, "EMBER"), { kind: "BASIC", resources: ["EMBER"] });
});

test("GEM cap9 preview permits8+1, rejects8+2, 9+1 and unavailable supplies without canonical mutation", () => {
  const snapshot = gemPlayingFixture();
  const resources = { ...self(snapshot).resources, DAWN: 7, TIDE: 1 };
  const frozen = JSON.stringify({ resources, supply: snapshot.game.supply });
  assert.equal(gemResourceTotal(resources), 8);
  assert.equal(gemCollectPreview({ kind: "BASIC", resources: ["TIDE"] }, resources, snapshot.game.supply).canCollect, true);
  assert.equal(gemCollectPreview({ kind: "BASIC", resources: ["TIDE", "GROVE"] }, resources, snapshot.game.supply).canCollect, false);
  assert.equal(gemCollectPreview({ kind: "PRISM" }, { ...resources, TIDE: 2 }, snapshot.game.supply).canCollect, false);
  assert.equal(gemCollectPreview({ kind: "PRISM" }, resources, { ...snapshot.game.supply, PRISM: 0 }).canCollect, false);
  assert.equal(JSON.stringify({ resources, supply: snapshot.game.supply }), frozen);
});

test("GEM purchase preview applies discount, basic-first then PRISM shortage without mutating or authorizing payment", () => {
  const player = { ...self(), resources: { ...self().resources, DAWN: 1, EMBER: 1, PRISM: 1 }, production: { ...self().production, DAWN: 1, EMBER: 1 } };
  const original = JSON.stringify(player);
  const preview = gemPaymentPreview(card(), player);
  assert.deepEqual(preview.effective, { DAWN: 2, TIDE: 0, GROVE: 0, EMBER: 1, ECHO: 0 });
  assert.deepEqual(preview.basicPayment, { DAWN: 1, TIDE: 0, GROVE: 0, EMBER: 1, ECHO: 0 });
  assert.equal(preview.prismRequired, 1);
  assert.equal(preview.canAfford, true);
  assert.equal(gemPaymentPreview(card(), { ...player, resources: { ...player.resources, PRISM: 0 } }).canAfford, false);
  assert.equal(gemPaymentPreview(card(), { ...player, production: { ...player.production, DAWN: 8, EMBER: 8 } }).prismRequired, 0);
  assert.equal(JSON.stringify(player), original);
});

test("GEM market selection requires same exact card identity; refill does not select a replacement card", () => {
  const snapshot = gemPlayingFixture();
  const original = card(snapshot);
  const selection = { source: { kind: "MARKET", tier: 1, slotIndex: 0 }, cardId: original.cardId } as const;
  assert.equal(resolveGemSelectedCard(snapshot.game, self(snapshot), selection), original);
  const updated = structuredClone(snapshot);
  const first = updated.game.market[0];
  if (!first) throw new Error("Missing tier.");
  first.slots[0] = first.slots[1];
  assert.equal(resolveGemSelectedCard(updated.game, self(updated), selection), null);
  const reserved = { ...self(snapshot), reservedCards: [original] };
  assert.equal(resolveGemSelectedCard(snapshot.game, reserved, { source: { kind: "RESERVED", cardId: original.cardId }, cardId: original.cardId }), original);
  assert.equal(resolveGemSelectedCard(snapshot.game, self(snapshot), { source: { kind: "RESERVED", cardId: original.cardId }, cardId: original.cardId }), null);
});

test("GEM YIELD hint recognizes collect, reserve, purchase and no-action states without server data", () => {
  const snapshot = gemPlayingFixture();
  assert.equal(gemHasMainActionHint(snapshot.game, self(snapshot)), true);
  const empty = { ...snapshot.game, supply: { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0, PRISM: 0 }, market: snapshot.game.market.map(tier => ({ ...tier, slots: [null, null, null] as [null, null, null] })) };
  assert.equal(gemHasMainActionHint(empty, self(snapshot)), false);
  const rich = { ...self(snapshot), resources: { ...self(snapshot).resources, DAWN: 3, EMBER: 2 }, reservedCards: [card(snapshot)] };
  assert.equal(gemHasMainActionHint(empty, rich), true);
  assert.equal(gemHasMainActionHint({ ...empty, market: snapshot.game.market }, self(snapshot)), true);
});

test("GEM resources all have distinct Korean labels, letter markers and meaningful card names", () => {
  assert.equal(new Set(GEM_RESOURCE_IDS.map(resource => GEM_RESOURCE_LABELS[resource])).size, 6);
  assert.equal(new Set(GEM_RESOURCE_IDS.map(resource => GEM_RESOURCE_MARKERS[resource])).size, 6);
  assert.match(gemCardAccessibleLabel(card()), /1단계 카드, 승점 0점, 새벽 비용 3, 불씨 비용 2, 물결 영구 할인 \+1/);
});

test("GEM Playing renders exactly 9 fixed slots, supply/resources/discounts/target and no fake rack", () => {
  const html = renderPlaying();
  assert.equal((html.match(/data-gem-slot=/g) ?? []).length, 9);
  assert.match(html, /내 차례입니다/);
  assert.match(html, /00:45/);
  assert.match(html, /role="timer" aria-live="off"/);
  assert.match(html, /영구 할인/);
  assert.match(html, /목표 18점/);
  assert.match(html, /공용 공급/);
  assert.match(html, /href="#gem-market-heading">시장 보기/);
  assert.match(html, /href="#gem-my-actions">내 자원·행동/);
  assert.match(html, /id="gem-my-actions" tabindex="-1"/);
  assert.match(html, /aria-pressed="false"/);
  assert.doesNotMatch(html, /rack|tileId|offlineTimeoutStreak|storageRevision|sessionToken|idempotency|futureDeck/);
});

test("GEM market empty slots remain in their original coordinates", () => {
  const snapshot = gemPlayingFixture();
  const tier = snapshot.game.market[1];
  if (!tier) throw new Error("Missing tier.");
  tier.slots[1] = null;
  const html = renderPlaying(snapshot);
  assert.equal((html.match(/data-gem-slot=/g) ?? []).length, 9);
  assert.match(html, /data-gem-slot="2-1"[^]*2단계 2번 빈 슬롯/);
});

test("GEM opponent turns and replaced sessions disable gameplay but retain public card/resource information", () => {
  const snapshot = gemPlayingFixture();
  snapshot.game.turn.activePlayerId = snapshot.game.turnOrder[1]!;
  const html = renderPlaying(snapshot, { canAct: false });
  assert.match(html, /B참가자님의 차례입니다/);
  assert.equal((html.match(/class="gem-card" disabled=""/g) ?? []).length, 9);
  assert.match(html, /disabled=""[^>]*>선택한 자원 받기/);
  assert.match(html, /예약 카드 · 공개/);
  const replaced = renderPlaying(gemPlayingFixture(), { sessionReplaced: true });
  assert.match(replaced, /다른 창에서 연결되었습니다/);
  assert.match(replaced, /홈으로 돌아가기/);
});

test("GEM timer warning is display-only and pending/retry feedback never optimistically alters market", () => {
  const snapshot = gemPlayingFixture();
  snapshot.serverTime = (snapshot.game.turn.deadlineAt - 10000) as typeof snapshot.serverTime;
  const html = renderPlaying(snapshot, { actionPending: true });
  assert.match(html, /gem-turn-banner is-self warning/);
  assert.match(html, /00:10/);
  assert.match(html, /서버에서 행동을 확인/);
  assert.equal((html.match(/data-gem-slot=/g) ?? []).length, 9);
  const retry = renderPlaying(gemPlayingFixture(), { commandRetryKind: "PURCHASE" });
  assert.match(retry, /이전 행동 다시 확인/);
  assert.match(retry, /disabled=""[^>]*>게임 나가기/);
  assert.equal(formatGemCountdown(45), "00:45");
  assert.equal(formatGemCountdown(-1), "00:00");
});

test("GEM fair-round banners use only exact public pending reasons and do not infer remaining players", () => {
  for (const reason of ["SCORE_THRESHOLD_ROUND_END", "MARKET_EXHAUSTED_ROUND_END"] as const) {
    const snapshot = gemPlayingFixture(); snapshot.game.fairRound = { reason };
    const html = renderPlaying(snapshot);
    assert.ok(html.includes(gemFairRoundLabel(reason)));
    assert.doesNotMatch(html, /remainingPlayerIds|pendingQueue|cycleCursor/);
  }
});

test("GEM Finished renders all four reasons and server competition rank/shared winners unchanged", () => {
  for (const reason of ["SCORE_THRESHOLD_ROUND_END", "MARKET_EXHAUSTED_ROUND_END", "NO_PROGRESS", "LAST_PLAYER_STANDING"] as const) {
    const html = renderToStaticMarkup(createElement(GemCardFinishedScreen, { snapshot: gemFinishedFixture(reason), connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null, sessionReplaced: false, roomLeavePending: false, onLeaveRoom() {}, onGoHome() {} }));
    assert.ok(html.includes(gemFinishReasonLabel(reason)));
    assert.equal((html.match(/data-gem-slot=/g) ?? []).length, 9);
    assert.match(html, /구매 카드 4장/);
    assert.match(html, /최종 보유 자원/);
    assert.match(html, /예약 카드 · 공개/);
    if (reason !== "LAST_PLAYER_STANDING") { assert.match(html, /공동 우승/); assert.equal((html.match(/>1위 · 우승/g) ?? []).length, 2); assert.match(html, />3위/); }
    else assert.match(html, /기권/);
    assert.doesNotMatch(html, /TIME_LIMIT|RACK_EMPTY|ALL_PLAYERS_FORFEITED/);
  }
});

test("GEM own reserved cards have selection actions, opponents only public details", () => {
  const snapshot = gemPlayingFixture();
  const first = card(snapshot);
  snapshot.game.playerStates[0]!.reservedCards = [first];
  snapshot.game.playerStates[1]!.reservedCards = [first];
  const html = renderPlaying(snapshot);
  assert.equal((html.match(/aria-label="내 예약/g) ?? []).length, 1);
  assert.match(html, /1 \/ 2장/);
  assert.match(html, /예약 카드 · 공개 1장 보기/);
  assert.doesNotMatch(html, /상대 예약.*구매 선택/);
});

test("GEM turn cues and accepted-feedback IDs are exact-once; storage absence cannot affect gameplay", () => {
  const snapshot = gemPlayingFixture();
  const turn = snapshot.game.turn.turnId;
  const selfId = snapshot.self.playerId;
  assert.equal(shouldAnnounceGemTurn(null, turn, selfId, selfId), true);
  assert.equal(shouldAnnounceGemTurn(turn, turn, selfId, selfId), false);
  assert.equal(shouldAnnounceGemTurn(turn, turn, snapshot.game.turnOrder[1]!, selfId), false);
  assert.equal(shouldAnnounceGemTurn(turn, "next-my-turn" as TurnId, selfId, selfId), true);
  const seen = new Set<RequestId>();
  for (const kind of ["COLLECT", "PURCHASE", "RESERVE", "YIELD"]) {
    const id = `accepted-${kind}` as RequestId;
    assert.equal(markGemFeedback(seen, id), true);
    assert.equal(markGemFeedback(seen, id), false);
  }
  assert.equal(readGemSoundStorage("sessionStorage", "absent"), null);
  assert.doesNotThrow(() => writeGemSoundStorage("localStorage", "absent", "true"));
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const blockedStorageWindow = Object.defineProperties({}, {
    localStorage: { get() { throw new Error("Storage blocked"); } },
    sessionStorage: { get() { throw new Error("Storage blocked"); } },
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: blockedStorageWindow });
  try {
    assert.equal(readGemSoundStorage("sessionStorage", "turn"), null);
    assert.doesNotThrow(() => writeGemSoundStorage("localStorage", "preference", "false"));
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("GEM transient reset depends on gameplay identity, not presence/version/time; CSS remains scoped and responsive", () => {
  const source = readFileSync(new URL("../../src/features/gem-card/GemCardPlayingScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /setCollect\(null\); setSelected\(null\);\s*\}, \[game\.gameId, game\.gameRevision, game\.turn\.turnId, props\.selectionResetGeneration, props\.sessionReplaced\]\)/);
  assert.doesNotMatch(source, /NumberTile|Hangul|TurnDraft|paymentPlan/);
  const css = readFileSync(new URL("../../src/features/gem-card/gem-card.css", import.meta.url), "utf8");
  assert.match(css, /max-width: 620px/);
  assert.match(css, /max-width: 350px/);
  assert.match(css, /\.gem-actions \{ display: flex; align-items: stretch; \}/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(css, /overflow-x:\s*(scroll|auto)/);
});
