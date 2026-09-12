import assert from "node:assert/strict";
import test from "node:test";
import { parse, safeParse } from "valibot";
import { LiarClientCommandSchema, LiarPlayingPlatformSnapshotV2Schema, LiarSettingsSchema, LiarFinishedPlatformSnapshotV2Schema, GAME_PLAYER_LIMITS } from "./index.js";
const players = ["a", "b", "c", "d"].map((playerId, i) => ({ playerId, nickname: `친구${i}`, isHost: i === 0, connectionStatus: "CONNECTED" }));
function playing() { return { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 1000, self: { playerId: "a" }, room: { roomId: "room", roomCode: "BCDFGH", gameType: "LIAR_GAME", phase: "PLAYING", players }, game: { gameType: "LIAR_GAME", gameId: "game", gameRevision: 0, rulesVersion: "liar-game-v2", roundNumber: 1, totalRounds: 10, scores: players.map(p => ({ playerId: p.playerId, points: 0 })), rounds: [], settings: { category: "FOOD", discussionSeconds: 90 }, category: "FOOD", playerStates: players.map(p => ({ playerId: p.playerId, clue: null, clueDone: false })), messages: [], phase: "PLAYING", stage: "REVEAL", phaseId: "reveal", deadlineAt: 16000, activePlayerId: null, voteCandidates: [], privateView: { playerId: "a", role: "LIAR", votedFor: null } } }; }
test("LIAR wire strictly distinguishes liar and citizen cards, identity and private leaks", () => {
  const s = playing(); assert.ok(safeParse(LiarPlayingPlatformSnapshotV2Schema, s).success);
  const citizen = { ...s, game: { ...s.game, privateView: { ...s.game.privateView, role: "CITIZEN", word: "피자" } } }; assert.ok(safeParse(LiarPlayingPlatformSnapshotV2Schema, citizen).success);
  for (const game of [{ ...s.game, word: "피자" }, { ...s.game, aliases: [] }, { ...s.game, votes: [] }, { ...s.game, privateView: { ...s.game.privateView, word: "피자" } }, { ...s.game, privateView: { ...s.game.privateView, playerId: "b" } }, { ...s.game, gameType: "WOLF_NIGHT" }]) assert.equal(safeParse(LiarPlayingPlatformSnapshotV2Schema, { ...s, game }).success, false);
  assert.deepEqual(GAME_PLAYER_LIMITS.LIAR_GAME, { min: 4, max: 8 });
});
test("LIAR commands reject unknown properties, invalid lengths, identifiers and options", () => {
  const c = { kind: "liar:clue", protocolVersion: 1, requestId: "req", gameId: "game", phaseId: "clue", payload: { text: "바삭해요" } };
  assert.ok(safeParse(LiarClientCommandSchema, c).success);
  for (const bad of [{ ...c, actorPlayerId: "b" }, { ...c, payload: { text: " " } }, { ...c, payload: { text: "가".repeat(41) } }, { ...c, payload: { text: "hello", word: "secret" } }, { ...c, phaseId: "" }]) assert.equal(safeParse(LiarClientCommandSchema, bad).success, false);
  assert.equal(safeParse(LiarSettingsSchema, { category: "FOOD", discussionSeconds: 91 }).success, false);
  assert.equal(safeParse(LiarSettingsSchema, { category: "CUSTOM", discussionSeconds: 90 }).success, false);
});
test("LIAR result explicitly reveals word and ballots only on finished branch", () => {
  const s = playing(); const { stage: _stage, phaseId: _phase, deadlineAt: _deadline, activePlayerId: _actor, voteCandidates: _candidates, privateView: _private, ...base } = s.game;
  const result = { reason: "NO_VOTES", winnerPlayerIds: ["d"], liarPlayerId: "d", word: "피자", guess: null, voteRounds: [players.map(p => ({ playerId: p.playerId, votedFor: null }))] };
  const finish = parse(LiarFinishedPlatformSnapshotV2Schema, { ...s, room: { ...s.room, phase: "FINISHED" }, game: { ...base, phase: "FINISHED", matchWinnerPlayerIds: ["a", "b", "c"], result } });
  assert.equal(finish.game.result.word, "피자"); assert.equal(finish.game.result.voteRounds[0]!.length, 4);
  assert.equal(safeParse(LiarPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, result } }).success, false);
});

test("LIAR nextRound has strict scoped identity and round-result wire has no private card", () => {
  const c = { kind: "liar:nextRound", protocolVersion: 1, requestId: "next", gameId: "game", phaseId: "result", payload: {} };
  assert.ok(safeParse(LiarClientCommandSchema, c).success);
  for (const bad of [{ ...c, payload: { points: 3 } }, { ...c, phaseId: "" }, { ...c, roundNumber: 2 }]) assert.equal(safeParse(LiarClientCommandSchema, bad).success, false);
  const s = playing(), { privateView: _private, deadlineAt: _deadline, activePlayerId: _actor, voteCandidates: _candidates, ...base } = s.game;
  const result = { reason: "NO_VOTES", liarPlayerId: "d", winnerPlayerIds: ["d"], word: "피자", guess: null, voteRounds: [players.map(p => ({ playerId: p.playerId, votedFor: null }))] };
  const game = { ...base, stage: "ROUND_RESULT", result };
  assert.ok(safeParse(LiarPlayingPlatformSnapshotV2Schema, { ...s, game }).success);
  for (const bad of [{ ...game, privateView: s.game.privateView }, { ...game, deadlineAt: 1000 }, { ...game, roundNumber: 11 }, { ...game, totalRounds: 5 }, { ...game, liarPromptHistory: [] }]) assert.equal(safeParse(LiarPlayingPlatformSnapshotV2Schema, { ...s, game: bad }).success, false);
});
