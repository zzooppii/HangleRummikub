import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { NumberTileFinishedPlatformSnapshotV2Schema, NumberTilePlayingPlatformSnapshotV2Schema } from "@hangul-rummikub/shared";
import { NumberTileFinishedScreen } from "../features/number-tile/NumberTileFinishedScreen.js";
import { NumberTilePlayingScreen } from "../features/number-tile/NumberTilePlayingScreen.js";
import { numberBoardFixture, numberBoardProps } from "./number-board-test-fixture.js";

function finishedFixture() {
  const before = numberBoardFixture(3, 0);
  const { turn: _turn, ...game } = before.game;
  return v.parse(NumberTileFinishedPlatformSnapshotV2Schema, { ...before,
    room: { ...before.room, phase: "FINISHED" }, game: { ...game, placementOrder: ["self"],
      result: { rankingMode: "PLACEMENT", reason: "PLACEMENT_COMPLETE", finishedAt: before.serverTime,
        winnerPlayerIds: ["self"], rankings: [
          { playerId: "self", rank: 1, remainingRackCount: 0, forfeited: false },
          { playerId: "other", rank: 2, remainingRackCount: 14, forfeited: false },
        ] } } });
}

test("Number placement result is scoreless and keeps final board behind a host rematch dialog", () => {
  const snapshot = finishedFixture();
  const html = renderToStaticMarkup(createElement(NumberTileFinishedScreen, {
    snapshot, connectionLabel: "서버 연결됨", connectionTone: "connected", errorMessage: null,
    sessionReplaced: false, roomLeavePending: false, onLeaveRoom() {}, onGoHome() {}, onRematch() {},
  }));
  assert.match(html, /마지막 공용 테이블/);
  assert.match(html, /내 남은 랙/);
  assert.match(html, /<dialog/);
  assert.match(html, /결과 닫기/);
  assert.match(html, /게임 결과/);
  assert.match(html, /대기실로 돌아가기/);
  assert.match(html, /1위/);
  assert.match(html, /2위/);
  assert.doesNotMatch(html, /벌점|score =|점수/);
});

test("Number non-host result cannot show rematch and exposes only own remaining rack", () => {
  const base = finishedFixture();
  const snapshot = v.parse(NumberTileFinishedPlatformSnapshotV2Schema, { ...base,
    room: { ...base.room, players: base.room.players.map(p => ({ ...p, isHost: p.playerId !== base.self.playerId })) } });
  const html = renderToStaticMarkup(createElement(NumberTileFinishedScreen, {
    snapshot, connectionLabel: "OFFLINE", connectionTone: "offline", errorMessage: null,
    sessionReplaced: false, roomLeavePending: false, onLeaveRoom() {}, onGoHome() {},
  }));
  assert.doesNotMatch(html, /대기실로 돌아가기/);
  assert.match(html, /방장이 새 게임을 준비/);
  assert.doesNotMatch(html, /rack-0|rack-1/);
});

test("Number placed spectator sees live rank without a final modal while other players continue", () => {
  const base = numberBoardFixture(3, 0, 3, false);
  const snapshot = v.parse(NumberTilePlayingPlatformSnapshotV2Schema, { ...base,
    room: { ...base.room, players: [...base.room.players, { playerId: "third", nickname: "지훈", isHost: false, connectionStatus: "CONNECTED" }] },
    game: { ...base.game, placementOrder: ["self"], remainingPoolCount: base.game.remainingPoolCount - 14,
      playerStates: [...base.game.playerStates, { playerId: "third", rackCount: 14, initialMeldCompleted: false, forfeited: false }] } });
  const html = renderToStaticMarkup(createElement(NumberTilePlayingScreen, { ...numberBoardProps(snapshot), canAct: false, canSubmit: false }));
  assert.match(html, /1위를 확정했습니다/);
  assert.match(html, /순위 결정이 진행 중/);
  assert.match(html, /공용 타일 보드/);
  assert.doesNotMatch(html, /<dialog|대기실로 돌아가기/);
});

test("Number result dialog uses native close/reopen and bounded mobile layout", () => {
  const screen = readFileSync(new URL("../../src/features/number-tile/NumberTileFinishedScreen.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/features/number-tile/number-tile-board.css", import.meta.url), "utf8");
  assert.match(screen, /modal\.showModal\(\)/);
  assert.match(screen, /dialog\.current\?\.close\(\)/);
  assert.match(screen, /dialog\.current\?\.showModal\(\)/);
  assert.match(css, /number-result-modal/);
  assert.match(css, /100dvh/);
});

test("Number placement wire validation rejects legacy score fields, duplicate ranks and fabricated completion", () => {
  const snapshot = finishedFixture();
  assert.ok("rankingMode" in snapshot.game.result);
  const rankings = snapshot.game.result.rankings;
  for (const result of [
    { ...snapshot.game.result, score: 50 },
    { ...snapshot.game.result, rankings: rankings.map(entry => ({ ...entry, rank: 1 })) },
    { ...snapshot.game.result, winnerPlayerIds: ["other"] },
  ]) assert.equal(v.safeParse(NumberTileFinishedPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, result } }).success, false);
  assert.equal(v.safeParse(NumberTileFinishedPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, placementOrder: [] } }).success, false);
  assert.equal(v.safeParse(NumberTileFinishedPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, placementOrder: ["self", "self"] } }).success, false);
});
