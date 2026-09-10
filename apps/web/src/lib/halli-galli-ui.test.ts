import { roomLeaveConfirmationMessage } from "./room-leave.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { HalliLobbyPlatformSnapshotV2Schema, HalliPlayingPlatformSnapshotV2Schema, HalliClientCommandSchema, HalliFinishedPlatformSnapshotV2Schema } from "@hangul-rummikub/shared";
import { HalliGalliScreen } from "../features/halli-galli/HalliGalliScreen.js";
import { decodeWebSnapshot, type HalliWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const players = Array.from({ length: 6 }, (_, i) => ({ playerId: `fruit-${i}`, nickname: `친구${i}`, isHost: i === 0, connectionStatus: "CONNECTED" }));
function lobby(n = 3) { return parse(HalliLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 0, presenceVersion: 0 }, serverTime: 1000, self: { playerId: "fruit-0" }, room: { roomId: "fruit-room", roomCode: "BCDFGH", gameType: "HALLI_GALLI", phase: "LOBBY", players: players.slice(0, n) }, game: null }); }
function playing() { const l = lobby(); return parse(HalliPlayingPlatformSnapshotV2Schema, { ...l, room: { ...l.room, phase: "PLAYING" }, game: { gameType: "HALLI_GALLI", gameId: "fruit-game", gameRevision: 0, rulesVersion: "halli-galli-v1", phase: "PLAYING", playerStates: l.room.players.map((p, i) => ({ playerId: p.playerId, deckCount: i === 2 ? 18 : 19, discardCount: 0, eliminated: false, topCard: null })), feedback: null, turnId: "fruit-turn", activePlayerId: "fruit-0", flipAvailableAt: 2000, deadlineAt: 11000, gameDeadlineAt: 901000 } }); }
function render(s: HalliWebSnapshot, connected = true) { return renderToStaticMarkup(createElement(HalliGalliScreen, { snapshot: s, connected, pending: false, error: null, connectionLabel: "연결됨", onCommand: async () => undefined, onStart() {}, onLeave() {}, onCopy() {} })); }
test("HALLI routes lobby/playing/finished through concrete V2 screen", () => {
 const p = playing(), finished = parse(HalliFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: "FINISHED" }, game: { gameType: "HALLI_GALLI", gameId: p.game.gameId, gameRevision: 1, rulesVersion: p.game.rulesVersion, playerStates: p.game.playerStates, feedback: null, phase: "FINISHED", result: { reason: "TIME_LIMIT", winnerPlayerIds: ["fruit-0", "fruit-1"], scores: p.game.playerStates.map(p => ({ playerId: p.playerId, cards: p.deckCount })) } } });
 for (const s of [lobby(), p, finished]) { const d = decodeWebSnapshot(s); assert.equal(d.kind, "COMPATIBLE"); if (d.kind === "COMPATIBLE") assert.equal(resolveRoomSnapshotView(d.value).kind, "HALLI_GALLI"); }
 assert.match(render(lobby()), /카드 나누고 시작하기/); assert.match(render(p), /벨 누르기/); assert.match(render(finished), /같은 방에서 다시 하기/); assert.match(render(p, false), /연결을 복구/);
});
test("HALLI admits 2–6 connected players, requires host, no start for one", () => {
 assert.equal(getGameStartControl(lobby(1), false).canStart, false); assert.equal(getGameStartControl(lobby(2), false).canStart, true); assert.equal(getGameStartControl(lobby(6), false).canStart, true);
 assert.equal(getGameStartControl({ ...lobby(), self: { playerId: "fruit-1" } }, false).canStart, false);
});
test("HALLI strict ingress rejects forged card payload, extra actor, absent revision and foreign projection", () => {
 const c = { protocolVersion: 1, requestId: "bell-1", kind: "halli:bell", gameId: "fruit-game", expectedGameRevision: 0, payload: {} };
 assert.ok(safeParse(HalliClientCommandSchema, c).success); for (const bad of [{ ...c, payload: { fruits: 5 } }, { ...c, actorPlayerId: "fruit-2" }, { ...c, expectedGameRevision: undefined }]) assert.equal(safeParse(HalliClientCommandSchema, bad).success, false);
 const s = playing(); assert.equal(safeParse(HalliPlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, deck: [] } }).success, false);
 assert.equal(decodeWebSnapshot({ ...s, game: { ...s.game, gameType: "WOLF_NIGHT" } }).kind, "INCOMPATIBLE");
});

test("HALLI leave confirmation explains cancellation of the whole round", () => { assert.match(roomLeaveConfirmationMessage("PLAYING", "HALLI_GALLI"), /모든 참가자.*취소/); assert.match(roomLeaveConfirmationMessage("PLAYING", "NUMBER_TILE"), /기권/); });
