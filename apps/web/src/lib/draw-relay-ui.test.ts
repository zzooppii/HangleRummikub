import { StateVersionsSchema } from "@hangul-rummikub/shared";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { parse, safeParse } from "valibot";
import { DrawRelayLobbyPlatformSnapshotV2Schema, DrawRelayPlayingPlatformSnapshotV2Schema, DrawRelayFinishedPlatformSnapshotV2Schema } from "@hangul-rummikub/shared";
import { DrawRelayScreen } from "../features/draw-relay/DrawRelayScreen.js";
import { appendStroke, BLANK_DRAWING, logicalPoint, undoStroke } from "../features/draw-relay/drawing.js";
import { RelayAudio, RELAY_CUES } from "../features/draw-relay/relay-sound.js";
import { decodeWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
import { projectRoomSnapshotShell } from "./room-snapshot-shell.js";
import { decideSnapshotUpdate } from "./snapshot-state.js";
const players = Array.from({ length: 3 }, (_, i) => ({ playerId: `relay-${i}`, nickname: `친구${i + 1}`, isHost: i === 0, connectionStatus: "CONNECTED" }));
const lobby = () => parse(DrawRelayLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, serverTime: 1000, versions: { roomRevision: 0, presenceVersion: 0 },
  room: { gameType: "DRAW_RELAY", roomId: "relay-room", roomCode: "BCDFGH", phase: "LOBBY", promptMode: "MIXED", players }, self: { playerId: "relay-0" }, game: null });
function playing(phase: "DRAW" | "GUESS" | "FINAL_GUESS" | "REVEAL" = "DRAW", submitted = false) {
  const l = lobby(), base = { gameType: "DRAW_RELAY", gameId: "relay-game", gameRevision: 1, rulesVersion: "draw-relay-rules-v1", promptsVersion: "draw-relay-prompts-v1",
    stageIndex: phase === "DRAW" ? 1 : 2, totalStages: 2, stageToken: "relay-stage", playerStates: players.map(p => ({ playerId: p.playerId, forfeited: false, submitted })) };
  const { promptMode: _mode, drawSeconds: _drawSeconds, ...room } = l.room;
  return parse(DrawRelayPlayingPlatformSnapshotV2Schema, { ...l, room: { ...room, phase: "PLAYING" }, game: { ...base, phase,
    ...(phase === "REVEAL" ? { reveal: { bookIndex: 0, pageIndex: -1 }, books: [{ ownerPlayerId: "relay-0", initialPrompt: null, pages: [] }] }
      : { deadlineAt: 91000, privateState: { draft: BLANK_DRAWING, draftRevision: 0, submitted, source: phase === "DRAW" ? { kind: "TEXT", text: "하늘을 나는 고양이" } : { kind: "DRAWING", drawing: BLANK_DRAWING } } }) } });
}
function html(snapshot: Parameters<typeof DrawRelayScreen>[0]["snapshot"]) {
  return renderToStaticMarkup(createElement(DrawRelayScreen, { snapshot, connected: true, pending: false, error: null, connectionLabel: "연결됨",
    onCommand: async () => undefined, onCopy() {}, onLeave() {}, onStart() {} }));
}
test("DRAW Lobby 3–8 and prompt mode, host-only start", () => {
  const s = lobby(); assert.equal(getGameStartControl(s, false).canStart, true);
  assert.equal(getGameStartControl({ ...s, room: { ...s.room, players: s.room.players.slice(0, 2) } }, false).canStart, false);
  assert.match(html(s), /제시어 난이도|쉬움|혼합|그림책 만들기 시작/);
  assert.doesNotMatch(html({ ...s, self: { playerId: s.room.players[1]!.playerId } }), /그림책 만들기 시작/);
});
test("DRAW duration selector offers five choices and guide uses current setting", () => {
  const s = lobby(), selected = { ...s, room: { ...s.room, drawSeconds: 30 as const } };
  const output = html(selected);
  assert.match(output, /aria-label="그리기 시간"/);
  assert.match(output, /60초 · 기본/); assert.doesNotMatch(output, /90초 · 기본/);
  for (const seconds of [15, 30, 45, 60, 90]) assert.ok(output.includes(`value="${seconds}"`));
  assert.match(output, /30초 동안/); assert.doesNotMatch(output, /90초 동안/);
  const other = html({ ...selected, self: { playerId: s.room.players[1]!.playerId } });
  assert.match(other, /aria-label="그리기 시간" disabled=""/);
  const active = playing(); assert.match(html({ ...active, game: { ...active.game, drawSeconds: 15 } }), /15초 동안/);
});
test("DRAW decoder routes exact concrete game and keeps rematch game identity", () => {
  const decoded = decodeWebSnapshot(lobby()); assert.equal(decoded.kind, "COMPATIBLE"); if (decoded.kind !== "COMPATIBLE") return;
  assert.equal(resolveRoomSnapshotView(decoded.value).kind, "DRAW_RELAY"); assert.equal(projectRoomSnapshotShell(decoded.value).gameId, null);
  assert.equal(decideSnapshotUpdate({ gameId: "old", versions: parse(StateVersionsSchema, { roomRevision: 10, gameRevision: 50, presenceVersion: 1 }), room: { roomId: "r", gameType: "DRAW_RELAY" }, self: { playerId: "p" } },
    { gameId: null, versions: parse(StateVersionsSchema, { roomRevision: 11, gameRevision: null, presenceVersion: 1 }), room: { roomId: "r", gameType: "DRAW_RELAY" }, self: { playerId: "p" } }), "APPLY");
});
test("DRAW canvas tools, save status, own source and submitted waiting", () => {
  const output = html(playing()); for (const text of ["그림 그리기 영역", "하늘을 나는 고양이", "지우개", "되돌리기", "모두 지우기", "저장됨", "그림 제출"]) assert.ok(output.includes(text));
  const waiting = html(playing("DRAW", true)); assert.match(waiting, /제출 완료!|다른 참가자/); assert.doesNotMatch(waiting, /그림 그리기 영역|그림 제출/);
});
test("DRAW focus-mode entry is available only to the unsubmitted drawing editor", () => {
  const drawing = html(playing());
  assert.match(drawing, /그림 크게 그리기/);
  assert.equal((drawing.match(/aria-label="그림 그리기 영역"/g) ?? []).length, 1);
  assert.doesNotMatch(html(playing("DRAW", true)), /그림 크게 그리기/);
  assert.doesNotMatch(html(playing("GUESS")), /그림 크게 그리기/);
  const css = readFileSync(new URL("../../src/features/draw-relay/draw-relay.css", import.meta.url), "utf8");
  assert.match(css, /relay-studio-focused\{position:fixed/);
  assert.match(css, /height:100dvh/); assert.match(css, /container-type:size/);
  assert.match(css, /100cqh \* 10 \/ 7/); assert.match(css, /overscroll-behavior:none/);
  assert.match(css, /relay-tools\{[^}]*overflow-x:auto/);
});
test("GUESS only displays previous drawing, never prompt/history; Reveal prefix rejects future page", () => {
  const guess = html(playing("GUESS")); assert.match(guess, /이 그림은 무엇일까요|추측 제출/); assert.doesNotMatch(guess, /하늘을 나는 고양이/);
  const reveal = playing("REVEAL"); assert.match(html(reveal), /다음 페이지 공개/);
  assert.equal(safeParse(DrawRelayPlayingPlatformSnapshotV2Schema, { ...reveal, game: { ...reveal.game, books: [{ ownerPlayerId: "relay-0", initialPrompt: "future-secret", pages: [] }] } }).success, false);
});
test("DRAW Finished recap has no score/winner and offers host rematch", () => {
  const r = playing("REVEAL");
  const finished = parse(DrawRelayFinishedPlatformSnapshotV2Schema, { ...r, room: { ...r.room, phase: "FINISHED" }, game: { ...r.game, phase: "FINISHED", reveal: { bookIndex: 2, pageIndex: 2 },
    books: players.map(p => ({ ownerPlayerId: p.playerId, initialPrompt: "고양이", pages: [{ kind: "DRAWING", authorPlayerId: p.playerId, timedOut: false, drawing: BLANK_DRAWING }, { kind: "GUESS", authorPlayerId: p.playerId, timedOut: false, text: "호랑이" }] })) } });
  assert.match(html(finished), /대기실로 돌아가기|처음에는|마지막에는/); assert.doesNotMatch(html(finished), /우승|승점|1위/);
});
test("DRAW pointer coordinate clamp, append/undo immutable, limits", () => {
  assert.deepEqual(logicalPoint(-10, 900, { left: 0, top: 0, width: 500, height: 350 }), { x: 0, y: 700 });
  const stroke = { strokeId: "s", tool: "PEN" as const, color: "#202838" as const, width: 4 as const, points: [{ x: 10, y: 20 }] };
  const drawing = appendStroke(BLANK_DRAWING, stroke); assert.equal(BLANK_DRAWING.strokes.length, 0); assert.equal(drawing.strokes.length, 1); assert.deepEqual(undoStroke(drawing), BLANK_DRAWING);
  const full = { strokes: Array.from({ length: 250 }, (_, i) => ({ ...stroke, strokeId: String(i) })) }; assert.equal(appendStroke(full, stroke), full);
});
test("DRAW original short sound palette, OFF safe and no browser required", () => {
  assert.equal(Object.keys(RELAY_CUES).length, 7); const audio = new RelayAudio(); audio.enabled = false; audio.unlock(); audio.play("FINISH"); audio.close();
});
test("DRAW scoped responsive/reduced motion and canvas-only touch prevention", () => {
  const css = readFileSync(new URL("../../src/features/draw-relay/draw-relay.css", import.meta.url), "utf8");
  assert.match(css, /max-width:768px/); assert.match(css, /max-width:430px/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.relay-canvas\.editable\{touch-action:none/); assert.doesNotMatch(css, /body\s*\{/);
});
