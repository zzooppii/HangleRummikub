import assert from "node:assert/strict";
import test from "node:test";

import { decodeWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";

function decodedLobbyV2() {
  const decoded = decodeWebSnapshot({
    snapshotVersion: 2,
    versions: { roomRevision: 1, presenceVersion: 1 },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_web_route",
      roomCode: "ABC234",
      phase: "LOBBY",
      gameType: "HANGUL_TILE",
      players: [
        {
          playerId: "player_web_route",
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: { playerId: "player_web_route" },
    game: null,
  });

  assert.equal(decoded.kind, "COMPATIBLE");
  if (
    decoded.kind !== "COMPATIBLE" ||
    decoded.value.kind !== "PLATFORM_V2_HANGUL_TILE"
  ) {
    throw new Error("Expected a compatible V2 Lobby fixture.");
  }
  return decoded.value;
}

test("accepted V1은 기존 Legacy Hangul renderer resolver를 그대로 사용한다", () => {
  const platform = decodedLobbyV2();
  const legacy = decodeWebSnapshot(platform.legacySnapshot);
  assert.equal(legacy.kind, "COMPATIBLE");
  if (legacy.kind !== "COMPATIBLE") {
    throw new Error("Expected a compatible legacy fixture.");
  }

  assert.deepEqual(resolveRoomSnapshotView(legacy.value), { kind: "LOBBY" });

  const malformedLegacy = structuredClone(legacy.value);
  Reflect.set(malformedLegacy.legacySnapshot.room, "phase", "PLAYING");
  assert.deepEqual(resolveRoomSnapshotView(malformedLegacy), {
    kind: "LOBBY",
  });
});

test("accepted V2는 canonical gameType과 phase가 일치할 때만 renderer를 선택한다", () => {
  const decoded = decodedLobbyV2();
  assert.deepEqual(resolveRoomSnapshotView(decoded), { kind: "LOBBY" });

  const wrongType = structuredClone(decoded);
  Reflect.set(wrongType.platformSnapshot.room, "gameType", "OTHER_GAME");
  assert.deepEqual(resolveRoomSnapshotView(wrongType), {
    kind: "INCOMPATIBLE",
    reason: "UNSUPPORTED_GAME_TYPE",
  });

  const wrongPhase = structuredClone(decoded);
  Reflect.set(wrongPhase.legacySnapshot.room, "phase", "PLAYING");
  assert.deepEqual(resolveRoomSnapshotView(wrongPhase), {
    kind: "INCOMPATIBLE",
    reason: "INVALID_V2_PROJECTION",
  });
});
