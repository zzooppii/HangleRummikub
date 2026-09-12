import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import {
  SpaceCrewCardSchema,
  SpaceCrewCardIdSchema,
  SpaceCrewHandSchema,
  parseSpaceCrewDeck,
  type SpaceCrewCard,
  type SpaceCrewDeal,
} from "./cards.js";

const nonnegativeInteger = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const positiveInteger = v.pipe(nonnegativeInteger, v.minValue(1));
const PlaySchema = v.strictObject({ playerId: PlayerIdSchema, cardId: SpaceCrewCardIdSchema });
const CompletedTrickSchema = v.strictObject({
  number: positiveInteger,
  leaderId: PlayerIdSchema,
  winnerId: PlayerIdSchema,
  plays: v.pipe(v.array(PlaySchema), v.minLength(3), v.maxLength(5)),
});
const StateSchema = v.strictObject({
  cards: v.pipe(v.array(SpaceCrewCardSchema), v.length(40)),
  players: v.pipe(v.array(SpaceCrewHandSchema), v.minLength(3), v.maxLength(5)),
  commanderId: PlayerIdSchema,
  totalTricks: positiveInteger,
  phase: v.picklist(["BETWEEN_TRICKS", "IN_TRICK", "EXHAUSTED"]),
  revision: nonnegativeInteger,
  leaderId: PlayerIdSchema,
  activePlayerId: v.nullable(PlayerIdSchema),
  currentTrick: v.pipe(v.array(PlaySchema), v.maxLength(4)),
  completedTricks: v.pipe(v.array(CompletedTrickSchema), v.maxLength(13)),
});
const CommandSchema = v.strictObject({ cardId: SpaceCrewCardIdSchema, expectedRevision: nonnegativeInteger });

export type SpaceCrewTrickState = v.InferOutput<typeof StateSchema>;
export type SpaceCrewPlay = v.InferOutput<typeof PlaySchema>;
export type SpaceCrewCompletedTrick = v.InferOutput<typeof CompletedTrickSchema>;
export type SpaceCrewTrickError =
  | "INVALID_STATE" | "INVALID_ACTION" | "INVALID_ACTOR" | "STALE_REVISION"
  | "INVALID_PHASE" | "NOT_YOUR_TURN" | "INVALID_CARD" | "MUST_FOLLOW_SUIT"
  | "REVISION_EXHAUSTED";
export type SpaceCrewPlayResult =
  | { ok: true; state: SpaceCrewTrickState }
  | { ok: false; reason: SpaceCrewTrickError };

function invalidState(): never {
  throw new Error("Invalid Space Crew trick state.");
}

function cardFor(cards: readonly SpaceCrewCard[], id: string): SpaceCrewCard {
  const card = cards.find(candidate => candidate.cardId === id);
  if (!card) return invalidState();
  return card;
}

function playerAt(state: SpaceCrewTrickState, leaderId: PlayerId, offset: number): PlayerId {
  const leader = state.players.findIndex(player => player.playerId === leaderId);
  if (leader < 0) return invalidState();
  const player = state.players[(leader + offset) % state.players.length];
  if (!player) return invalidState();
  return player.playerId;
}

function winnerOf(cards: readonly SpaceCrewCard[], plays: readonly SpaceCrewPlay[]): PlayerId {
  const first = plays[0];
  if (!first) return invalidState();
  let winner = first;
  let winningCard = cardFor(cards, first.cardId);
  const leadSuit = winningCard.suit;
  for (const play of plays.slice(1)) {
    const card = cardFor(cards, play.cardId);
    const wins = card.kind === "ROCKET"
      ? winningCard.kind !== "ROCKET" || card.value > winningCard.value
      : winningCard.kind !== "ROCKET" && card.suit === leadSuit && card.value > winningCard.value;
    if (wins) {
      winner = play;
      winningCard = card;
    }
  }
  return winner.playerId;
}

/** Validates canonical zones and trick history without reconstructing past hands. */
export function parseSpaceCrewTrickState(input: unknown): SpaceCrewTrickState {
  const parsed = v.safeParse(StateSchema, input);
  if (!parsed.success) return invalidState();
  const state = parsed.output;
  try {
    parseSpaceCrewDeck(state.cards);
  } catch {
    return invalidState();
  }
  const playerIds = new Set(state.players.map(player => player.playerId));
  const count = state.players.length;
  if (playerIds.size !== count || !playerIds.has(state.commanderId) || !playerIds.has(state.leaderId)) return invalidState();
  if (state.totalTricks !== Math.floor(40 / count) || state.completedTricks.length > state.totalTricks) return invalidState();

  const allPlays = [...state.completedTricks.flatMap(trick => trick.plays), ...state.currentTrick];
  const zones = [...state.players.flatMap(player => player.hand), ...allPlays.map(play => play.cardId)];
  const cardIds = new Set(state.cards.map(card => card.cardId));
  if (zones.length !== 40 || new Set(zones).size !== 40 || zones.some(id => !cardIds.has(id))) return invalidState();
  if (state.revision < allPlays.length) return invalidState();
  // Before the first play, no rule can have transferred a rocket yet.
  if (allPlays.length === 0) {
    const rocketFour = state.cards.find(card => card.kind === "ROCKET" && card.value === 4);
    const commander = state.players.find(player => player.playerId === state.commanderId);
    if (!rocketFour || !commander?.hand.includes(rocketFour.cardId)) return invalidState();
  }

  let expectedLeader = state.commanderId;
  for (const [index, trick] of state.completedTricks.entries()) {
    if (trick.number !== index + 1 || trick.leaderId !== expectedLeader || trick.plays.length !== count) return invalidState();
    if (trick.plays.some((play, offset) => play.playerId !== playerAt(state, expectedLeader, offset))) return invalidState();
    if (trick.winnerId !== winnerOf(state.cards, trick.plays)) return invalidState();
    expectedLeader = trick.winnerId;
  }
  if (state.leaderId !== expectedLeader || state.currentTrick.length >= count) return invalidState();
  if (state.currentTrick.some((play, offset) => play.playerId !== playerAt(state, state.leaderId, offset))) return invalidState();
  const openingPlay = state.currentTrick[0];
  if (openingPlay) {
    const leadSuit = cardFor(state.cards, openingPlay.cardId).suit;
    // Exchanges happen between tricks; remaining hands can prove a current revoke.
    for (const play of state.currentTrick.slice(1)) {
      if (cardFor(state.cards, play.cardId).suit === leadSuit) continue;
      const player = state.players.find(candidate => candidate.playerId === play.playerId);
      if (!player || player.hand.some(id => cardFor(state.cards, id).suit === leadSuit)) return invalidState();
    }
  }

  const normalizedHandCounts = state.players.map(player =>
    player.hand.length + state.completedTricks.length + Number(state.currentTrick.some(play => play.playerId === player.playerId)),
  );
  if (normalizedHandCounts.some(size => size !== state.totalTricks && size !== state.totalTricks + 1)) return invalidState();
  if (normalizedHandCounts.filter(size => size === state.totalTricks + 1).length !== 40 % count) return invalidState();

  if (state.completedTricks.length === state.totalTricks) {
    if (state.phase !== "EXHAUSTED" || state.currentTrick.length !== 0 || state.activePlayerId !== null) return invalidState();
  } else {
    const expectedPhase = state.currentTrick.length === 0 ? "BETWEEN_TRICKS" : "IN_TRICK";
    if (state.phase !== expectedPhase || state.activePlayerId !== playerAt(state, state.leaderId, state.currentTrick.length)) return invalidState();
  }
  return state;
}

export function createSpaceCrewTrickState(deal: SpaceCrewDeal): SpaceCrewTrickState {
  return parseSpaceCrewTrickState({
    ...deal,
    phase: "BETWEEN_TRICKS",
    revision: 0,
    leaderId: deal.commanderId,
    activePlayerId: deal.commanderId,
    currentTrick: [],
    completedTricks: [],
  });
}

function legalIds(state: SpaceCrewTrickState, actor: PlayerId): string[] {
  if (state.phase === "EXHAUSTED" || state.activePlayerId !== actor) return [];
  const player = state.players.find(candidate => candidate.playerId === actor);
  if (!player) return [];
  const first = state.currentTrick[0];
  if (!first) return [...player.hand];
  const suit = cardFor(state.cards, first.cardId).suit;
  const matching = player.hand.filter(id => cardFor(state.cards, id).suit === suit);
  return matching.length > 0 ? matching : [...player.hand];
}

export function legalSpaceCrewCardIds(state: SpaceCrewTrickState, actor: PlayerId): readonly string[] {
  return legalIds(parseSpaceCrewTrickState(state), actor);
}

/** Produces a fully validated candidate; neither success nor failure mutates input. */
export function playSpaceCrewCard(input: SpaceCrewTrickState, actor: PlayerId, command: unknown): SpaceCrewPlayResult {
  let state: SpaceCrewTrickState;
  try {
    state = parseSpaceCrewTrickState(input);
  } catch {
    return { ok: false, reason: "INVALID_STATE" };
  }
  const parsed = v.safeParse(CommandSchema, command);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const player = state.players.find(candidate => candidate.playerId === actor);
  if (!player) return { ok: false, reason: "INVALID_ACTOR" };
  if (parsed.output.expectedRevision !== state.revision) return { ok: false, reason: "STALE_REVISION" };
  if (state.phase === "EXHAUSTED") return { ok: false, reason: "INVALID_PHASE" };
  if (state.activePlayerId !== actor) return { ok: false, reason: "NOT_YOUR_TURN" };
  if (!player.hand.includes(parsed.output.cardId)) return { ok: false, reason: "INVALID_CARD" };
  if (!legalIds(state, actor).includes(parsed.output.cardId)) return { ok: false, reason: "MUST_FOLLOW_SUIT" };
  if (state.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };

  player.hand = player.hand.filter(id => id !== parsed.output.cardId);
  state.currentTrick.push({ playerId: actor, cardId: parsed.output.cardId });
  state.revision += 1;
  if (state.currentTrick.length === state.players.length) {
    const winnerId = winnerOf(state.cards, state.currentTrick);
    state.completedTricks.push({
      number: state.completedTricks.length + 1,
      leaderId: state.leaderId,
      winnerId,
      plays: state.currentTrick,
    });
    state.currentTrick = [];
    state.leaderId = winnerId;
    state.phase = state.completedTricks.length === state.totalTricks ? "EXHAUSTED" : "BETWEEN_TRICKS";
    state.activePlayerId = state.phase === "EXHAUSTED" ? null : winnerId;
  } else {
    state.phase = "IN_TRICK";
    state.activePlayerId = playerAt(state, state.leaderId, state.currentTrick.length);
  }
  return { ok: true, state: parseSpaceCrewTrickState(state) };
}
