import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import type { SpaceCrewMissionDefinition } from "./missions.js";
import type { SpaceCrewTrickState } from "./trick.js";

const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const GoodBad = v.picklist(["GOOD", "BAD"]);
const Preference = v.picklist(["FIRST_FOUR", "MIDDLE", "LAST"]);
const SelectionPhase = v.picklist(["RESPOND", "SELECT", "READY"]);
export const SpaceCrewMissionSpecialSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("NONE") }),
  v.strictObject({ kind: v.literal("NO_TRICKS_PLAYER"), phase: SelectionPhase,
    responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: GoodBad })), v.maxLength(4)), playerId: v.nullable(PlayerIdSchema) }),
  v.strictObject({ kind: v.literal("NO_COMMUNICATION_PLAYER"), phase: v.picklist(["SELECT", "READY"]), playerId: v.nullable(PlayerIdSchema) }),
  v.strictObject({ kind: v.literal("LIMITED_TRICKS_PLAYER"), phase: SelectionPhase,
    responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: v.boolean() })), v.maxLength(4)), playerId: v.nullable(PlayerIdSchema) }),
  v.strictObject({ kind: v.literal("PINK_COLLECTOR"), phase: v.literal("READY"), initialPinkNineHolderId: PlayerIdSchema, playerId: PlayerIdSchema }),
  v.strictObject({ kind: v.literal("FINAL_ROLES"), revision: Count, phase: v.picklist(["PREFERENCES", "PROPOSE", "VOTE", "READY"]),
    preferences: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, preference: Preference })), v.maxLength(5)),
    proposal: v.nullable(v.strictObject({ firstFourPlayerId: PlayerIdSchema, lastPlayerId: PlayerIdSchema, proposerId: PlayerIdSchema })),
    votes: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, accept: v.literal(true) })), v.maxLength(5)),
  }),
]);
export const SpaceCrewSpecialCommandSchemas = [
  v.strictObject({ kind: v.literal("SPECIAL_RESPOND"), answer: v.union([GoodBad, v.boolean()]), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SPECIAL_SELECT"), playerId: PlayerIdSchema, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SPECIAL_PREFERENCE"), preference: Preference, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SPECIAL_PROPOSE_ROLES"), firstFourPlayerId: PlayerIdSchema, lastPlayerId: PlayerIdSchema, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SPECIAL_VOTE_ROLES"), accept: v.boolean(), expectedRevision: Count }),
] as const;
const SpecialCommandSchema = v.variant("kind", SpaceCrewSpecialCommandSchemas);
export type SpaceCrewMissionSpecial = v.InferOutput<typeof SpaceCrewMissionSpecialSchema>;
type SpecialCommand = v.InferOutput<typeof SpecialCommandSchema>;
type Result = { ok: true; special: SpaceCrewMissionSpecial } | { ok: false; reason: "INVALID_ACTION" | "INVALID_PHASE" | "NOT_YOUR_TURN" | "INVALID_RECIPIENT" | "ALREADY_RESPONDED" | "REVISION_EXHAUSTED" };
function invalid(): never { throw new Error("Invalid Space Crew special setup."); }
function seat(trick: SpaceCrewTrickState, offset: number): PlayerId {
  const index = trick.players.findIndex(player => player.playerId === trick.commanderId);
  return trick.players[(index + offset) % trick.players.length]?.playerId ?? invalid();
}
function expectedKind(definition: SpaceCrewMissionDefinition): SpaceCrewMissionSpecial["kind"] {
  switch (definition.setup.kind) {
    case "NONE": return "NONE";
    case "SELECT_NO_TRICKS_PLAYER": return "NO_TRICKS_PLAYER";
    case "SELECT_NO_COMMUNICATION_PLAYER": return "NO_COMMUNICATION_PLAYER";
    case "SELECT_RESTRICTED_TRICKS_PLAYER": return "LIMITED_TRICKS_PLAYER";
    case "REVEAL_PINK_NINE_HOLDER": return "PINK_COLLECTOR";
    case "ASSIGN_TRICK_ROLES": return "FINAL_ROLES";
  }
}

export function createSpaceCrewMissionSpecial(definition: SpaceCrewMissionDefinition, trick: SpaceCrewTrickState): SpaceCrewMissionSpecial {
  switch (expectedKind(definition)) {
    case "NONE": return { kind: "NONE" };
    case "NO_TRICKS_PLAYER": return { kind: "NO_TRICKS_PLAYER", phase: "RESPOND", responses: [], playerId: null };
    case "NO_COMMUNICATION_PLAYER": return { kind: "NO_COMMUNICATION_PLAYER", phase: "SELECT", playerId: null };
    case "LIMITED_TRICKS_PLAYER": return { kind: "LIMITED_TRICKS_PLAYER", phase: "RESPOND", responses: [], playerId: null };
    case "FINAL_ROLES": return { kind: "FINAL_ROLES", revision: 0, phase: "PREFERENCES", preferences: [], proposal: null, votes: [] };
    case "PINK_COLLECTOR": {
      const pinkNine = trick.cards.find(card => card.suit === "PINK" && card.value === 9);
      const holderIndex = trick.players.findIndex(player => pinkNine !== undefined && player.hand.includes(pinkNine.cardId));
      const holder = trick.players[holderIndex], collector = trick.players[(holderIndex + 1) % trick.players.length];
      if (!holder || !collector) return invalid();
      return { kind: "PINK_COLLECTOR", phase: "READY", initialPinkNineHolderId: holder.playerId, playerId: collector.playerId };
    }
  }
}

export function parseSpaceCrewMissionSpecial(input: unknown, definition: SpaceCrewMissionDefinition, trick: SpaceCrewTrickState, distressExchanged: boolean): SpaceCrewMissionSpecial {
  const special = v.parse(SpaceCrewMissionSpecialSchema, input);
  const players = trick.players.map(player => player.playerId);
  if (special.kind !== expectedKind(definition)) return invalid();
  if (special.kind === "NONE") return special;
  if (special.kind === "PINK_COLLECTOR") {
    const index = players.indexOf(special.initialPinkNineHolderId);
    if (index < 0 || players[(index + 1) % players.length] !== special.playerId) return invalid();
    if (!distressExchanged) {
      const pinkNine = trick.cards.find(card => card.suit === "PINK" && card.value === 9);
      const plays = [...trick.completedTricks.flatMap(item => item.plays), ...trick.currentTrick];
      const holder = trick.players.find(player => pinkNine !== undefined && player.hand.includes(pinkNine.cardId))?.playerId
        ?? plays.find(play => play.cardId === pinkNine?.cardId)?.playerId;
      if (holder !== special.initialPinkNineHolderId) return invalid();
    }
    return special;
  }
  if (special.kind === "FINAL_ROLES") {
    if (special.preferences.some((item, index) => item.playerId !== seat(trick, index))) return invalid();
    if (special.phase === "PREFERENCES" ? special.preferences.length >= players.length : special.preferences.length !== players.length) return invalid();
    if (special.phase === "PREFERENCES" || special.phase === "PROPOSE") {
      if (special.proposal !== null || special.votes.length !== 0) return invalid();
    } else {
      const proposal = special.proposal;
      if (!proposal || !players.includes(proposal.proposerId) || !players.includes(proposal.firstFourPlayerId) || !players.includes(proposal.lastPlayerId) || proposal.firstFourPlayerId === proposal.lastPlayerId) return invalid();
      if (special.votes[0]?.playerId !== proposal.proposerId || new Set(special.votes.map(vote => vote.playerId)).size !== special.votes.length || special.votes.some(vote => !players.includes(vote.playerId))) return invalid();
      if (special.phase === "READY" ? special.votes.length !== players.length : special.votes.length >= players.length) return invalid();
    }
    const minimumRevision = special.preferences.length + Number(special.proposal !== null) + Math.max(0, special.votes.length - 1);
    if (special.revision < minimumRevision) return invalid();
    if (special.phase === "PREFERENCES" && special.revision !== special.preferences.length) return invalid();
    return special;
  }
  if (special.kind !== "NO_COMMUNICATION_PLAYER") {
    if (special.responses.some((response, index) => response.playerId !== seat(trick, index + 1))) return invalid();
    if (special.phase === "RESPOND" ? special.responses.length >= players.length - 1 : special.responses.length !== players.length - 1) return invalid();
  }
  if (special.phase === "READY" ? special.playerId === null || !players.includes(special.playerId) : special.playerId !== null) return invalid();
  if (special.kind === "LIMITED_TRICKS_PLAYER" && special.playerId === trick.commanderId) return invalid();
  return special;
}

export function spaceCrewSpecialRevision(special: SpaceCrewMissionSpecial): number {
  switch (special.kind) {
    case "NONE":
    case "PINK_COLLECTOR": return 0;
    case "FINAL_ROLES": return special.revision;
    case "NO_COMMUNICATION_PLAYER": return Number(special.phase === "READY");
    default: return special.responses.length + Number(special.phase === "READY");
  }
}

export function applySpaceCrewMissionSpecial(input: SpaceCrewMissionSpecial, trick: SpaceCrewTrickState, actor: PlayerId, command: SpecialCommand): Result {
  const special = v.parse(SpaceCrewMissionSpecialSchema, input);
  if (special.kind === "NONE" || special.phase === "READY") return { ok: false, reason: "INVALID_PHASE" };
  if (special.kind === "FINAL_ROLES") {
    if (special.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
    if (command.kind === "SPECIAL_PREFERENCE") {
      if (special.phase !== "PREFERENCES") return { ok: false, reason: "INVALID_PHASE" };
      if (actor !== seat(trick, special.preferences.length)) return { ok: false, reason: "NOT_YOUR_TURN" };
      special.preferences.push({ playerId: actor, preference: command.preference });
      if (special.preferences.length === trick.players.length) special.phase = "PROPOSE";
    } else if (command.kind === "SPECIAL_PROPOSE_ROLES") {
      if (special.phase !== "PROPOSE") return { ok: false, reason: "INVALID_PHASE" };
      if (command.firstFourPlayerId === command.lastPlayerId || !trick.players.some(player => player.playerId === command.firstFourPlayerId) || !trick.players.some(player => player.playerId === command.lastPlayerId)) return { ok: false, reason: "INVALID_RECIPIENT" };
      special.proposal = { firstFourPlayerId: command.firstFourPlayerId, lastPlayerId: command.lastPlayerId, proposerId: actor };
      special.votes = [{ playerId: actor, accept: true }]; special.phase = "VOTE";
    } else if (command.kind === "SPECIAL_VOTE_ROLES") {
      if (special.phase !== "VOTE") return { ok: false, reason: "INVALID_PHASE" };
      if (special.votes.some(vote => vote.playerId === actor)) return { ok: false, reason: "ALREADY_RESPONDED" };
      if (!command.accept) { special.proposal = null; special.votes = []; special.phase = "PROPOSE"; }
      else { special.votes.push({ playerId: actor, accept: true }); if (special.votes.length === trick.players.length) special.phase = "READY"; }
    } else return { ok: false, reason: "INVALID_PHASE" };
    special.revision += 1;
    return { ok: true, special };
  }
  if (command.kind === "SPECIAL_RESPOND") {
    if (special.kind === "NO_COMMUNICATION_PLAYER" || special.phase !== "RESPOND") return { ok: false, reason: "INVALID_PHASE" };
    if (actor !== seat(trick, special.responses.length + 1)) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (special.kind === "LIMITED_TRICKS_PLAYER") {
      if (typeof command.answer !== "boolean") return { ok: false, reason: "INVALID_ACTION" };
      special.responses.push({ playerId: actor, answer: command.answer });
    } else {
      if (typeof command.answer !== "string") return { ok: false, reason: "INVALID_ACTION" };
      special.responses.push({ playerId: actor, answer: command.answer });
    }
    if (special.responses.length === trick.players.length - 1) special.phase = "SELECT";
  } else if (command.kind === "SPECIAL_SELECT") {
    if (special.phase !== "SELECT") return { ok: false, reason: "INVALID_PHASE" };
    if (actor !== trick.commanderId) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (!trick.players.some(player => player.playerId === command.playerId) || special.kind === "LIMITED_TRICKS_PLAYER" && command.playerId === trick.commanderId) return { ok: false, reason: "INVALID_RECIPIENT" };
    special.playerId = command.playerId; special.phase = "READY";
  } else return { ok: false, reason: "INVALID_PHASE" };
  return { ok: true, special };
}
