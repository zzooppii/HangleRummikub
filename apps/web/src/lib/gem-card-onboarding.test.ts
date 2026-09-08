import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NicknameSchema, PlayerIdSchema } from "@hangul-rummikub/shared";
import * as v from "valibot";
import { GemGameHelp, GemHelpDialog, GemPurchaseExample } from "../features/gem-card/GemGameHelp.js";
import { GemPurchasePreview } from "../features/gem-card/GemPurchasePreview.js";
import { GemCardPlayingScreen, type GemCardPlayingScreenProps } from "../features/gem-card/GemCardPlayingScreen.js";
import { GEM_GUIDE_SECTIONS, GEM_TUTORIAL_STEPS, GEM_TUTORIAL_PREFERENCE, hasSeenGemTutorial, markGemTutorialSeen, nextGemTutorialStep } from "../features/gem-card/gem-card-guide.js";
import { gemCurrentActionHint, gemPaymentPreview, type GemUiCard, type GemUiPlayer } from "../features/gem-card/gem-card-ui.js";
import { gemPlayingFixture } from "./gem-card-test-fixtures.js";

const zero = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
const player = (): GemUiPlayer => gemPlayingFixture().game.playerStates[0]!;
const card = (): GemUiCard => ({ ...gemPlayingFixture().game.market[0]!.slots[0]!, cost: { ...zero, DAWN: 2, TIDE: 1, EMBER: 1 } });
const preview = (c = card(), p = player()) => renderToStaticMarkup(createElement(GemPurchasePreview, { card: c, player: p }));
const helpSource = readFileSync(new URL("../../src/features/gem-card/GemGameHelp.tsx", import.meta.url), "utf8");
const screenSource = readFileSync(new URL("../../src/features/gem-card/GemCardPlayingScreen.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../../src/features/gem-card/gem-card.css", import.meta.url), "utf8");
function playingProps(snapshot = gemPlayingFixture()): GemCardPlayingScreenProps {
  return { snapshot, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null, sessionReplaced: false, actionPending: false,
    commandRetryKind: null, actionFeedback: null, selectionResetGeneration: 0, roomLeavePending: false, canAct: true,
    onCollect() {}, onPurchase() {}, onReserve() {}, onYield() {}, onRetry() {}, onLeaveRoom() {}, onGoHome() {} };
}

test("zero holdings production regression: D2 T1 E1 is unavailable, never a payable PRISM4 preview", () => {
  const html = preview();
  assert.match(html, /구매 불가 · 자원 부족/);
  assert.match(html, /새벽 2 · 물결 1 · 불씨 1/);
  assert.match(html, /프리즘 대체 필요 4개 · 보유 0개/);
  assert.match(html, /현재 보유 자원: 없음/);
  assert.doesNotMatch(html, /실제 예상 지불|구매 가능/);
});

test("available purchase preview uses exact basics first and only owned PRISM for shortage", () => {
  const c = { ...card(), cost: { ...zero, DAWN: 2, EMBER: 1 } };
  const p = { ...player(), resources: { ...zero, DAWN: 1, EMBER: 1, PRISM: 1 } };
  assert.match(preview(c, p), /실제 예상 지불: 새벽 1 · 불씨 1 · 프리즘 1/);
  const exact = { ...p, resources: { ...zero, DAWN: 2, EMBER: 1, PRISM: 1 } };
  assert.equal(gemPaymentPreview(c, exact).prismRequired, 0);
  assert.match(preview(c, exact), /실제 예상 지불: 새벽 2 · 불씨 1/);
  assert.doesNotMatch(preview(c, exact), /실제 예상 지불:[^<]*프리즘/);
});

test("insufficient PRISM is an unmet requirement rather than fabricated payment", () => {
  const html = preview(card(), { ...player(), resources: { ...zero, PRISM: 2 } });
  assert.match(html, /프리즘 대체 필요 4개 · 보유 2개/);
  assert.match(html, /보유 프리즘으로도 2개 부족/);
  assert.doesNotMatch(html, /실제 예상 지불/);
});

test("EMBER discount +2 makes printed3 effective1; fully discounted is explicitly free", () => {
  const c = { ...card(), cost: { ...zero, EMBER: 3 } };
  const p = { ...player(), production: { ...zero, EMBER: 2 }, resources: { ...zero, EMBER: 1, PRISM: 0 } };
  assert.equal(gemPaymentPreview(c, p).effective.EMBER, 1);
  assert.match(preview(c, p), /불씨<\/th><td>3<\/td><td>−2<\/td><td><strong>1/);
  const free = preview(c, { ...p, production: { ...zero, EMBER: 4 } });
  assert.match(free, /구매 가능 · 할인으로 무료/);
  assert.match(free, /실제 예상 지불: 없음 \(0개\)/);
  assert.doesNotMatch(free, /<strong>−1/);
});

test("payment explanations and current-action hints never mutate snapshots or command inputs", () => {
  const snapshot = gemPlayingFixture();
  const before = JSON.stringify(snapshot);
  preview(snapshot.game.market[0]!.slots[0]!, snapshot.game.playerStates[0]!);
  gemCurrentActionHint(snapshot.game, snapshot.game.playerStates[0]!);
  assert.equal(JSON.stringify(snapshot), before);
  assert.match(screenSource, /<GemPurchasePreview card=\{card\} player=\{player\}/);
  assert.match(screenSource, /props.onPurchase\(selected.source\)/);
  assert.doesNotMatch(screenSource, /onPurchase\([^)]*(payment|effective|prism)/);
});

test("GEM first-time tutorial is available in Lobby, never automatically blocks Playing", () => {
  const lobby = renderToStaticMarkup(createElement(GemGameHelp, { placement: "LOBBY" }));
  const playing = renderToStaticMarkup(createElement(GemGameHelp, { placement: "PLAYING" }));
  assert.match(lobby, /간단히 배우기/);
  assert.match(lobby, /지금은 건너뛰기/);
  assert.match(lobby, /게임 방법 보기/);
  assert.match(playing, /게임 방법/);
  assert.doesNotMatch(lobby + playing, /<dialog/);
  assert.doesNotMatch(playing, /간단히 알아볼까요/);
});

test("six tutorial steps progress to completion and explain the exact GEM loop", () => {
  assert.equal(GEM_TUTORIAL_STEPS.length, 6);
  for (let step = 0; step < 5; step++) assert.equal(nextGemTutorialStep(step), step + 1);
  assert.equal(nextGemTutorialStep(5), null);
  const content = JSON.stringify(GEM_TUTORIAL_STEPS);
  for (const copy of ["18점", "최종 라운드", "기본 자원 1~2개", "프리즘 1개", "9개", "영구 할인", "소모되지", "기본 자원을 먼저", "최대 2장", "보상은 없습니다"]) assert.ok(content.includes(copy), copy);
});

test("skip/completion persist only optional tutorial preference and keep replay available", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(hasSeenGemTutorial(storage), false);
  markGemTutorialSeen(storage);
  assert.equal(hasSeenGemTutorial(storage), true);
  assert.deepEqual([...values], [[GEM_TUTORIAL_PREFERENCE, "seen"]]);
  assert.match(helpSource, /function finish\(\) \{ markGemTutorialSeen\(\); setSeen\(true\); setMode\(null\); \}/);
  assert.match(helpSource, /onClick=\{onFinish\}>건너뛰기/);
  assert.match(helpSource, /next === null\) onFinish/);
  assert.match(helpSource, /6단계 튜토리얼 다시 보기/);
  assert.match(helpSource, /Math.max\(0, current - 1\)/);
});

test("blocked or unavailable tutorial storage cannot affect gameplay", () => {
  const blocked = { getItem(): string { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  assert.equal(hasSeenGemTutorial(blocked), false);
  assert.doesNotThrow(() => markGemTutorialSeen(blocked));
  assert.equal(hasSeenGemTutorial(undefined), false);
  assert.doesNotThrow(() => markGemTutorialSeen(undefined));
});

test("tutorial/guide navigation has no gameplay props, networking, credential or timer mutation", () => {
  assert.doesNotMatch(helpSource, /snapshot|gameRevision|requestId|sessionToken|socket|realtime|fetch\(|onCollect|onPurchase|onReserve|onYield|onStartGame/);
  assert.match(helpSource, /useState<"GUIDE" \| "TUTORIAL" \| null>\(null\)/);
  const lobby = readFileSync(new URL("../../src/features/lobby/LobbyScreen.tsx", import.meta.url), "utf8");
  assert.match(lobby, /room.gameType === "GEM_CARD" \? <GemGameHelp placement="LOBBY"/);
  assert.match(screenSource, /<GemGameHelp placement="PLAYING"/);
});

test("Game Guide covers all ten sections, exact payment example and fair-round boundary", () => {
  assert.equal(GEM_GUIDE_SECTIONS.length, 10);
  const html = renderToStaticMarkup(createElement(GemHelpDialog, { tutorial: false, onTutorial() {}, onDismiss() {}, onFinish() {} }));
  for (const section of GEM_GUIDE_SECTIONS) assert.ok(html.includes(section.title));
  for (const copy of ["서로 다른 기본 자원 1~2개", "최대 9개", "최대 2장", "예약 보상은 없", "일반 패스가 아닙니다", "45초", "처음으로 돌아가기 전에", "공동 우승"]) assert.ok(html.includes(copy), copy);
  const example = renderToStaticMarkup(createElement(GemPurchaseExample));
  assert.match(example, /새벽<\/th><td>3<\/td><td>−1<\/td><td>2/);
  assert.match(example, /새벽 2 \+ 프리즘 1/);
  assert.match(example, /프리즘도 없다면 구매 불가/);
});

test("GEM native dialog traps focus, supports Escape/close and restores a connected trigger", () => {
  const html = renderToStaticMarkup(createElement(GemHelpDialog, { tutorial: true, onTutorial() {}, onDismiss() {}, onFinish() {} }));
  assert.match(html, /<dialog[^>]*aria-modal="true" aria-labelledby="gem-help-heading"/);
  assert.match(html, /aria-label="게임 방법 닫기"/);
  assert.match(helpSource, /dialog.showModal\(\)/);
  assert.match(helpSource, /onCancel=.*onDismiss\(\)/);
  assert.match(helpSource, /previousFocus.isConnected\) previousFocus.focus\(\)/);
  assert.match(helpSource, /else returnFocusRef\?\.current\?\.focus\(\)/);
  assert.match(helpSource, /dialog.close\(\)/);
});

test("context hints explain first resources and affordable market/reserve without forcing strategy", () => {
  const snapshot = gemPlayingFixture();
  const self = snapshot.game.playerStates[0]!;
  assert.equal(gemCurrentActionHint(snapshot.game, self), "먼저 자원을 모아보세요.");
  const rich = { ...self, resources: { ...zero, DAWN: 3, EMBER: 2, PRISM: 0 } };
  assert.match(gemCurrentActionHint(snapshot.game, rich), /구매 가능한 카드가 생겼습니다/);
  assert.match(gemCurrentActionHint(snapshot.game, { ...rich, reservedCards: [snapshot.game.market[0]!.slots[0]!] }), /예약한 카드/);
  assert.doesNotMatch(screenSource, /disabled=\{[^}]*gemCurrentActionHint/);
});

test("2/3/4-player summaries retain public resources/discounts and expandable exact cards without self duplication", () => {
  for (const count of [2, 3, 4]) {
    const snapshot = gemPlayingFixture();
    snapshot.room.players = Array.from({ length: count }, (_, i) => {
      return { ...snapshot.room.players[0]!, playerId: v.parse(PlayerIdSchema, `player-${i}`), nickname: v.parse(NicknameSchema, `참가자${i}`), isHost: i === 0 };
    });
    snapshot.self.playerId = snapshot.room.players[0]!.playerId;
    snapshot.game.playerStates = snapshot.room.players.map(p => ({ ...player(), playerId: p.playerId, reservedCards: [card()] }));
    snapshot.game.turn.activePlayerId = snapshot.self.playerId;
    const html = renderToStaticMarkup(createElement(GemCardPlayingScreen, playingProps(snapshot)));
    assert.equal((html.match(/class="gem-player gem-player-summary"/g) ?? []).length, count);
    assert.equal((html.match(/예약 카드 · 공개 1장 보기/g) ?? []).length, count);
    assert.match(html, /참가자1 보유 자원/);
    assert.match(html, /참가자1 영구 할인/);
    assert.doesNotMatch(html, /참가자0 보유 자원|생산 할인|생산 \+1/);
  }
});

test("GEM guide/mobile panels have bounded internal scrolling, readable targets, and no horizontal-scroll rule", () => {
  assert.match(css, /max-height: min\(780px, calc\(100dvh - 24px\)\)/);
  assert.match(css, /\.gem-help-scroll \{ overflow-y: auto; min-height: 0/);
  assert.match(css, /\.gem-help-dialog button \{ min-height: 44px/);
  assert.match(css, /\.gem-help-footer button \{ width: auto; white-space: nowrap; flex-shrink: 0; min-width: 52px/);
  assert.match(css, /\.gem-compact-players \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.gem-compact-players \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
});
