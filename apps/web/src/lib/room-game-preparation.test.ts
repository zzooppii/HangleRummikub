import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlatformSnapshotV2Schema, RoomPreparationCommandSchema } from "@hangul-rummikub/shared";
import { decodeWebSnapshot } from "./snapshot-wire-decoder.js";
import { projectRoomSnapshotShell } from "./room-snapshot-shell.js";
import { getGameStartControl } from "./game-start.js";

const lobby = (count: number, ready: boolean) => v.parse(PlatformSnapshotV2Schema, {
  snapshotVersion: 2, versions: { roomRevision: 12, presenceVersion: 8 }, serverTime: 100,
  room: { roomId: "same-room", roomCode: "ABC234", phase: "LOBBY", gameType: "HANGUL_TILE",
    players: Array.from({ length: count }, (_, i) => ({ playerId: `p-${i}`, nickname: `참가${i}`, isHost: i === 0, connectionStatus: "CONNECTED", isReady: ready })) },
  self: { playerId: "p-0" }, game: null,
});

test("Hangul V2 lobby preserves readiness in room shell while its legacy adapter stays exact", () => {
  const decoded = decodeWebSnapshot(lobby(3, false)); assert.equal(decoded.kind, "COMPATIBLE"); if (decoded.kind !== "COMPATIBLE") throw new Error();
  const shell = projectRoomSnapshotShell(decoded.value);
  assert.equal(shell.gameId, null); assert.ok(shell.room.players.every(p => p.isReady === false));
  assert.equal(getGameStartControl(shell, false).canStart, false);
  const prepared = decodeWebSnapshot(lobby(3, true)); assert.equal(prepared.kind, "COMPATIBLE"); if (prepared.kind !== "COMPATIBLE") throw new Error();
  assert.equal(getGameStartControl(projectRoomSnapshotShell(prepared.value), false).canStart, true);
  const overcrowded = decodeWebSnapshot(lobby(6, true)); assert.equal(overcrowded.kind, "COMPATIBLE"); if (overcrowded.kind !== "COMPATIBLE") throw new Error();
  assert.equal(getGameStartControl(projectRoomSnapshotShell(overcrowded.value), false).canStart, false);
});

test("room preparation validates the exact command and previous game scope", () => {
  const command = { kind: "room:selectGame", protocolVersion: 1, requestId: "select-1", expectedRoomRevision: 2, expectedGameRevision: null, payload: { gameType: "GEM_CARD", gameId: null } };
  assert.equal(v.safeParse(RoomPreparationCommandSchema, command).success, true);
  for (const invalid of [ { ...command, expectedRoomRevision: -1 }, { ...command, expectedGameRevision: undefined }, { ...command, payload: { gameType: "UNKNOWN", gameId: null } }, { ...command, payload: { gameType: "GEM_CARD", gameId: null, playerId: "someone-else" } } ]) assert.equal(v.safeParse(RoomPreparationCommandSchema, invalid).success, false);
  assert.equal(v.safeParse(RoomPreparationCommandSchema, { kind: "room:ready", protocolVersion: 1, requestId: "ready-1", expectedRoomRevision: 3, payload: { ready: true } }).success, true);
  assert.equal(v.safeParse(RoomPreparationCommandSchema, { kind: "room:ready", protocolVersion: 1, requestId: "ready-1", expectedRoomRevision: 3, payload: { ready: "true" } }).success, false);
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RoomGameControls } from "../features/lobby/RoomGameControls.js";

test("room controls render host selection, per-member readiness and offline disabled actions", () => {
  const decoded = decodeWebSnapshot(lobby(3, false)); assert.equal(decoded.kind, "COMPATIBLE"); if (decoded.kind !== "COMPATIBLE") throw new Error();
  const snapshot = projectRoomSnapshotShell(decoded.value);
  const render = (selfId = snapshot.self.playerId, disabled = false) => renderToStaticMarkup(createElement(RoomGameControls, { snapshot: { ...snapshot, self: { playerId: selfId } }, disabled, onSelectGame: () => {}, onReady: () => {} }));
  assert.match(render(), /플레이할 게임/); assert.match(render(), /준비하기/); assert.match(render(), /ABC234/);
  const guest = render(snapshot.room.players[1]!.playerId); assert.doesNotMatch(guest, /<select/); assert.match(guest, /준비하기/);
  assert.match(render(undefined, true), /disabled=""/);
});
