import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "valibot";
import {
  BURGUNDY_DEFAULT_SETTINGS,
  BurgundyLobbyPlatformSnapshotV2Schema,
  burgundyBoard,
  TileIdSchema,
  BurgundyPlayerSchema,
} from "@hangul-rummikub/shared";
import { BurgundyScreen } from "../features/burgundy/BurgundyScreen.js";
import { BurgundyBoard } from "../features/burgundy/BurgundyBoard.js";
import {
  BurgundyAudio,
  burgundySoundCues,
} from "../features/burgundy/sound.js";
import { decodeWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
const lobby = () =>
  parse(BurgundyLobbyPlatformSnapshotV2Schema, {
    snapshotVersion: 2,
    versions: { roomRevision: 1, presenceVersion: 1 },
    serverTime: 1000,
    self: { playerId: "a" },
    room: {
      roomId: "bu-room",
      roomCode: "ABCDEF",
      gameType: "BURGUNDY",
      phase: "LOBBY",
      settings: BURGUNDY_DEFAULT_SETTINGS,
      players: [
        {
          playerId: "a",
          nickname: "공작",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
        {
          playerId: "b",
          nickname: "친구",
          isHost: false,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    game: null,
  });
test("BURGUNDY host lobby routes through strict snapshot and renders edition, settings, artwork and audio", () => {
  const s = lobby(),
    d = decodeWebSnapshot(s);
  assert.equal(d.kind, "COMPATIBLE");
  if (d.kind !== "COMPATIBLE") return;
  assert.equal(resolveRoomSnapshotView(d.value).kind, "BURGUNDY");
  const html = renderToStaticMarkup(
    createElement(BurgundyScreen, {
      snapshot: s,
      connected: true,
      pending: false,
      error: null,
      connectionLabel: "연결됨",
      onCommand: async () => {},
      onStart() {},
      onRematch() {},
      onLeave() {},
      onCopy() {},
    }),
  );
  assert.match(html, /20주년판/);
  assert.match(html, /30초/);
  assert.match(html, /60초/);
  assert.match(html, /90초/);
  assert.match(html, /무역로/);
  assert.doesNotMatch(html, /포도밭|팀전|솔로/);
  assert.match(html, /음소거/);
  assert.match(html, /게임 시작/);
});
test("BURGUNDY board keeps all37 cells and uses labels as well as colors for placement", () => {
  const board = burgundyBoard(1);
  const p = parse(BurgundyPlayerSchema, {
    playerId: "a",
    score: 0,
    silver: 1,
    workers: 2,
    boardId: 1,
    board: [{ cellId: "0,0", tile: { tileId: "start", kind: "CASTLE" } }],
    storage: [],
    goods: [0, 0, 0, 0, 0, 0],
    soldGoods: [0, 0, 0, 0, 0, 0],
    soldGoodsCount: 0,
    dice: [
      { value: 1, used: false },
      { value: 2, used: false },
    ],
    shipPosition: 0,
    orderStamp: 0,
    purchased: false,
    bonuses: [],
    scoreBreakdown: {
      animals: 0,
      regions: 0,
      phaseBonus: 0,
      colorBonus: 0,
      buildings: 0,
      goodsSales: 0,
      expansion: 0,
    },
    extension: {
      shields: [],
      shield16Used: false,
      tradeRoute: [],
      tradeRouteFilled: 0,
      tradeRouteGoods: [],
      borderConnections: [],
    },
  });
  const cell = board.cells.find((c) => c.id !== "0,0")!;
  const html = renderToStaticMarkup(
    createElement(BurgundyBoard, {
      player: p,
      selectedCell: null,
      selectedTile: { tileId: parse(TileIdSchema, "preview"), kind: "CASTLE" },
      legalCells: new Set([cell.id]),
      interactive: true,
      onCell() {},
      onInspect() {},
    }),
  );
  assert.equal((html.match(/class="bu-cell(?: |")/g) ?? []).length, 37);
  assert.match(html, /배치 가능/);
  assert.match(html, /영지 확대/);
  assert.match(html, /성/);
});
test("BURGUNDY audio tolerates unavailable Web Audio and never sounds on initial projection", () => {
  const audio = new BurgundyAudio(() => null);
  audio.unlock();
  audio.setVolume(0);
  audio.play(["PLACE"]);
  audio.dispose();
  assert.deepEqual(burgundySoundCues(null, null, "a"), []);
});
