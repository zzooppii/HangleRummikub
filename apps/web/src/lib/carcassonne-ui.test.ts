import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import {
  CarcassonnePlayingPlatformSnapshotV2Schema,
  CarcassonneLobbyPlatformSnapshotV2Schema,
  CarcassonneFinishedPlatformSnapshotV2Schema,
  CarcassonneClientCommandSchema,
  GameRevisionSchema,
  TurnIdSchema,
} from "@hangul-rummikub/shared";
import { CarcassonneScreen } from "../features/carcassonne/CarcassonneScreen.js";
import {
  previewCarcassonne,
  nextCarcassonneRotation,
} from "../features/carcassonne/ui.js";
import {
  carcassonneTransitionCues,
  CARCASSONNE_SOUND_SCORE,
  CarcassonneAudio,
} from "../features/carcassonne/sound.js";
import {
  decodeWebSnapshot,
  type CarcassonneWebSnapshot,
} from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const players = [
  {
    playerId: "a",
    nickname: "하비",
    isHost: true,
    connectionStatus: "CONNECTED",
  },
  {
    playerId: "b",
    nickname: "민지",
    isHost: false,
    connectionStatus: "CONNECTED",
  },
];
function lobby() {
  return parse(CarcassonneLobbyPlatformSnapshotV2Schema, {
    snapshotVersion: 2,
    versions: { roomRevision: 1, presenceVersion: 1 },
    serverTime: 1000,
    self: { playerId: "a" },
    room: {
      roomId: "carc-room",
      roomCode: "ABCDEF",
      gameType: "CARCASSONNE",
      phase: "LOBBY",
      players,
    },
    game: null,
  });
}
function playing() {
  const l = lobby();
  return parse(CarcassonnePlayingPlatformSnapshotV2Schema, {
    ...l,
    room: { ...l.room, phase: "PLAYING" },
    game: {
      gameType: "CARCASSONNE",
      gameId: "carc-game",
      gameRevision: 0,
      rulesVersion: "carcassonne-base72-v1",
      phase: "PLAYING",
      turnId: "carc-turn",
      activePlayerId: "a",
      turnStartedAt: 1000,
      deadlineAt: 91000,
      board: [{ tileId: "start", kind: "D", x: 0, y: 0, rotation: 0 }],
      meeples: [],
      currentTile: { tileId: "current", kind: "E" },
      bagCount: 70,
      discardedTiles: [],
      playerStates: players.map((p) => ({
        playerId: p.playerId,
        score: 0,
        availableMeeples: 7,
      })),
      feedback: null,
      history: [],
    },
  });
}
function render(snapshot: CarcassonneWebSnapshot) {
  return renderToStaticMarkup(
    createElement(CarcassonneScreen, {
      snapshot,
      connected: true,
      pending: false,
      error: null,
      connectionLabel: "서버 연결됨",
      onCommand: async () => {},
      onRematch() {},
      onStart() {},
      onLeave() {},
      onCopy() {},
    }),
  );
}
test("Carcassonne UI: concrete lobby, playing and cancelled screens decode; public scores, controls and illustrated tiles render", () => {
  const l = lobby(),
    p = playing();
  const {
    phase: _phase,
    turnId: _turn,
    activePlayerId: _active,
    turnStartedAt: _started,
    deadlineAt: _deadline,
    ...base
  } = p.game;
  const f = parse(CarcassonneFinishedPlatformSnapshotV2Schema, {
    ...p,
    room: { ...p.room, phase: "FINISHED" },
    game: {
      ...base,
      phase: "FINISHED",
      result: {
        reason: "CANCELLED",
        winnerPlayerIds: [],
        scores: [],
        finalScoring: [],
      },
    },
  });
  for (const s of [l, p, f]) {
    const d = decodeWebSnapshot(s);
    assert.equal(d.kind, "COMPATIBLE");
    if (d.kind !== "COMPATIBLE") throw new Error();
    assert.equal(resolveRoomSnapshotView(d.value).kind, "CARCASSONNE");
    assert.match(render(s), /CARCASSONNE/);
  }
  assert.match(render(l), /우리의 지도 시작하기/);
  assert.equal(getGameStartControl(l, false).canStart, true);
  const html = render(p);
  for (const label of [
    "지금, 내 차례입니다",
    "남은 시간 90초",
    "카르카손 효과음 볼륨",
    "소리 들어보기",
    "턴 확정",
    "미플 7\/7",
    "민지",
    "전체 보기",
  ])
    assert.match(html, new RegExp(label));
  assert.match(render(f), /이번 게임이 취소/);
  assert.match(
    render(
      parse(CarcassonnePlayingPlatformSnapshotV2Schema, {
        ...p,
        self: { playerId: "b" },
      }),
    ),
    /하비님의 차례/,
  );
});
test("Carcassonne preview: rotation, city closure, score and return are predicted without mutating canonical state", () => {
  const s = playing(),
    g = s.game,
    before = JSON.stringify(g),
    draft = { x: 1, y: 0, rotation: 270 as const, meepleRegionId: "c0" };
  const p = previewCarcassonne(g, s.self.playerId, draft);
  assert.ok(p.action);
  assert.deepEqual(p.gains, [{ playerId: "a", points: 4 }]);
  assert.equal(p.returnCount, 1);
  assert.equal(JSON.stringify(g), before);
  assert.equal(
    previewCarcassonne(g, s.self.playerId, { ...draft, rotation: 0 }).action,
    null,
  );
  assert.equal(
    previewCarcassonne(g, g.playerStates[1]!.playerId, draft).action,
    null,
  );
  assert.equal(previewCarcassonne(g, s.self.playerId, null).action, null);
  assert.equal(nextCarcassonneRotation(270), 0);
  assert.equal(nextCarcassonneRotation(0, false), 270);
  const farmer = previewCarcassonne(g, s.self.playerId, {
    ...draft,
    meepleRegionId: "f0",
  });
  assert.ok(farmer.action);
  assert.equal(farmer.returnCount, 0);
  assert.deepEqual(farmer.gains, []);
});
test("Carcassonne preview: connected occupation and exhausted supply prevent meeples; tile-only action remains possible", () => {
  const s = playing(),
    g = s.game,
    draft = { x: 1, y: 0, rotation: 270 as const, meepleRegionId: "c0" };
  g.meeples.push({
    playerId: g.playerStates[1]!.playerId,
    tileId: g.board[0]!.tileId,
    regionId: "c0",
  });
  g.playerStates[1]!.availableMeeples = 6;
  assert.match(previewCarcassonne(g, s.self.playerId, draft).reason, /이미/);
  assert.equal(previewCarcassonne(g, s.self.playerId, draft).action, null);
  assert.ok(
    previewCarcassonne(g, s.self.playerId, { ...draft, meepleRegionId: null })
      .action,
  );
  g.meeples = [];
  g.playerStates[0]!.availableMeeples = 0;
  assert.match(
    previewCarcassonne(g, s.self.playerId, draft).reason,
    /남은 미플/,
  );
});
test("Carcassonne DTO: rejects forged state, hidden deck, wrong roster, broken tile conservation and invalid commands", () => {
  const s = playing(),
    g = s.game,
    c = {
      kind: "carcassonne:act",
      protocolVersion: 1,
      requestId: "r",
      gameId: g.gameId,
      turnId: g.turnId,
      expectedGameRevision: 0,
      payload: {
        tileId: "current",
        x: 1,
        y: 0,
        rotation: 270,
        meepleRegionId: null,
      },
    };
  assert.equal(safeParse(CarcassonneClientCommandSchema, c).success, true);
  for (const bad of [
    { ...c, turnId: undefined },
    { ...c, payload: { ...c.payload, score: 999 } },
    { ...c, payload: { ...c.payload, rotation: 45 } },
    { ...c, payload: { ...c.payload, x: NaN } },
    { ...c, payload: { ...c.payload, meepleRegionId: "f99" } },
  ])
    assert.equal(safeParse(CarcassonneClientCommandSchema, bad).success, false);
  for (const game of [
    { ...g, bag: ["secret"] },
    { ...g, bagCount: 71 },
    { ...g, activePlayerId: "outsider" },
    { ...g, deadlineAt: 90000 },
    { ...g, board: [...g.board, ...g.board] },
    { ...g, playerStates: [g.playerStates[0], g.playerStates[0]] },
    {
      ...g,
      meeples: [{ playerId: "a", tileId: "start", regionId: "invalid" }],
    },
  ])
    assert.equal(
      safeParse(CarcassonnePlayingPlatformSnapshotV2Schema, { ...s, game })
        .success,
      false,
    );
});
test("Carcassonne audio: mount/reconnect/duplicate revision never replay history; new placements and scores precede own-turn cue", () => {
  const s = playing(),
    g = s.game,
    n = {
      ...g,
      gameRevision: parse(GameRevisionSchema, 1),
      turnId: parse(TurnIdSchema, "next"),
      activePlayerId: g.playerStates[1]!.playerId,
      feedback: {
        playerId: s.self.playerId,
        tile: { ...g.currentTile!, x: 1, y: 0, rotation: 270 as const },
        meepleRegionId: "c0",
        automatic: false,
        at: s.serverTime,
        scoring: [
          {
            featureId: "c",
            kind: "CITY" as const,
            tileIds: [g.board[0]!.tileId, g.currentTile!.tileId],
            points: 4,
            winnerPlayerIds: [s.self.playerId],
            returnedPlayerIds: [s.self.playerId],
            final: false,
            complete: true,
            shields: 0,
            cityCount: 0,
          },
        ],
      },
    };
  assert.deepEqual(carcassonneTransitionCues(null, n, "b"), []);
  assert.deepEqual(carcassonneTransitionCues(g, g, "a"), []);
  assert.deepEqual(carcassonneTransitionCues(g, n, "b"), [
    "PLACE",
    "SCORE",
    "TURN",
  ]);
  assert.deepEqual(carcassonneTransitionCues(n, structuredClone(n), "b"), []);
  for (const notes of Object.values(CARCASSONNE_SOUND_SCORE)) {
    assert.ok(notes.length);
    for (const note of notes) {
      assert.ok(note.gain <= 0.34);
      assert.ok(note.decay <= 0.65);
      assert.ok(note.pitch > 0 && note.pitch < 2000);
    }
  }
  const audio = new CarcassonneAudio(() => null);
  audio.unlock();
  audio.play(["PLACE"]);
  audio.setVolume(0);
  audio.play(["TURN"]);
  audio.dispose();
});
