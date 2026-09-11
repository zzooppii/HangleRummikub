import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "valibot";
import { SpyfallLobbyPlatformSnapshotV2Schema, SpyfallPlayingPlatformSnapshotV2Schema, SpyfallFinishedPlatformSnapshotV2Schema, PlayerIdSchema, GameRevisionSchema } from "@hangul-rummikub/shared";
import { SpyfallGameScreen } from "../features/spyfall/SpyfallGameScreen.js";
import { spyfallTransitionCue, SpyfallAudio, SPYFALL_SCORE } from "../features/spyfall/sound.js";
import { decodeWebSnapshot, type SpyfallWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const players = ["a", "b", "c"].map((playerId, i) => ({ playerId, nickname: ["하비", "민지", "준호"][i]!, isHost: i === 0, connectionStatus: "CONNECTED" }));
function lobby(n = 3) { return parse(SpyfallLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 1000, self: { playerId: "a" }, room: { roomId: "room", roomCode: "BCDFGH", gameType: "SPYFALL", phase: "LOBBY", players: players.slice(0, n), settings: { roundSeconds: 480, useRoles: true, locationPack: "ALL" } }, game: null }); }
function playing(stage = "REVEAL", spy = false) {
  const l = lobby(), { settings, ...room } = l.room, active = stage === "QUESTION" || stage === "ANSWER";
  return parse(SpyfallPlayingPlatformSnapshotV2Schema, { ...l, room: { ...room, phase: "PLAYING" }, game: { gameType: "SPYFALL", gameId: "spyfall-game", gameRevision: 0, rulesVersion: "spyfall-v1", settings,
    playerStates: players.map(p => ({ playerId: p.playerId, accusationUsed: false })), history: [], phase: "PLAYING", stage, phaseId: stage, deadlineAt: 31000, roundDeadlineAt: active ? 481000 : null, remainingMs: 480000,
    questionerId: stage === "ANSWER" ? "b" : "a", previousQuestionerId: null, respondentId: stage === "ANSWER" ? "a" : null,
    accuserId: stage === "ACCUSATION" ? "b" : null, suspectId: stage === "ACCUSATION" ? "c" : null, finalAccuserId: stage === "FINAL_ACCUSATION" ? "a" : null, revealedSpyId: stage === "GUESS" ? spy ? "a" : "c" : null,
    privateView: spy ? { playerId: "a", role: "SPY", vote: null } : { playerId: "a", role: "CITIZEN", location: "HOSPITAL", job: "비공개간호사", vote: null } } });
}
function render(s: SpyfallWebSnapshot, connected = true) { return renderToStaticMarkup(createElement(SpyfallGameScreen, { snapshot: s, connected, pending: false, error: null, connectionLabel: "접속 중", onCommand: async () => {}, onStart: () => {}, onLeave: () => {}, onCopy: () => {}, onRematch: () => {} })); }
test("SPYFALL catalog routes to real illustrated lobby with 3-player start and no readiness step", () => {
  for (const s of [lobby(), playing()]) { const d = decodeWebSnapshot(s); assert.equal(d.kind, "COMPATIBLE"); if (d.kind === "COMPATIBLE") assert.equal(resolveRoomSnapshotView(d.value).kind, "SPYFALL"); }
  assert.equal(getGameStartControl(lobby(2), false).canStart, false); assert.equal(getGameStartControl(lobby(), false).canStart, true);
  const html = render(lobby()); assert.match(html, /비밀 임무 배부하기/); assert.match(html, /spy-location-art/); assert.equal((html.match(/class="spy-location"/g) ?? []).length, 24); assert.doesNotMatch(html, /준비 완료/);
});
test("SPYFALL private card markup starts covered for both roles, with identical backs and no secret job", () => {
  const a = render(playing()), b = render(playing("REVEAL", true));
  assert.doesNotMatch(a, /비공개간호사/); assert.doesNotMatch(b, /당신은 스파이/); assert.match(a, /임무 카드 확인/);
  assert.equal((a.match(/spy-card-mark/g) ?? []).length, (b.match(/spy-card-mark/g) ?? []).length);
});
test("SPYFALL actions follow server actor, phase, locked ballot and connection", () => {
  assert.match(render(playing("ANSWER")), /답변 완료 · 다음은 내 질문/);
  const other = playing("ANSWER"); other.game.respondentId = parse(PlayerIdSchema, "c"); assert.doesNotMatch(render(other), /답변 완료 · 다음은 내 질문/);
  assert.match(render(playing("ANSWER"), false), /disabled=""[^>]*>답변 완료/);
  const voted = playing("ACCUSATION"); voted.game.privateView.vote = false; assert.match(render(voted), /내 투표: 반대/); assert.doesNotMatch(render(voted), />찬성 · 스파이 같아요/);
  assert.match(render(playing("GUESS", true)), /아래에서 장소를 선택하세요/); assert.doesNotMatch(render(playing("GUESS")), /아래에서 장소를 선택하세요/);
  assert.match(render(playing("FINAL_ACCUSATION")), /이번 지목 건너뛰기/);
});
test("SPYFALL malicious names are rejected and result includes location, spy, reason and rematch", () => {
  const p = playing();
  assert.throws(() => parse(SpyfallLobbyPlatformSnapshotV2Schema, { ...lobby(), room: { ...lobby().room, players: players.map((p,i) => ({ ...p, nickname: i === 1 ? "<script>" : p.nickname })) } }));
  const { stage: _stage, phaseId: _phase, deadlineAt: _deadline, roundDeadlineAt: _round, remainingMs: _remaining, questionerId: _q, previousQuestionerId: _previous, respondentId: _r, accuserId: _accuser, suspectId: _suspect, finalAccuserId: _final, revealedSpyId: _spy, privateView: _private, ...base } = p.game;
  const s = parse(SpyfallFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: "FINISHED" }, game: { ...base, phase: "FINISHED", result: { reason: "GUESS_WRONG", spyPlayerId: "b", winnerPlayerIds: ["a", "c"], location: "HOSPITAL", guess: "SCHOOL", voteRounds: [] } } });
  const html = render(s); assert.match(html, /스파이를 막아냈습니다/); assert.match(html, /병원/); assert.match(html, /학교/); assert.match(html, /같은 방에서 다시 하기/); assert.doesNotMatch(html, /<script>/); assert.match(html, /민지/);
});
test("SPYFALL audio is role-neutral, ignores duplicate/initial snapshots, and does not require audio hardware", () => {
  const before = playing().game, next = playing("QUESTION").game; next.gameRevision = parse(GameRevisionSchema, 1);
  assert.equal(spyfallTransitionCue(null, next, "a"), null); assert.equal(spyfallTransitionCue(before, next, "a"), "TURN");
  assert.equal(spyfallTransitionCue(before, next, "b"), null); assert.equal(spyfallTransitionCue(next, next, "a"), null);
  const vote = playing("ACCUSATION").game; vote.gameRevision = parse(GameRevisionSchema, 2); assert.equal(spyfallTransitionCue(next, vote, "a"), "VOTE");
  const audio = new SpyfallAudio(() => null); assert.doesNotThrow(() => { audio.unlock(); audio.play("CARD"); audio.setVolume(0); audio.play("WIN"); audio.dispose(); });
  const broken = new SpyfallAudio(() => { throw new Error("audio unavailable"); }); assert.doesNotThrow(() => broken.unlock());
  assert.ok(Object.values(SPYFALL_SCORE).every(score => score.every(n => n.duration < 1 && n.at < 1)));
});
