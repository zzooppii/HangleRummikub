import type { SpaceCrewAction, SpaceCrewProjection } from "@hangul-rummikub/shared";
import { getSpaceCrewMissionCommunication, getSpaceCrewMissionCopy } from "./mission-copy.js";

type CommunicationOption = Readonly<{ cardId: string; mark: "ONLY" | "HIGHEST" | "LOWEST" | null }>;
const self = (game: SpaceCrewProjection) => game.privateState.playerId;
const live = (game: SpaceCrewProjection) => game.phase === "PLAYING" && game.gameRevision < Number.MAX_SAFE_INTEGER;
const distressPending = (game: SpaceCrewProjection) => game.distress.phase === "VOTING" || game.distress.phase === "SELECTING";
const ready = (game: SpaceCrewProjection) => game.missionStatus === "ACTIVE" && game.tasks.phase === "READY"
  && (game.special.kind === "NONE" || game.special.phase === "READY");
const beforeFirst = (game: SpaceCrewProjection) => game.trickPhase === "BETWEEN_TRICKS" && game.completedTrickCount === 0 && game.currentTrick.length === 0;
function seatAfterCommander(game: SpaceCrewProjection, offset: number) {
  const index = game.playerStates.findIndex(player => player.playerId === game.commanderId);
  return game.playerStates[(index + offset) % game.playerStates.length]?.playerId;
}

/** UI affordances inspect only the viewer's hand; the server validates every action again. */
export function getSpaceCrewPlayableCardIds(game: SpaceCrewProjection): readonly string[] {
  if (!live(game) || !ready(game) || distressPending(game) || game.activePlayerId !== self(game) || game.trickPhase === "EXHAUSTED") return [];
  const hand = game.privateState.hand, lead = game.currentTrick[0]?.card;
  const follows = lead ? hand.filter(card => card.suit === lead.suit) : [];
  return (follows.length ? follows : hand).map(card => card.cardId);
}

export function getSpaceCrewCommunicationOptions(game: SpaceCrewProjection): readonly CommunicationOption[] {
  if (!live(game) || !ready(game) || distressPending(game) || game.trickPhase !== "BETWEEN_TRICKS"
    || game.communications.find(item => item.playerId === self(game))?.used !== false) return [];
  const rule = getSpaceCrewMissionCommunication(game.missionNumber);
  if (rule.kind === "DISRUPTION" && game.completedTrickCount + 1 < rule.fromTrick
    || rule.kind === "NOMINEE_FORBIDDEN" && game.special.kind === "NO_COMMUNICATION_PLAYER" && game.special.playerId === self(game)) return [];
  const options: CommunicationOption[] = [];
  for (const card of game.privateState.hand) {
    if (card.kind !== "COLOR") continue;
    const suit = game.privateState.hand.filter(other => other.suit === card.suit);
    const mark = suit.length === 1 ? "ONLY" : suit.every(other => other.value <= card.value) ? "HIGHEST"
      : suit.every(other => other.value >= card.value) ? "LOWEST" : null;
    if (mark) options.push({ cardId: card.cardId, mark: rule.kind === "DEAD_ZONE" ? null : mark });
  }
  return options;
}

function distributionAllows(game: SpaceCrewProjection, recipient: string): boolean {
  const counts = game.playerStates.map(player => game.tasks.visibleTasks.filter(task => task.ownerId === player.playerId).length + Number(player.playerId === recipient));
  const remaining = game.tasks.totalCount - counts.reduce((sum, count) => sum + count, 0);
  const floor = Math.floor(game.tasks.totalCount / counts.length), ceiling = Math.ceil(game.tasks.totalCount / counts.length);
  return remaining >= 0 && counts.every(count => count <= ceiling) && counts.reduce((sum, count) => sum + Math.max(0, floor - count), 0) <= remaining;
}
function taskActions(game: SpaceCrewProjection): SpaceCrewAction[] {
  if (!beforeFirst(game) || distressPending(game)) return [];
  const tasks = game.tasks, actor = self(game), actions: SpaceCrewAction[] = [];
  if (tasks.phase === "CHOOSE" && tasks.activePlayerId === actor) {
    for (const task of tasks.visibleTasks) if (task.ownerId === null) actions.push({ kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  if (tasks.phase === "RESPOND" && tasks.activePlayerId === actor) {
    for (const answer of [true, false]) actions.push({ kind: "TASK", action: { kind: "RESPOND", taskId: tasks.promptTaskId, answer } });
  }
  if (tasks.phase === "ASSIGN" && actor === game.commanderId) {
    for (const player of game.playerStates) {
      if (tasks.mode === "COMMANDER_DECISION" && player.playerId === game.commanderId
        || tasks.mode === "COMMANDER_DISTRIBUTION" && !distributionAllows(game, player.playerId)) continue;
      actions.push({ kind: "TASK", action: { kind: "ASSIGN", taskId: tasks.promptTaskId, toPlayerId: player.playerId } });
    }
  }
  if (tasks.phase === "READY" && tasks.transfer === null && game.playerStates.length === 5 && getSpaceCrewMissionCopy(game.missionNumber).fivePlayerTransfer) {
    for (const task of tasks.visibleTasks) if (task.ownerId === actor) {
      for (const player of game.playerStates) if (player.playerId !== actor) actions.push({ kind: "TASK", action: { kind: "TRANSFER", taskId: task.id, toPlayerId: player.playerId } });
    }
  }
  if (tasks.phase === "CHOOSE" && actor === game.commanderId && !tasks.tokenEditUsed && tasks.visibleTasks.every(task => task.ownerId === null)) {
    for (const [index, from] of tasks.visibleTasks.entries()) {
      if (!from.token) continue;
      if (game.missionNumber === 23) {
        for (const to of tasks.visibleTasks.slice(index + 1)) if (to.token) actions.push({ kind: "TASK", action: { kind: "SWAP_TOKENS", firstTaskId: from.id, secondTaskId: to.id } });
      } else if (game.missionNumber === 40) {
        for (const to of tasks.visibleTasks) if (to.token === null) actions.push({ kind: "TASK", action: { kind: "MOVE_TOKEN", fromTaskId: from.id, toTaskId: to.id } });
      }
    }
  }
  return actions;
}
function distressActions(game: SpaceCrewProjection): SpaceCrewAction[] {
  if (!ready(game) || !beforeFirst(game) || game.communications.some(item => item.used)) return [];
  const distress = game.distress, actor = self(game);
  const actions: SpaceCrewAction[] = [];
  if (distress.phase === "UNDECIDED" || distress.phase === "SKIPPED") {
    for (const direction of ["LEFT", "RIGHT"] as const) actions.push({ kind: "DISTRESS", action: { kind: "PROPOSE", direction } });
  }
  if (distress.phase === "UNDECIDED") actions.push({ kind: "DISTRESS", action: { kind: "SKIP" } });
  if (distress.phase === "VOTING" && !distress.votes.some(vote => vote.playerId === actor)) {
    for (const accept of [true, false]) actions.push({ kind: "DISTRESS", action: { kind: "VOTE", accept } });
  }
  if (distress.phase === "SELECTING" && !distress.selectedPlayerIds.includes(actor)) {
    for (const card of game.privateState.hand) if (card.kind === "COLOR") actions.push({ kind: "DISTRESS", action: { kind: "SELECT", cardId: card.cardId } });
  }
  return actions;
}
function specialActions(game: SpaceCrewProjection): SpaceCrewAction[] {
  const special = game.special, actor = self(game), actions: SpaceCrewAction[] = [];
  if (special.kind === "NONE" || special.phase === "READY") return actions;
  if (special.kind === "FINAL_ROLES") {
    if (special.phase === "PREFERENCES" && actor === seatAfterCommander(game, special.preferences.length)) {
      for (const preference of ["FIRST_FOUR", "MIDDLE", "LAST"] as const) actions.push({ kind: "SPECIAL_PREFERENCE", preference });
    }
    if (special.phase === "PROPOSE") {
      for (const first of game.playerStates) for (const last of game.playerStates) if (first.playerId !== last.playerId) {
        actions.push({ kind: "SPECIAL_PROPOSE_ROLES", firstFourPlayerId: first.playerId, lastPlayerId: last.playerId });
      }
    }
    if (special.phase === "VOTE" && !special.votes.some(vote => vote.playerId === actor)) {
      for (const accept of [true, false]) actions.push({ kind: "SPECIAL_VOTE_ROLES", accept });
    }
  } else if (special.phase === "RESPOND") {
    if (actor === seatAfterCommander(game, special.responses.length + 1)) {
      const answers = special.kind === "NO_TRICKS_PLAYER" ? ["GOOD", "BAD"] as const : [true, false];
      for (const answer of answers) actions.push({ kind: "SPECIAL_RESPOND", answer });
    }
  } else if (special.phase === "SELECT" && actor === game.commanderId) {
    for (const player of game.playerStates) {
      if (special.kind === "LIMITED_TRICKS_PLAYER" && player.playerId === game.commanderId) continue;
      actions.push({ kind: "SPECIAL_SELECT", playerId: player.playerId });
    }
  }
  return actions;
}

/** Finite choices only; this does not rank cards, infer other hands, or recommend a strategy. */
export function getSpaceCrewAvailableActions(game: SpaceCrewProjection): readonly SpaceCrewAction[] {
  if (!live(game)) return [];
  return [
    ...getSpaceCrewPlayableCardIds(game).map((cardId): SpaceCrewAction => ({ kind: "PLAY", cardId })),
    ...getSpaceCrewCommunicationOptions(game).map((option): SpaceCrewAction => ({ kind: "COMMUNICATE", ...option })),
    ...taskActions(game), ...specialActions(game), ...distressActions(game),
  ];
}

export function getSpaceCrewActionPrompt(game: SpaceCrewProjection): string {
  if (game.phase === "FINISHED") return game.result.outcome === "SUCCESS" ? "미션 성공" : "이번 시도 종료";
  if (game.distress.phase === "VOTING") return game.distress.votes.some(vote => vote.playerId === self(game)) ? "구조 신호 투표를 기다립니다." : "구조 신호 사용에 동의할지 선택하세요.";
  if (game.distress.phase === "SELECTING") return game.distress.selectedPlayerIds.includes(self(game)) ? "모두의 카드 선택을 기다립니다." : "구조 신호로 전달할 색상 카드 한 장을 선택하세요.";
  const special = game.special;
  if (special.kind !== "NONE" && special.phase !== "READY") {
    if (special.kind === "FINAL_ROLES") return special.phase === "PREFERENCES" ? "정해진 순서로 희망 역할을 선택합니다."
      : special.phase === "PROPOSE" ? "처음 네 트릭과 마지막 트릭 담당자를 제안하세요." : "제안된 역할 배정에 동의할지 선택하세요.";
    return special.phase === "RESPOND" ? special.kind === "NO_TRICKS_PLAYER" ? "정해진 순서로 좋음·나쁨만 답합니다." : "정해진 순서로 가능 여부를 답합니다." : "사령관이 승무원 한 명을 지명합니다.";
  }
  if (game.tasks.phase !== "READY") return game.tasks.phase === "CHOOSE" ? "순서에 따라 목표 한 장을 선택합니다."
    : game.tasks.phase === "RESPOND" ? "목표 수행 가능 여부만 답합니다." : "사령관이 목표를 배분합니다.";
  return game.activePlayerId === self(game) ? "낼 카드 한 장을 선택하세요." : "다음 승무원의 카드 제출을 기다립니다.";
}
