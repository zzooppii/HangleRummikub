import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { SneakyLobbyPlatformSnapshotV2Schema, SneakyPlayingPlatformSnapshotV2Schema, SneakyFinishedPlatformSnapshotV2Schema } from "@hangul-rummikub/shared";
import { SneakyLunchScreen, canEat, remainingFood } from "../features/sneaky-lunch/SneakyLunchScreen.js";
import { LunchAudio, LUNCH_CUES } from "../features/sneaky-lunch/sound.js";
import { LunchFeedbackTracker, deriveLunchFeedback } from "../features/sneaky-lunch/feedback.js";
import { StudentArt } from "../features/sneaky-lunch/art.js";
import { decodeWebSnapshot, type SneakyWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { projectRoomSnapshotShell } from "./room-snapshot-shell.js";
import { decideSnapshotUpdate } from "./snapshot-state.js";
import { getGameStartControl } from "./game-start.js";

const players = Array.from({ length: 8 }, (_, i) => ({ playerId: `lunch-${i}`, nickname: `친구${i + 1}`, isHost: i === 0, connectionStatus: "CONNECTED" }));
function lobby(count = 2) { return parse(SneakyLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, serverTime: 1000, versions: { roomRevision: 0, presenceVersion: 0 }, room: {
  roomId: "lunch-room", roomCode: "BCDFGH", phase: "LOBBY", gameType: "SNEAKY_LUNCH", players: players.slice(0, count), settings: { lunchboxCount: 3, difficulty: "NORMAL" } }, self: { playerId: "lunch-0" }, game: null }); }
function playing(teacherState = "BOARD", bites = 0, revision = 1) {
  const l = lobby(), { settings, ...room } = l.room;
  return parse(SneakyPlayingPlatformSnapshotV2Schema, { ...l, versions: { ...l.versions, roomRevision: 1 }, room: { ...room, phase: "PLAYING" }, game: {
    gameType: "SNEAKY_LUNCH", gameId: "lunch-game", gameRevision: revision, rulesVersion: "sneaky-lunch-rules-v1", settings, requiredBites: 90,
    phase: "CLASSROOM", teacherState, teacherStateRevision: revision, playerStates: room.players.map((p, i) => ({ playerId: p.playerId, status: "ACTIVE", completedBites: i === 0 ? bites : 0 })) } });
}
function html(snapshot: SneakyWebSnapshot, connected = true) { return renderToStaticMarkup(createElement(SneakyLunchScreen, { snapshot, connected, pending: false, error: null, connectionLabel: "연결됨", onCommand: async () => undefined, onStart() {}, onLeave() {}, onCopy() {} })); }
function shell(snapshot: SneakyWebSnapshot) { const d = decodeWebSnapshot(snapshot); assert.equal(d.kind, "COMPATIBLE"); if (d.kind !== "COMPATIBLE") throw new Error("invalid fixture"); return projectRoomSnapshotShell(d.value); }

test("SNEAKY concrete Home decoder, 2–8 Host start and five box/four difficulty controls", () => {
  for (const n of [2, 3, 4, 6, 8]) assert.equal(getGameStartControl(lobby(n), false).canStart, true);
  assert.equal(getGameStartControl(lobby(1), false).canStart, false);
  const d = decodeWebSnapshot(lobby()); assert.equal(d.kind, "COMPATIBLE"); if (d.kind === "COMPATIBLE") assert.equal(resolveRoomSnapshotView(d.value).kind, "SNEAKY_LUNCH");
  const output = html(lobby()); for (const count of [1, 2, 3, 4, 5]) assert.ok(output.includes(`도시락 ${count}개`));
  for (const mode of ["EASY", "NORMAL", "HARD", "NIGHTMARE"]) assert.ok(output.includes(`value="${mode}"`));
  assert.match(output, /쉿! 수업 시작/); assert.match(html({ ...lobby(), self: { playerId: lobby().room.players[1]!.playerId } }), /fieldset disabled/);
});
test("SNEAKY danger input stays enabled for active players; catch/spectator/disconnect block input", () => {
  for (const state of ["BOARD", "SUSPICIOUS", "WATCHING", "RETURNING"]) assert.equal(canEat(playing(state), true), true);
  assert.match(html(playing("WATCHING")), /aria-label="멈춰! 누르면 들켜요"/);
  assert.equal(canEat(playing(), false), false); assert.equal(canEat(playing(), true, true), false);
  const p = playing(), caught = { ...p, game: { ...p.game, playerStates: p.game.playerStates.map((v, i) => i === 0 ? { ...v, status: "CAUGHT" as const } : v) } };
  assert.equal(canEat(caught, true), false); assert.match(html(caught), /들켰습니다!|관전 중/);
  assert.match(html(caught), /class="lunch-eat-button" disabled/);
});
test("SNEAKY food depletes, refills only next box; no visible numeric bite counters", () => {
  assert.equal(remainingFood(0, 90), 1); assert.equal(remainingFood(15, 90), .5); assert.equal(remainingFood(30, 90), 1); assert.equal(remainingFood(90, 90), 0);
  const output = html(playing("BOARD", 17)); assert.match(output, /lunch-food|완식 진행|내 도시락과 먹기/);
  assert.doesNotMatch(output, /17\s*\/\s*30|90회|17회|클릭 수|score|plannedOutcome|nextTransitionAt|seed/);
});
test("SNEAKY eight seats have distinct original visual identities", () => {
  const scenes = players.map((_, seat) => renderToStaticMarkup(createElement(StudentArt, { seat })));
  assert.equal(new Set(scenes).size, 8); for (const scene of scenes) assert.match(scene, /svg/);
});
test("SNEAKY canonical bite/box/teacher/catch cues never fire for unchanged or stale ACK", () => {
  const a = playing(), b = playing("BOARD", 1, 2);
  assert.deepEqual(deriveLunchFeedback(a, a), []); assert.equal(deriveLunchFeedback(a, b)[0]?.cue, "BITE");
  assert.equal(deriveLunchFeedback(playing("BOARD", 29), playing("BOARD", 30, 2))[0]?.cue, "BOX");
  assert.equal(deriveLunchFeedback(a, playing("SUSPICIOUS", 0, 2))[0]?.cue, "SUSPICIOUS");
  assert.equal(deriveLunchFeedback(playing("SUSPICIOUS"), playing("BOARD", 0, 2))[0]?.cue, "FAKE");
  const caught = { ...b, game: { ...b.game, playerStates: b.game.playerStates.map((p, i) => i === 0 ? { ...p, status: "CAUGHT" as const } : p) } };
  assert.ok(deriveLunchFeedback(b, { ...caught, game: { ...caught.game, gameRevision: playing("BOARD", 1, 3).game.gameRevision } }).some(e => e.cue === "CAUGHT"));
});
test("SNEAKY feedback exact once, no refresh/reconnect history or cross-game replay", () => {
  const tracker = new LunchFeedbackTracker(), a = playing(), b = playing("BOARD", 1, 2), c = playing("BOARD", 2, 3);
  assert.deepEqual(tracker.update(a, true), []); assert.equal(tracker.update(b, true).length, 1); assert.deepEqual(tracker.update(b, true), []);
  assert.deepEqual(tracker.update(a, true), []); assert.deepEqual(tracker.update(b, true), []);
  tracker.update(b, false); assert.deepEqual(tracker.update(b, true), []); assert.equal(tracker.update(c, true).length, 1);
  tracker.update(c, false); assert.deepEqual(tracker.update({ ...c }, true), []);
  assert.equal(tracker.update(playing("BOARD", 3, 4), true).length, 1);
  assert.deepEqual(new LunchFeedbackTracker().update(c, true), []); assert.deepEqual(tracker.update(lobby(), true), []);
});
test("SNEAKY Finished exact winner/teacher result and host-only same-room rematch", () => {
  const p = playing(); const { teacherState: _teacher, ...base } = p.game.phase === "CLASSROOM" ? p.game : { ...p.game, teacherState: null };
  const win = parse(SneakyFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: "FINISHED" }, game: { ...base, phase: "FINISHED",
    gameRevision: 10, result: { reason: "PLAYER_FINISHED", winnerPlayerId: "lunch-0" }, playerStates: p.game.playerStates.map((v, i) => ({ ...v, completedBites: i === 0 ? 90 : 0 })) } });
  assert.match(html(win), /친구1님 완식 성공!|같은 방에서 다시 하기/); assert.doesNotMatch(html({ ...win, self: { playerId: win.room.players[1]!.playerId } }), /같은 방에서 다시 하기/);
  assert.ok(deriveLunchFeedback(p, win).some(e => e.cue === "VICTORY"));
  const lose = parse(SneakyFinishedPlatformSnapshotV2Schema, { ...win, game: { ...win.game, result: { reason: "TEACHER_WIN", winnerPlayerId: null }, playerStates: win.game.playerStates.map(v => ({ ...v, status: "CAUGHT", completedBites: 0 })) } });
  assert.match(html(lose), /전원 적발!|점심시간까지/); assert.ok(deriveLunchFeedback(p, lose).some(e => e.cue === "TEACHER_WIN"));
});
test("SNEAKY rematch new scope wins over old high game revision", () => {
  const old = shell(playing("BOARD", 20, 99)), next = shell(parse(SneakyLobbyPlatformSnapshotV2Schema, { ...lobby(), versions: { ...lobby().versions, roomRevision: 2 } }));
  assert.equal(decideSnapshotUpdate(old, next), "APPLY"); assert.equal(decideSnapshotUpdate(next, old), "IGNORE_STALE");
});
test("SNEAKY strict snapshot rejects future schedule/outcome even in debug-shaped fields", () => {
  const p = playing(); for (const secret of ["nextTransitionAt", "plannedOutcome", "seed", "pattern"]) assert.equal(safeParse(SneakyPlayingPlatformSnapshotV2Schema, { ...p, game: { ...p.game, [secret]: 42 } }).success, false);
});
test("SNEAKY original short sound families and OFF require no audio engine", () => {
  const audio = new LunchAudio(); audio.enabled = false; audio.unlock(); for (const key of Object.keys(LUNCH_CUES)) assert.ok(key.length > 0);
  audio.play("CAUGHT"); audio.play("BITE"); audio.close(); assert.equal(Object.keys(LUNCH_CUES).length, 10);
});
test("SNEAKY mobile teacher visibility, safe-area dock, reduced motion and original five-step help", () => {
  const css = readFileSync(new URL("../../src/features/sneaky-lunch/sneaky-lunch.css", import.meta.url), "utf8"), source = readFileSync(new URL("../../src/features/sneaky-lunch/SneakyLunchScreen.tsx", import.meta.url), "utf8");
  for (const text of ["max-width:768px", "max-width:430px", "max-width:340px", "safe-area-inset-bottom", "prefers-reduced-motion", "position:sticky", "touch-action:manipulation", "focus-visible"]) assert.ok(css.includes(text));
  assert.match(source, /showModal\(\)/); assert.match(source, /step === 4/); assert.match(source, /2000/); assert.doesNotMatch(source, /onMouseDown=|setInterval\(.*eat/);
});
