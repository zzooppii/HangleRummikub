import type { SneakyWebSnapshot } from "../../lib/snapshot-wire-decoder.js";
import type { LunchCue } from "./sound.js";
export type LunchFeedback = Readonly<{ id: string; cue: LunchCue; text: string; prominent: boolean; playerId?: string; biteDelta?: number }>;
export function deriveLunchFeedback(previous: SneakyWebSnapshot, next: SneakyWebSnapshot): LunchFeedback[] {
  const a = previous.game, b = next.game;
  if (!a || !b || a.gameId !== b.gameId || b.gameRevision <= a.gameRevision || previous.self.playerId !== next.self.playerId) return [];
  const events: LunchFeedback[] = [], self = next.self.playerId;
  const push = (cue: LunchCue, text: string, prominent = false) => events.push({ id: `${b.gameId}:${b.gameRevision}:${cue}:${events.length}`, cue, text, prominent });
  for (const player of b.playerStates) {
    const before = a.playerStates.find(p => p.playerId === player.playerId);
    if (!before || player.completedBites <= before.completedBites) continue;
    const box = Math.floor(player.completedBites / 30) > Math.floor(before.completedBites / 30);
    events.push({id:`${b.gameId}:${b.gameRevision}:eat:${player.playerId}`, cue:box ? "BOX" : "BITE", text:box ? "도시락 하나 클리어!" : "냠! 한입 성공", prominent:false, playerId:player.playerId, biteDelta:player.completedBites-before.completedBites});
  }
  for (const player of b.playerStates) if (player.status === "CAUGHT" && a.playerStates.find(p => p.playerId === player.playerId)?.status === "ACTIVE") {
    events.push({id:`${b.gameId}:${b.gameRevision}:caught:${player.playerId}`, cue:player.playerId === self ? "CAUGHT" : "WATCHING", text:player.playerId === self ? "들켰다! 선생님에게 도시락을 들켰어요." : `${next.room.players.find(p => p.playerId === player.playerId)?.nickname ?? "친구"}님이 들켰어요!`, prominent:player.playerId===self, playerId:player.playerId});
  }
  if (b.phase === "FINISHED" && a.phase !== "FINISHED") {
    push(b.result.reason === "TEACHER_WIN" ? "TEACHER_WIN" : b.result.winnerPlayerId === self ? "VICTORY" : "FINISH",
      b.result.reason === "TEACHER_WIN" ? "전원 적발! 점심시간까지 기다리세요!" : `${next.room.players.find(p => p.playerId === b.result.winnerPlayerId)?.nickname ?? "친구"}님 우승!`, true);
  } else if (b.phase === "CLASSROOM" && b.teacherStateRevision !== a.teacherStateRevision) {
    if (a.phase === "COUNTDOWN") push("START", "수업 시작! 몰래 한입 해볼까요?");
    else if (b.teacherState === "SUSPICIOUS") push("SUSPICIOUS", "쉿… 선생님이 움직여요.");
    else if (b.teacherState === "WATCHING") push("WATCHING", "멈춰! 선생님이 보고 있어요.");
    else if (b.teacherState === "BOARD" && a.phase === "CLASSROOM" && a.teacherState === "SUSPICIOUS") push("FAKE", "휴, 다시 칠판을 보네요.");
  }
  if(b.phase!=="FINISHED") for(const [i,id] of (b.placementOrder??[]).entries()) {
    if(!a.placementOrder?.includes(id)) push("BOX",`${next.room.players.find(p=>p.playerId===id)?.nickname??"친구"}님이 ${i+1}위를 확정했습니다!`,true);
  }
  return events;
}
/** One viewer/game baseline. Reconnection restores state without historical effects. */
export class LunchFeedbackTracker {
  private previous: SneakyWebSnapshot | null = null;
  private recovering = false;
  update(next: SneakyWebSnapshot, connected: boolean): LunchFeedback[] {
    if (!connected) { this.previous = next; this.recovering = true; return []; }
    if (this.recovering) {
      // The controller opens this gate only after resume/sync settles. Equal state is a valid baseline too.
      this.previous = next; this.recovering = false; return [];
    }
    const previous = this.previous;
    if (previous?.game && next.game && previous.game.gameId === next.game.gameId && next.game.gameRevision < previous.game.gameRevision) return [];
    this.previous = next;
    return previous ? deriveLunchFeedback(previous, next) : [];
  }
}
