import assert from "node:assert/strict";
import test from "node:test";
import { GemCardFinishedPlatformSnapshotV2Schema } from "./index.js";
import * as v from "valibot";
import { GemCollectCommandSchema, GemPurchaseCommandSchema, GemReserveCommandSchema, GemYieldCommandSchema, validateGemCollectCommand, validateGemPurchaseCommand, validateGemReserveCommand, validateGemYieldCommand, GemCardPlayingPlatformSnapshotV2Schema, GemCardLobbyPlatformSnapshotV2Schema, PlatformSnapshotV2Schema, resolveSupportedGameTypesCapability } from "./index.js";
const envelope = { protocolVersion: 1, requestId: "gem-contract", expectedGameRevision: 0, turnId: "gem-turn" };
const commands = [
  { kind: "gem:collect", ...envelope, payload: { selection: { kind: "BASIC", resources: ["DAWN", "TIDE"] } } },
  { kind: "gem:purchase", ...envelope, payload: { source: { kind: "MARKET", tier: 1, slotIndex: 0 } } },
  { kind: "gem:reserve", ...envelope, payload: { source: { tier: 2, slotIndex: 1 } } },
  { kind: "gem:yield", ...envelope, payload: {} },
];
const schemas = [GemCollectCommandSchema, GemPurchaseCommandSchema, GemReserveCommandSchema, GemYieldCommandSchema] as const;
const validators = [validateGemCollectCommand, validateGemPurchaseCommand, validateGemReserveCommand, validateGemYieldCommand] as const;
for (const [index, command] of commands.entries())
  test(`${command.kind} exact additive envelope rejects extra results/payment/gameType`, () => {
    const schema = schemas[index]!;
    assert.equal(v.safeParse(schema, command).success, true);
    assert.equal(validators[index]!(command).ok, true);
    for (const extra of ["gameType", "paymentPlan", "supply", "score", "result"]) {
      assert.equal(v.safeParse(schema, { ...command, [extra]: 1 }).success, false);
      assert.equal(v.safeParse(schema, { ...command, payload: { ...command.payload, [extra]: 1 } }).success, false);
    }
    assert.equal(validators[index]!({ ...command, protocolVersion: 2 }).ok, false);
    assert.equal(validators[index]!(commands[(index + 1) % 4]).ok, false);
  });
test("GEM collect permits exactly distinct one/two basics OR PRISM, never mixed; purchase sources are exact", () => {
  const basic = commands[0]!;
  assert.equal(v.safeParse(GemCollectCommandSchema, { ...basic, payload: { selection: { kind: "PRISM" } } }).success, true);
  for (const resources of [[], ["DAWN", "DAWN"], ["DAWN", "TIDE", "ECHO"], ["DAWN", "PRISM"], ["UNKNOWN"]])
    assert.equal(v.safeParse(GemCollectCommandSchema, { ...basic, payload: { selection: { kind: "BASIC", resources } } }).success, false);
  assert.equal(v.safeParse(GemCollectCommandSchema, { ...basic, payload: { selection: { kind: "PRISM", resources: ["DAWN"] } } }).success, false);
  assert.equal(v.safeParse(GemPurchaseCommandSchema, { ...commands[1], payload: { source: { kind: "RESERVED", cardId: "GC-T1-01" } } }).success, true);
  assert.equal(v.safeParse(GemReserveCommandSchema, { ...commands[2], payload: { source: { kind: "RESERVED", cardId: "GC-T1-01" } } }).success, false);
});
function lobby() {
  return { snapshotVersion: 2, versions: { roomRevision: 0, presenceVersion: 0 }, serverTime: 1000,
    room: { roomId: "gem-room", roomCode: "BCDFGH", gameType: "GEM_CARD", phase: "LOBBY", players: ["A", "B"].map((playerId, i) => ({ playerId, nickname: playerId, isHost: i === 0, connectionStatus: "CONNECTED" })) }, self: { playerId: "A" }, game: null };
}
function playing() {
  const zero = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
  return { ...lobby(), room: { ...lobby().room, phase: "PLAYING" }, game: {
      gameType: "GEM_CARD", gameId: "gem-game", gameRevision: 0, rulesVersion: "gem-rules-v1", cardSetVersion: "gem-cardset-v1", turnOrder: ["A", "B"],
      supply: { DAWN: 7, TIDE: 7, GROVE: 7, EMBER: 7, ECHO: 7, PRISM: 5 },
      market: [1, 2, 3].map(tier => ({ tier, remainingDeckCount: 12, slots: [1, 2, 3].map(i => ({ cardId: `GC-T${tier}-0${i}`, tier, cost: { ...zero, DAWN: 3 }, productionResource: "TIDE", victoryPoints: 0 })) })),
      playerStates: ["A", "B"].map(playerId => ({ playerId, resources: { ...zero, PRISM: 0 }, production: zero, purchasedCards: [], reservedCards: [], score: 0, forfeited: false })),
      turn: { turnId: "gem-turn", turnNumber: 1, activePlayerId: "A", startedAt: 1000, deadlineAt: 46000 }, fairRound: null,
    } };
}
test("GEM exact V2 LOBBY/PLAYING is rack-free, correlated, and rejects hidden infrastructure", () => {
  assert.equal(v.safeParse(GemCardLobbyPlatformSnapshotV2Schema, lobby()).success, true);
  const snapshot = playing();
  assert.equal(v.safeParse(GemCardPlayingPlatformSnapshotV2Schema, snapshot).success, true);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, snapshot).success, true);
  for (const field of ["privateState", "rack", "deck", "rng", "storageRevision", "offlineTimeoutStreak", "noProgressPlayerIds"])
    assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, [field]: [] } }).success, false);
  for (const gameType of ["HANGUL_TILE", "NUMBER_TILE"])
    assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...snapshot, room: { ...snapshot.room, gameType } }).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...snapshot, self: { playerId: "missing" } }).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, turn: { ...snapshot.game.turn, deadlineAt: 91000 } } }).success, false);
});
test("GEM V2 validates public resource/card/score correlation and no fake player rack", () => {
  const s = playing();
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...s, game: { ...s.game, supply: { ...s.game.supply, DAWN: 6 } } }).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...s, game: { ...s.game, playerStates: s.game.playerStates.map(p => ({ ...p, rackCount: 0 })) } }).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...s, game: { ...s.game, playerStates: s.game.playerStates.map(p => ({ ...p, score: 18 })) } }).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...s, game: { ...s.game, market: s.game.market.map(t => ({ ...t, slots: [t.slots[0], t.slots[0], t.slots[2]] })) } }).success, false);
});
test("GEM capability is explicit and independent of the legacy Hangul default", () => {
  assert.deepEqual(resolveSupportedGameTypesCapability({}), { ok: true, mode: "LEGACY_DEFAULT", supportedGameTypes: ["HANGUL_TILE"] });
  assert.deepEqual(resolveSupportedGameTypesCapability({ supportedGameTypes: ["GEM_CARD"] }), { ok: true, mode: "EXPLICIT", supportedGameTypes: ["GEM_CARD"] });
});

test("GEM FINISHED is rack-free with exact eligible winners, forfeited ranking and no active turn", () => {
  const source = playing();
  const { turn: _turn, fairRound: _fairRound, ...game } = source.game;
  const snapshot = {
    ...source,
    room: { ...source.room, phase: "FINISHED" },
    game: { ...game,
      playerStates: game.playerStates.map(p => ({ ...p, forfeited: p.playerId === "B" })),
      result: { reason: "LAST_PLAYER_STANDING", finishedAt: 2000, winnerPlayerIds: ["A"], rankings: [
        { playerId: "A", rank: 1, score: 0, purchasedCardCount: 0, forfeited: false },
        { playerId: "B", rank: 2, score: 0, purchasedCardCount: 0, forfeited: true },
      ] },
    },
  };
  assert.equal(v.safeParse(GemCardFinishedPlatformSnapshotV2Schema, snapshot).success, true);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, snapshot).success, true);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, turn: source.game.turn } }).success, false);
  for (const result of [ { ...snapshot.game.result, winnerPlayerIds: ["B"] }, { ...snapshot.game.result, reason: "SCORE_THRESHOLD_ROUND_END" } ]) {
    assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, result } }).success, false);
  }
});
