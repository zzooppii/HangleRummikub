import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "valibot";
import { LiarLobbyPlatformSnapshotV2Schema, LiarPlayingPlatformSnapshotV2Schema, LiarFinishedPlatformSnapshotV2Schema } from "@hangul-rummikub/shared";
import { LiarGameScreen } from "../features/liar-game/LiarGameScreen.js";
import { decodeWebSnapshot, type LiarWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
import { roomLeaveConfirmationMessage } from "./room-leave.js";
const players = ["a", "b", "c", "d"].map((playerId, i) => ({ playerId, nickname: ["하비", "민지", "준호", "수빈"][i]!, isHost: i === 0, connectionStatus: "CONNECTED" }));
function lobby(n = 4) { return parse(LiarLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 1000, self: { playerId: "a" }, room: { roomId: "room", roomCode: "BCDFGH", gameType: "LIAR_GAME", phase: "LOBBY", players: players.slice(0, n), settings: { category: "FOOD", discussionSeconds: 90 } }, game: null }); }
function playing(stage = "REVEAL", liar = false) {
  const l = lobby(), { settings, ...room } = l.room;
  return parse(LiarPlayingPlatformSnapshotV2Schema, { ...l, room: { ...room, phase: "PLAYING" }, game: { gameType: "LIAR_GAME", gameId: "liar-game", gameRevision: 0, rulesVersion: "liar-game-v1", settings, category: "FOOD", playerStates: players.map((p, i) => ({ playerId: p.playerId, clue: i === 0 ? null : "바삭해요", clueDone: i !== 0 })), messages: [], phase: "PLAYING", stage, phaseId: "phase", deadlineAt: 31000, activePlayerId: stage === "CLUE" || stage === "GUESS" ? "a" : null, voteCandidates: stage === "VOTE" ? players.map(p => p.playerId) : [], privateView: liar ? { playerId: "a", role: "LIAR", votedFor: null } : { playerId: "a", role: "CITIZEN", word: "비밀의피자", votedFor: null } } });
}
function render(s: LiarWebSnapshot, connected = true) { return renderToStaticMarkup(createElement(LiarGameScreen, { snapshot: s, connected, pending: false, error: null, connectionLabel: "접속 중", onCommand: async () => {}, onStart: () => {}, onLeave: () => {}, onCopy: () => {}, onRematch: () => {} })); }
test("LIAR catalog and strict decoder route to the actual game screen; minimum admission remains four", () => {
  for (const s of [lobby(), playing()]) { const decoded = decodeWebSnapshot(s); assert.equal(decoded.kind, "COMPATIBLE"); if (decoded.kind !== "COMPATIBLE") throw new Error(); assert.equal(resolveRoomSnapshotView(decoded.value).kind, "LIAR_GAME"); assert.match(render(s), /라이어게임/); }
  assert.equal(getGameStartControl(lobby(3), false).canStart, false); assert.equal(getGameStartControl(lobby(), false).canStart, true);
  assert.match(render(lobby()), /비밀 카드 나누기/); assert.doesNotMatch(render(lobby()), /준비 완료/);
});
test("LIAR private card is not rendered until deliberately revealed, and role does not change public card styles", () => {
  const citizen = render(playing()), liar = render(playing("REVEAL", true)); assert.doesNotMatch(citizen, /비밀의피자/); assert.doesNotMatch(liar, /당신은 라이어입니다/);
  assert.match(citizen, /눌러서 카드 확인/); assert.equal((citizen.match(/class="liar-seat/g) ?? []).length, (liar.match(/class="liar-seat/g) ?? []).length);
});
test("LIAR clue and guess input follow active actor and private role", () => {
  assert.match(render(playing("CLUE")), /id="liar-clue"/);
  const other = playing("CLUE"); other.game.activePlayerId = other.game.playerStates[1]!.playerId; assert.doesNotMatch(render(other), /id="liar-clue"/);
  assert.match(render(playing("GUESS", true)), /id="liar-guess"/); assert.doesNotMatch(render(playing("GUESS")), /id="liar-guess"/);
});
test("LIAR own locked vote replaces confirmation, disconnection disables submissions, and text is escaped", () => {
  const s = playing("VOTE"); s.game.privateView.votedFor = s.game.playerStates[1]!.playerId; assert.match(render(s), /투표를 마쳤습니다/); assert.doesNotMatch(render(s), /님에게 투표 확정/);
  assert.match(render(playing("CLUE"), false), /disabled=""[^>]*>설명 제출/);
  const chat = playing("DISCUSSION"); chat.game.messages.push({ playerId: chat.self.playerId, text: "<img src=x onerror=alert(1)>", at: chat.serverTime }); const html = render(chat);
  assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/); assert.match(roomLeaveConfirmationMessage("PLAYING", "LIAR_GAME"), /취소/);
});
test("LIAR result explains victory, reveals answers and provides same-room restart", () => {
  const p = playing(), { stage: _stage, phaseId: _phase, deadlineAt: _deadline, activePlayerId: _actor, voteCandidates: _targets, privateView: _private, ...base } = p.game;
  const s = parse(LiarFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: "FINISHED" }, game: { ...base, phase: "FINISHED", result: { reason: "GUESS_WRONG", liarPlayerId: "d", winnerPlayerIds: ["a", "b", "c"], word: "피자", guess: "치킨", voteRounds: [players.map(p => ({ playerId: p.playerId, votedFor: p.playerId === "d" ? "a" : "d" }))] } } });
  const html = render(s); assert.match(html, /시민 승리!/); assert.match(html, /피자/); assert.match(html, /치킨/); assert.match(html, /같은 방에서 다시 하기/);
});
