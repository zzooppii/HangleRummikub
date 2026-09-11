import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import {
  SplendorLobbyPlatformSnapshotV2Schema,
  SplendorPlayingPlatformSnapshotV2Schema,
  SplendorFinishedPlatformSnapshotV2Schema,
  SPLENDOR_CITY_TILES,
  SplendorCardSchema,
  SplendorClientCommandSchema,
} from "@hangul-rummikub/shared";
import { SplendorScreen } from "../features/splendor/SplendorScreen.js";
import {
  cityRemaining,
  cityLabel,
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


test("SPLENDOR CITIES lobby presents graphical host edition selection and guests see the selected mode", () => {
  const host = lobby(); host.room.settings = {mode:"CITIES"};
  const hostHtml = render(host);
  assert.match(hostHtml,/sp-edition-picker/); assert.match(hostHtml,/도시 확장/);
  assert.match(hostHtml,/aria-pressed="true"/);
  const guest = {...host,self:{playerId:host.room.players[1]!.playerId}};
  const guestHtml = render(guest);
  assert.match(guestHtml,/방장이 선택한 여정/);
  assert.match(guestHtml,/disabled="" aria-pressed|aria-pressed="true" disabled=""/);
});
test("SPLENDOR CITIES swaps noble strip while preserving twelve illustrated cards, bank and company", () => {
  const s = playing();
  s.game.rulesVersion = "splendor-cities-2017-v1";
  s.game.cities = [SPLENDOR_CITY_TILES[0]![0]!, SPLENDOR_CITY_TILES[4]![0]!, SPLENDOR_CITY_TILES[5]![0]!];
  assert.equal(decodeWebSnapshot(s).kind,"COMPATIBLE");
  const html = render(s);
  assert.match(html,/도시의 부름/); assert.match(html,/sp-city-progress/);
  assert.match(html,/같은 색/); assert.match(html,/도시 목표/);
  assert.equal((html.match(/class="sp-development/g)??[]).length,12);
  assert.match(html,/id="sp-bank"/); assert.match(html,/id="sp-company"/);
  assert.doesNotMatch(html,/귀족의 후원/); assert.doesNotMatch(html,/<small>\/ 15<\/small>/);
  const base = render(playing()); assert.match(base,/귀족의 후원/); assert.doesNotMatch(base,/class="sp-cities"/);
});
test("SPLENDOR CITIES UI counts bonus shortage without reusing the fixed color for a gray requirement", () => {
  const city = SPLENDOR_CITY_TILES[5]![0]!;
  assert.deepEqual(cityRemaining(city,10,{WHITE:2,BLUE:1,GREEN:8,RED:0,BLACK:0}),{points:4,cards:2});
  assert.match(cityLabel(city),/지정 색 이외의 한 가지 색/);
});
test("SPLENDOR CITIES wire rejects changed objective data, both faces, nobles and wrong-mode winners", () => {
  const s = playing(); s.game.rulesVersion="splendor-cities-2017-v1";
  s.game.cities=[SPLENDOR_CITY_TILES[0]![0]!,SPLENDOR_CITY_TILES[1]![0]!,SPLENDOR_CITY_TILES[2]![0]!];
  assert.equal(safeParse(SplendorPlayingPlatformSnapshotV2Schema,s).success,true);
  const bad = structuredClone(s); bad.game.cities[0]!.points--;
  assert.equal(safeParse(SplendorPlayingPlatformSnapshotV2Schema,bad).success,false);
  const duplicate = structuredClone(s); duplicate.game.cities[1]=SPLENDOR_CITY_TILES[0]![1]!;
  assert.equal(safeParse(SplendorPlayingPlatformSnapshotV2Schema,duplicate).success,false);
  const base = structuredClone(s); base.game.rulesVersion="splendor-base-v1";
  assert.equal(safeParse(SplendorPlayingPlatformSnapshotV2Schema,base).success,false);
  const stolen = structuredClone(s); stolen.game.playerStates[0]!.cities.push(stolen.game.cities.shift()!); stolen.game.finalRound=true;
  assert.equal(safeParse(SplendorPlayingPlatformSnapshotV2Schema,stolen).success,false);
  assert.equal(safeParse(SplendorClientCommandSchema,{kind:"splendor:configure",protocolVersion:1,requestId:"configure-city",expectedRoomRevision:0,payload:{mode:"CITIES"}}).success,true);
  assert.equal(safeParse(SplendorClientCommandSchema,{kind:"splendor:configure",protocolVersion:1,requestId:"configure-city",expectedRoomRevision:0,payload:{mode:"ORIENT"}}).success,false);
});

test("SPLENDOR collapsed opponents show all six held tokens separately from discounts", () => {
  const s = playing(), opponent = s.game.playerStates[1]!;
  opponent.tokens = {...zeroTokens(), WHITE:2, RED:3, GOLD:1};
  opponent.bonuses = {...opponent.bonuses, WHITE:4};
  const html = render(s);
  const summary = html.match(/<summary>[\s\S]*?<\/summary>/)?.[0];
  assert.ok(summary);
  assert.match(summary,/상인1 보유 토큰/);
  assert.match(summary,/다이아몬드 2/);
  assert.match(summary,/루비 3/);
  assert.match(summary,/황금 1/);
  assert.doesNotMatch(summary,/다이아몬드 4/);
  assert.match(html,/상인1 영구 할인/);
  assert.match(html,/할인 0/);
  assert.doesNotMatch(html,/▱ 0/);
});
test("SPLENDOR latest action shows gained, spent and returned token colors and counts", () => {
  const s=playing();
  s.game.feedback={playerId:s.game.playerStates[1]!.playerId,kind:"TAKE",at:s.serverTime,points:0,
    tokenMovement:{gained:{...zeroTokens(),RED:2},spent:zeroTokens(),returned:{...zeroTokens(),BLUE:1}}};
  const html=render(s);
  assert.match(html,/최근 행동의 토큰 변화/);
  assert.match(html,/aria-label="가져옴"/);
  assert.match(html,/루비 \+2/);
  assert.match(html,/aria-label="반환"/);
  assert.match(html,/사파이어 1/);
  assert.doesNotMatch(html,/aria-label="사용"/);
});
