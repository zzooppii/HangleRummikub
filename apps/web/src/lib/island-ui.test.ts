import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import {
  ISLAND_BOARD, ISLAND_RESOURCES, emptyIslandResources,
  IslandLobbyPlatformSnapshotV2Schema, IslandPlayingPlatformSnapshotV2Schema,
  IslandFinishedPlatformSnapshotV2Schema, IslandClientCommandSchema,
  type IslandStage,
} from "@hangul-rummikub/shared";
import { IslandScreen, islandStageLabel, islandTargets } from "../features/island/IslandScreen.js";
import { decodeWebSnapshot, type IslandWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
import { roomLeaveConfirmationMessage } from "./room-leave.js";

const players = Array.from({ length: 11 }, (_, i) => ({ playerId: `islander-${i}`, nickname: `친구${i}`, isHost: i === 0, connectionStatus: "CONNECTED" }));
function lobby(n = 3) {
  return parse(IslandLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 0, presenceVersion: 0 }, serverTime: 1000,
    self: { playerId: "islander-0" }, room: { roomId: "island-room", roomCode: "BCDFGH", gameType: "ISLAND_SETTLERS", phase: "LOBBY", players: players.slice(0, n) }, game: null });
}
function playing(stage: IslandStage = { kind: "ROLL" }) {
  const l = lobby();
  return parse(IslandPlayingPlatformSnapshotV2Schema, { ...l, room: { ...l.room, phase: "PLAYING" }, game: {
    gameType: "ISLAND_SETTLERS", gameId: "island-game", gameRevision: 0, rulesVersion: "island-v1", phase: "PLAYING",
    hexes: ISLAND_BOARD.hexes.map(h => ({ id: h.id, resource: h.id === 18 ? null : ISLAND_RESOURCES[h.id % 5], number: h.id === 18 ? null : 4 })),
    ports: ISLAND_BOARD.portEdges.map((edge, i) => ({ edge, resource: i < 4 ? null : ISLAND_RESOURCES[i - 4] })), buildings: [], roads: [], robber: 18,
    bank: { WOOD: 17, BRICK: 18, WOOL: 19, GRAIN: 17, ORE: 18 }, developmentCount: 24,
    playerStates: l.room.players.map((p, i) => ({ playerId: p.playerId, resourceCount: i === 0 ? 6 : 0, developmentCount: i === 0 ? 1 : 0,
      knights: 0, roadLength: 0, publicPoints: 0, remainingRoads: 15, remainingSettlements: 5, remainingCities: 4 })),
    longestRoadPlayerId: null, largestArmyPlayerId: null, dice: null, log: [],
    privateState: { playerId: "islander-0", resources: { WOOD: 2, BRICK: 1, WOOL: 0, GRAIN: 2, ORE: 1 }, totalPoints: 1,
      cards: [{ id: "my-secret-vp", kind: "VICTORY", playable: false }] },
    activePlayerId: "islander-0", turnId: "island-turn", turnNumber: 1, deadlineAt: 121000, stage, trade: null,
    legalActions: { roadEdges: [2, 8], settlementVertices: [4, 12], cityVertices: [9], robberHexes: [1, 3],
      bankRates: { WOOD: 2, BRICK: 3, WOOL: 4, GRAIN: 4, ORE: 4 }, canBuyCard: false, canPlayCard: false },
  } });
}
function render(snapshot: IslandWebSnapshot, connected = true, pending = false) {
  return renderToStaticMarkup(createElement(IslandScreen, { snapshot, connected, pending, error: null, connectionLabel: "연결됨",
    onCommand: async () => undefined, onStart() {}, onLeave() {}, onCopy() {} }));
}
function finished() {
  const p = playing();
  const { activePlayerId, turnId, turnNumber, deadlineAt, stage, trade, legalActions, ...base } = p.game;
  return parse(IslandFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: "FINISHED" }, game: { ...base, phase: "FINISHED",
    result: { reason: "VICTORY", winnerPlayerIds: ["islander-0"], scores: players.slice(0, 3).map((p, i) => ({ playerId: p.playerId, points: i === 0 ? 10 : 6 })) } } });
}

test("ISLAND lobby, game and result decode into their concrete screen", () => {
  for (const s of [lobby(), playing(), finished()]) {
    const decoded = decodeWebSnapshot(s); assert.equal(decoded.kind, "COMPATIBLE");
    if (decoded.kind !== "COMPATIBLE") throw new Error("Expected compatible snapshot");
    assert.equal(resolveRoomSnapshotView(decoded.value).kind, "ISLAND_SETTLERS");
  }
  assert.match(render(lobby()), /섬 개척 시작하기/);
  assert.match(render(playing()), /내 자원/);
  assert.match(render(finished()), /친구0 님의 섬이 되었어요!/);
  assert.match(render(finished()), /같은 방에서 다시 시작하기/);
});
test("ISLAND lobby requires 3–4 connected players and host authority", () => {
  assert.equal(getGameStartControl(lobby(2), false).canStart, false);
  for (const n of [3, 4]) assert.equal(getGameStartControl(lobby(n), false).canStart, true);
  assert.equal(getGameStartControl(lobby(5), false).canStart, false);
  assert.throws(() => lobby(11));
  assert.equal(getGameStartControl({ ...lobby(), self: { playerId: "islander-1" } }, false).canStart, false);
  const s = lobby(); s.room.players[1]!.connectionStatus = "OFFLINE";
  assert.equal(getGameStartControl(s, false).canStart, false);
  assert.match(render(s), /모든 참가자가 접속 중/);
  assert.match(render(lobby()), /차례당 2분/);
});
test("ISLAND ingress rejects forged ownership, hidden state, stale-shaped and out-of-range commands", () => {
  const command = { kind: "island:act", protocolVersion: 1, requestId: "island-request", gameId: "island-game", expectedGameRevision: 0, turnId: "island-turn", payload: { type: "BUILD_ROAD", edge: 71 } };
  assert.ok(safeParse(IslandClientCommandSchema, command).success);
  for (const bad of [
    { ...command, actorPlayerId: "islander-1" }, { ...command, expectedGameRevision: undefined }, { ...command, turnId: undefined },
    { ...command, payload: { type: "BUILD_ROAD", edge: 72 } }, { ...command, payload: { type: "ROLL", dice: [6, 6] } },
    { ...command, payload: { type: "DISCARD", resources: { ...emptyIslandResources(), ORE: -1 } } },
    { ...command, payload: { type: "PLAY_KNIGHT", cardId: "" } },
  ]) assert.equal(safeParse(IslandClientCommandSchema, bad).success, false);
  const s = playing();
  for (const game of [
    { ...s.game, deck: [] }, { ...s.game, playerStates: s.game.playerStates.map(p => ({ ...p, resources: emptyIslandResources() })) },
    { ...s.game, privateState: { ...s.game.privateState, playerId: "islander-1" } },
    { ...s.game, privateState: { ...s.game.privateState, cards: [] } },
    { ...s.game, privateState: { ...s.game.privateState, resources: emptyIslandResources() } },
  ]) assert.equal(decodeWebSnapshot({ ...s, game }).kind, "INCOMPATIBLE");
});
test("ISLAND board targets come only from server choices, stage and viewer", () => {
  const s = playing({ kind: "ACTION" }), me = s.self.playerId;
  assert.deepEqual(islandTargets(s.game, me, "ROAD"), [{ kind: "edge", id: 2 }, { kind: "edge", id: 8 }]);
  assert.deepEqual(islandTargets(s.game, me, "SETTLEMENT"), [{ kind: "vertex", id: 4 }, { kind: "vertex", id: 12 }]);
  assert.deepEqual(islandTargets(s.game, me, "CITY"), [{ kind: "vertex", id: 9 }]);
  for (const mode of ["ROAD", "SETTLEMENT", "CITY", "TRADE", "CARDS"] as const) assert.deepEqual(islandTargets(s.game, "islander-1", mode), []);
  assert.deepEqual(islandTargets(playing().game, me, "ROAD"), []);
  assert.deepEqual(islandTargets(playing({ kind: "ROBBER_HEX", returnTo: "ACTION" }).game, me, "ROAD"), [{ kind: "hex", id: 1 }, { kind: "hex", id: 3 }]);
  assert.deepEqual(islandTargets(playing({ kind: "FREE_ROADS", remaining: 2, returnTo: "ROLL" }).game, me, "CITY"), [{ kind: "edge", id: 2 }, { kind: "edge", id: 8 }]);
});
test("ISLAND roll disables for disconnection, pending request, other turn and deadline", () => {
  const s = playing();
  function roll(html: string) { const button = html.match(/<button[^>]*>주사위 굴리기<\/button>/)?.[0]; assert.ok(button); return button; }
  assert.doesNotMatch(roll(render(s)), /disabled/);
  assert.match(roll(render(s, false)), /disabled/); assert.match(roll(render(s, true, true)), /disabled/);
  const other = parse(IslandPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, activePlayerId: "islander-1" } });
  assert.match(roll(render(other)), /disabled/);
  const expired = parse(IslandPlayingPlatformSnapshotV2Schema, { ...s, serverTime: 121000 });
  assert.match(roll(render(expired)), /disabled/); assert.match(render(expired), /서버가 남은 선택을 처리/);
  assert.match(render(s, false), /차례의 2분은 계속 흐릅니다/);
});
test("ISLAND setup has keyboard accessible board buttons, equivalent select and explicit confirmation", () => {
  const s = playing({ kind: "SETUP_SETTLEMENT" }), html = render(s);
  assert.match(html, /aria-label="교차점 5 선택"/);
  assert.match(html, /aria-label="교차점 13 선택"/);
  assert.doesNotMatch(html, /aria-label="교차점 6 선택"/);
  assert.match(html, /<select[^>]*>.*교차점 5.*교차점 13/s);
  assert.match(html, /<button[^>]*disabled[^>]*>위치를 선택해주세요/);
  assert.match(html, /확대해서 보기/);
  assert.match(html, /자원 지형 19개/);
});
test("ISLAND discard renders only my required resources and waiting players cannot discard", () => {
  const s = playing(), stage = parse(IslandPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, stage: { kind: "DISCARD", pending: [{ playerId: s.self.playerId, count: 3 }] } } });
  const html = render(stage); assert.match(html, /자원 3장을 골라주세요/);
  assert.match(html, /aria-label="버릴 자원 목재"[^>]*min="0" max="2"/);
  assert.match(html, /<button[^>]*disabled[^>]*>0 \/ 3장 · 버리기/);
  const wait = parse(IslandPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, stage: { kind: "DISCARD", pending: [{ playerId: "islander-1", count: 4 }] } } });
  assert.doesNotMatch(render(wait), /aria-label="버릴 자원/); assert.match(render(wait), /기다리는 중 · 친구1/);
});
test("ISLAND trade shows consent and final confirmation separately", () => {
  const s = playing({ kind: "ACTION" });
  const proposal = parse(IslandPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, trade: { id: "trade-1", proposerId: s.self.playerId,
    give: { ...emptyIslandResources(), WOOD: 1 }, receive: { ...emptyIslandResources(), GRAIN: 1 }, responses: [{ playerId: "islander-1", accepted: true }] } } });
  assert.match(render(proposal), /친구1 · 수락/); assert.match(render(proposal), /이 사람과 확정/); assert.match(render(proposal), /제안 철회/);
  const inbound = parse(IslandPlayingPlatformSnapshotV2Schema, { ...proposal, game: { ...proposal.game, trade: { ...proposal.game.trade!, proposerId: "islander-1", responses: [] } } });
  assert.match(render(inbound), /거래할게요/); assert.doesNotMatch(render(inbound), /이 사람과 확정/);
});
test("ISLAND robber, free-road guidance and cancellation keep mandatory actions explicit", () => {
  const s = playing();
  const victim = parse(IslandPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, stage: { kind: "ROBBER_VICTIM", returnTo: "ACTION", candidates: ["islander-1"] } } });
  assert.match(render(victim), /친구1 · 무작위 자원 한 장/); assert.doesNotMatch(render(victim), /친구2 · 무작위/);
  assert.equal(islandStageLabel(playing({ kind: "FREE_ROADS", remaining: 1, returnTo: "ACTION" }).game, true), "무료 도로 1개를 놓아주세요");
  assert.match(roomLeaveConfirmationMessage("PLAYING", "ISLAND_SETTLERS"), /모든 참가자.*취소/);
  const end = finished(), cancelled = parse(IslandFinishedPlatformSnapshotV2Schema, { ...end, game: { ...end.game, result: { ...end.game.result, reason: "CANCELLED", winnerPlayerIds: [] } } });
  assert.match(render(cancelled), /참가자가 나가 이번 판이 취소/);
});
