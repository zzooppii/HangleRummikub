import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import {
  SplendorLobbyPlatformSnapshotV2Schema,
  SplendorPlayingPlatformSnapshotV2Schema,
  SplendorFinishedPlatformSnapshotV2Schema,
  SplendorCardSchema,
  SplendorClientCommandSchema,
} from "@hangul-rummikub/shared";
import { SplendorScreen } from "../features/splendor/SplendorScreen.js";
import {
  effectiveCost,
  paymentPreview,
  validTake,
  zeroTokens,
} from "../features/splendor/ui.js";
import {
  decodeWebSnapshot,
  type SplendorWebSnapshot,
} from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
import { roomLeaveConfirmationMessage } from "./room-leave.js";
const cost = { WHITE: 0, BLUE: 0, GREEN: 2, RED: 2, BLACK: 0 };
const card = parse(SplendorCardSchema, {
  cardId: "visible-card",
  tier: 1,
  bonus: "BLUE",
  points: 0,
  cost,
  art: 0,
});
function lobby(n = 2) {
  return parse(SplendorLobbyPlatformSnapshotV2Schema, {
    snapshotVersion: 2,
    versions: { roomRevision: 0, presenceVersion: 0 },
    serverTime: 1000,
    self: { playerId: "sp-0" },
    room: {
      roomId: "sp-room",
      roomCode: "BCDFGH",
      gameType: "SPLENDOR",
      phase: "LOBBY",
      players: Array.from({ length: n }, (_, i) => ({
        playerId: `sp-${i}`,
        nickname: `상인${i}`,
        isHost: i === 0,
        connectionStatus: "CONNECTED",
      })),
    },
    game: null,
  });
}
function playing() {
  const l = lobby();
  return parse(SplendorPlayingPlatformSnapshotV2Schema, {
    ...l,
    room: { ...l.room, phase: "PLAYING" },
    game: {
      gameType: "SPLENDOR",
      gameId: "sp-game",
      gameRevision: 0,
      rulesVersion: "splendor-base-v1",
      cardSetVersion: "splendor-base-2014-v1",
      bank: { WHITE: 4, BLUE: 4, GREEN: 4, RED: 4, BLACK: 4, GOLD: 5 },
      market: [1, 2, 3].map((tier) => ({
        tier,
        slots: Array.from({ length: 4 }, (_, i) => ({
          ...card,
          cardId: `visible-${tier}-${i}`,
          tier,
        })),
        deckCount: 10,
      })),
      nobles: [],
      playerStates: l.room.players.map((p) => ({
        playerId: p.playerId,
        tokens: zeroTokens(),
        bonuses: { ...cost, GREEN: 0, RED: 0 },
        purchased: [],
        reservedCount: 0,
        nobles: [],
        score: 0,
      })),
      privateState: { playerId: "sp-0", reserved: [] },
      feedback: null,
      round: 1,
      finalRound: false,
      phase: "PLAYING",
      turnId: "sp-turn",
      activePlayerId: "sp-0",
      deadlineAt: 91000,
    },
  });
}
function render(snapshot: SplendorWebSnapshot, connected = true) {
  return renderToStaticMarkup(
    createElement(SplendorScreen, {
      snapshot,
      connected,
      pending: false,
      error: null,
      connectionLabel: "연결됨",
      onCommand: async () => undefined,
      onStart() {},
      onLeave() {},
      onCopy() {},
    }),
  );
}
test("SPLENDOR routes all phases to its graphical screen independently of GEM_CARD", () => {
  const p = playing();
  const { turnId, activePlayerId, deadlineAt, ...base } = p.game;
  const end = parse(SplendorFinishedPlatformSnapshotV2Schema, {
    ...p,
    room: { ...p.room, phase: "FINISHED" },
    game: {
      ...base,
      phase: "FINISHED",
      result: {
        reason: "INACTIVE",
        winnerPlayerIds: [],
        scores: p.game.playerStates.map((p) => ({
          playerId: p.playerId,
          score: 0,
          cards: 0,
        })),
      },
    },
  });
  for (const s of [lobby(), p, end]) {
    const d = decodeWebSnapshot(s);
    assert.equal(d.kind, "COMPATIBLE");
    if (d.kind === "COMPATIBLE")
      assert.equal(resolveRoomSnapshotView(d.value).kind, "SPLENDOR");
  }
  assert.match(render(lobby()), /상단 열기/);
  const html = render(p);
  assert.equal((html.match(/class="sp-development/g) ?? []).length, 12);
  assert.match(html, /공용 카드 시장/);
  assert.match(html, /sp-scene/);
  assert.match(html, /sp-gem/);
  assert.match(html, /나만 보기/);
  assert.match(render(end), /다시/);
  assert.match(render(p, false), /연결/);
});
test("SPLENDOR lobby requires host and 2–4 players", () => {
  assert.equal(getGameStartControl(lobby(1), false).canStart, false);
  assert.equal(getGameStartControl(lobby(2), false).canStart, true);
  assert.equal(getGameStartControl(lobby(4), false).canStart, true);
  assert.equal(
    getGameStartControl({ ...lobby(), self: { playerId: "sp-1" } }, false)
      .canStart,
    false,
  );
});
test("SPLENDOR preview deducts discounts and supports choosing gold over matching gems", () => {
  const bonus = { ...cost, GREEN: 1, RED: 0 };
  const held = { ...zeroTokens(), GREEN: 1, RED: 2, GOLD: 1 };
  assert.deepEqual(effectiveCost(card, bonus), { ...cost, GREEN: 1 });
  assert.equal(paymentPreview(card, bonus, held).can, true);
  const gold = paymentPreview(card, bonus, held, { ...zeroTokens(), RED: 2 });
  assert.equal(gold.payment.GOLD, 1);
  assert.equal(gold.can, true);
  assert.equal(
    paymentPreview(
      card,
      bonus,
      { ...held, GOLD: 0 },
      { ...zeroTokens(), RED: 2 },
    ).can,
    false,
  );
  assert.equal(
    paymentPreview(card, bonus, held, { ...zeroTokens(), GREEN: 2, RED: 2 })
      .can,
    false,
  );
});
test("SPLENDOR taking preview handles scarcity, double threshold, and forbids direct gold", () => {
  const bank = { ...zeroTokens(), GREEN: 4, RED: 2, WHITE: 1 };
  assert.equal(validTake({ ...zeroTokens(), GREEN: 2 }, bank), true);
  assert.equal(validTake({ ...zeroTokens(), RED: 2 }, bank), false);
  assert.equal(
    validTake({ ...zeroTokens(), GREEN: 1, RED: 1, WHITE: 1 }, bank),
    true,
  );
  assert.equal(
    validTake({ ...zeroTokens(), GREEN: 1, RED: 1 }, { ...bank, WHITE: 0 }),
    true,
  );
  assert.equal(validTake({ ...zeroTokens(), GREEN: 1, GOLD: 1 }, bank), false);
});
test("SPLENDOR strict contract rejects forged actors, unknown fields and another viewer's private cards", () => {
  const c = {
    kind: "splendor:act",
    protocolVersion: 1,
    requestId: "sp-req",
    gameId: "sp-game",
    turnId: "sp-turn",
    expectedGameRevision: 0,
    payload: {
      kind: "TAKE",
      tokens: { ...zeroTokens(), GREEN: 2 },
      returns: zeroTokens(),
      nobleId: null,
    },
  };
  assert.ok(safeParse(SplendorClientCommandSchema, c).success);
  for (const bad of [
    { ...c, actorPlayerId: "sp-1" },
    { ...c, expectedGameRevision: undefined },
    { ...c, payload: { ...c.payload, score: 15 } },
    { ...c, payload: { ...c.payload, tokens: { ...zeroTokens(), GREEN: -1 } } },
  ])
    assert.equal(safeParse(SplendorClientCommandSchema, bad).success, false);
  const p = playing();
  assert.equal(
    safeParse(SplendorPlayingPlatformSnapshotV2Schema, {
      ...p,
      game: { ...p.game, privateState: { playerId: "sp-1", reserved: [] } },
    }).success,
    false,
  );
  assert.equal(
    safeParse(SplendorPlayingPlatformSnapshotV2Schema, {
      ...p,
      game: { ...p.game, privateState: { playerId: "sp-0", reserved: [card] } },
    }).success,
    false,
  );
  assert.equal(
    safeParse(SplendorPlayingPlatformSnapshotV2Schema, {
      ...p,
      game: { ...p.game, deck: [] },
    }).success,
    false,
  );
});
test("SPLENDOR leaving describes cancellation of the whole game", () => {
  assert.match(
    roomLeaveConfirmationMessage("PLAYING", "SPLENDOR"),
    /모든 참가자.*취소/,
  );
});
