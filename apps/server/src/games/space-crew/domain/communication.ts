import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { SpaceCrewCardIdSchema, type SpaceCrewCard } from "./cards.js";
import { parseSpaceCrewTrickState, type SpaceCrewTrickState } from "./trick.js";

const MarkSchema = v.picklist(["HIGHEST", "LOWEST", "ONLY"]);
export type SpaceCrewCommunicationMark = v.InferOutput<typeof MarkSchema>;
const CommunicationSchema = v.strictObject({
  playerId: PlayerIdSchema,
  used: v.boolean(),
  cardId: v.nullable(SpaceCrewCardIdSchema),
  mark: v.nullable(MarkSchema),
});
export type SpaceCrewCommunication = Readonly<v.InferOutput<typeof CommunicationSchema>>;
export type SpaceCrewCommunications = readonly SpaceCrewCommunication[];
const CommunicationsSchema = v.pipe(v.array(CommunicationSchema), v.minLength(3), v.maxLength(5));
const RuleSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("NORMAL") }),
  v.strictObject({ kind: v.literal("DEAD_ZONE") }),
  v.strictObject({ kind: v.literal("DISRUPTION"), fromTrick: v.picklist([2, 3]) }),
  v.strictObject({ kind: v.literal("FORBIDDEN_PLAYER"), playerId: PlayerIdSchema }),
]);
export type SpaceCrewCommunicationRule = v.InferOutput<typeof RuleSchema>;
const CommandSchema = v.strictObject({
  cardId: SpaceCrewCardIdSchema,
  mark: v.nullable(MarkSchema),
  expectedRevision: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
});
export type SpaceCrewCommunicationInput = Readonly<{
  trick: SpaceCrewTrickState;
  communications: SpaceCrewCommunications;
  assignmentComplete: boolean;
  rule: SpaceCrewCommunicationRule;
}>;
export type SpaceCrewCommunicationError =
  | "INVALID_STATE" | "INVALID_ACTION" | "INVALID_ACTOR" | "STALE_REVISION"
  | "INVALID_PHASE" | "ALREADY_COMMUNICATED" | "COMMUNICATION_FORBIDDEN"
  | "INVALID_CARD" | "INVALID_MARK" | "REVISION_EXHAUSTED";
export type SpaceCrewCommunicationResult =
  | Readonly<{ ok: true; trick: SpaceCrewTrickState; communications: SpaceCrewCommunications }>
  | Readonly<{ ok: false; reason: SpaceCrewCommunicationError }>;

function invalidState(): never {
  throw new Error("Invalid Space Crew communication state.");
}

export function createSpaceCrewCommunications(playerIds: readonly PlayerId[]): SpaceCrewCommunications {
  const players = v.parse(v.pipe(v.array(PlayerIdSchema), v.minLength(3), v.maxLength(5)), playerIds);
  if (new Set(players).size !== players.length) return invalidState();
  return Object.freeze(players.map(playerId => Object.freeze({ playerId, used: false, cardId: null, mark: null })));
}

/** Declaration marks describe the hand at declaration time, not the current hand. */
export function parseSpaceCrewCommunications(input: unknown, trick: SpaceCrewTrickState): SpaceCrewCommunications {
  const state = parseSpaceCrewTrickState(trick);
  const communications = v.parse(CommunicationsSchema, input);
  const players = new Set(state.players.map(player => player.playerId));
  if (communications.length !== players.size || new Set(communications.map(item => item.playerId)).size !== players.size) return invalidState();
  const declaredIds = new Set<string>();
  const plays = [...state.completedTricks.flatMap(item => item.plays), ...state.currentTrick];
  for (const item of communications) {
    if (!players.has(item.playerId)) return invalidState();
    if (!item.used) {
      if (item.cardId !== null || item.mark !== null) return invalidState();
      continue;
    }
    if (item.cardId === null || declaredIds.has(item.cardId)) return invalidState();
    declaredIds.add(item.cardId);
    const card = state.cards.find(candidate => candidate.cardId === item.cardId);
    const owner = state.players.find(player => player.playerId === item.playerId);
    if (!card || card.kind !== "COLOR" || !owner) return invalidState();
    if (!owner.hand.includes(card.cardId) && !plays.some(play => play.playerId === item.playerId && play.cardId === card.cardId)) return invalidState();
  }
  return Object.freeze(communications.map(item => Object.freeze(item)));
}

function relationship(state: SpaceCrewTrickState, playerId: PlayerId, card: SpaceCrewCard): readonly SpaceCrewCommunicationMark[] {
  if (card.kind !== "COLOR") return [];
  const player = state.players.find(candidate => candidate.playerId === playerId);
  if (!player || !player.hand.includes(card.cardId)) return [];
  const suitCards = state.cards.filter(candidate => candidate.suit === card.suit && player.hand.includes(candidate.cardId));
  if (suitCards.length === 1) return ["ONLY"];
  if (suitCards.every(candidate => candidate.value <= card.value)) return ["HIGHEST"];
  if (suitCards.every(candidate => candidate.value >= card.value)) return ["LOWEST"];
  return [];
}

/** The application supplies rules and assignment status; commands cannot override them. */
export function communicateSpaceCrew(input: SpaceCrewCommunicationInput, actor: PlayerId, command: unknown): SpaceCrewCommunicationResult {
  let trick: SpaceCrewTrickState;
  let communications: SpaceCrewCommunications;
  let rule: SpaceCrewCommunicationRule;
  try {
    trick = parseSpaceCrewTrickState(input.trick);
    communications = parseSpaceCrewCommunications(input.communications, trick);
    rule = v.parse(RuleSchema, input.rule);
    v.parse(v.boolean(), input.assignmentComplete);
    if (rule.kind === "FORBIDDEN_PLAYER") {
      const forbiddenPlayerId = rule.playerId;
      if (!trick.players.some(player => player.playerId === forbiddenPlayerId)) return { ok: false, reason: "INVALID_STATE" };
    }
  } catch {
    return { ok: false, reason: "INVALID_STATE" };
  }
  const parsed = v.safeParse(CommandSchema, command);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const player = trick.players.find(candidate => candidate.playerId === actor);
  const communication = communications.find(candidate => candidate.playerId === actor);
  if (!player || !communication) return { ok: false, reason: "INVALID_ACTOR" };
  if (parsed.output.expectedRevision !== trick.revision) return { ok: false, reason: "STALE_REVISION" };
  if (!input.assignmentComplete || trick.phase !== "BETWEEN_TRICKS") return { ok: false, reason: "INVALID_PHASE" };
  if (communication.used) return { ok: false, reason: "ALREADY_COMMUNICATED" };
  if (rule.kind === "FORBIDDEN_PLAYER" && rule.playerId === actor || rule.kind === "DISRUPTION" && trick.completedTricks.length + 1 < rule.fromTrick) return { ok: false, reason: "COMMUNICATION_FORBIDDEN" };
  if (!player.hand.includes(parsed.output.cardId)) return { ok: false, reason: "INVALID_CARD" };
  const card = trick.cards.find(candidate => candidate.cardId === parsed.output.cardId);
  if (!card || card.kind !== "COLOR") return { ok: false, reason: "INVALID_CARD" };
  const marks = relationship(trick, actor, card);
  if (marks.length === 0 || (rule.kind === "DEAD_ZONE" ? parsed.output.mark !== null : parsed.output.mark === null || !marks.includes(parsed.output.mark))) return { ok: false, reason: "INVALID_MARK" };
  if (trick.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
  const next = communications.map(item => item.playerId === actor
    ? { playerId: actor, used: true, cardId: card.cardId, mark: parsed.output.mark }
    : item);
  try {
    const candidate = parseSpaceCrewTrickState({ ...trick, revision: trick.revision + 1 });
    return { ok: true, trick: candidate, communications: parseSpaceCrewCommunications(next, candidate) };
  } catch {
    return { ok: false, reason: "INVALID_STATE" };
  }
}

export type SpaceCrewPublicCommunication = Readonly<{
  playerId: PlayerId;
  used: boolean;
  card: SpaceCrewCard | null;
  mark: SpaceCrewCommunicationMark | null;
}>;

/** Reveals only currently displayed declarations, never old cards or hands. */
export function projectSpaceCrewCommunications(trick: SpaceCrewTrickState, input: SpaceCrewCommunications): readonly SpaceCrewPublicCommunication[] {
  const state = parseSpaceCrewTrickState(trick);
  const communications = parseSpaceCrewCommunications(input, state);
  return Object.freeze(communications.map(item => {
    const owner = state.players.find(player => player.playerId === item.playerId);
    const card = item.used && item.cardId !== null && owner?.hand.includes(item.cardId)
      ? state.cards.find(candidate => candidate.cardId === item.cardId) ?? null
      : null;
    return Object.freeze({ playerId: item.playerId, used: item.used, card: card === null ? null : Object.freeze({ ...card }), mark: card === null ? null : item.mark });
  }));
}
