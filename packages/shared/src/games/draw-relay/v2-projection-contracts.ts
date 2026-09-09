import * as v from "valibot";
import { PlayerIdSchema, GameIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { DrawingSchema, GuessSchema } from "./drawing-contracts.js";
const Count = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(8));
const Player = v.strictObject({ playerId: PlayerIdSchema, submitted: v.boolean(), forfeited: v.boolean() });
const Page = v.variant("kind", [
  v.strictObject({ kind: v.literal("DRAWING"), authorPlayerId: PlayerIdSchema, timedOut: v.boolean(), drawing: DrawingSchema }),
  v.strictObject({ kind: v.literal("GUESS"), authorPlayerId: PlayerIdSchema, timedOut: v.boolean(), text: GuessSchema }),
]);
const Book = v.strictObject({ ownerPlayerId: PlayerIdSchema, initialPrompt: v.nullable(GuessSchema), pages: v.pipe(v.array(Page), v.maxLength(8)) });
const Base = { gameType: v.literal("DRAW_RELAY"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("draw-relay-rules-v1"), promptsVersion: v.literal("draw-relay-prompts-v1"),
  stageIndex: v.pipe(Count,v.minValue(1)), totalStages: v.pipe(Count,v.minValue(2)),
  playerStates: v.pipe(v.array(Player),v.minLength(3),v.maxLength(8)) };
const PrivateBase = { draft: DrawingSchema, draftRevision: v.pipe(v.number(),v.safeInteger(),v.minValue(0)), submitted: v.boolean() };
const Window = { stageToken: TurnIdSchema, deadlineAt: ServerTimeSchema };
export const DrawRelayDrawingProjectionSchema = v.strictObject({ ...Base, ...Window, phase: v.literal("DRAW"),
  privateState: v.strictObject({ ...PrivateBase, source: v.strictObject({ kind: v.literal("TEXT"), text: GuessSchema }) }) });
export const DrawRelayGuessProjectionSchema = v.strictObject({ ...Base, ...Window, phase: v.picklist(["GUESS","FINAL_GUESS"]),
  privateState: v.strictObject({ ...PrivateBase, source: v.strictObject({ kind: v.literal("DRAWING"), drawing: DrawingSchema }) }) });
const Revealed = { stageToken: TurnIdSchema, reveal: v.strictObject({ bookIndex: Count, pageIndex: v.pipe(v.number(),v.integer(),v.minValue(-1),v.maxValue(8)) }),
  books: v.pipe(v.array(Book),v.minLength(1),v.maxLength(8)) };
const RevealObject = v.strictObject({ ...Base, ...Revealed, phase: v.literal("REVEAL") });
export const DrawRelayRevealProjectionSchema = v.pipe(RevealObject,v.check(g =>
  g.books.length === g.reveal.bookIndex + 1 && g.books.every((b,i) =>
    i < g.reveal.bookIndex ? b.initialPrompt !== null && b.pages.length === g.totalStages
      : (b.initialPrompt === null) === (g.reveal.pageIndex === -1) && b.pages.length === Math.max(0,g.reveal.pageIndex)), "Reveal contains unopened pages."));
export const DrawRelayFinishedProjectionSchema = v.pipe(v.strictObject({ ...Base,...Revealed,phase:v.literal("FINISHED") }),
  v.check(g => g.books.length === g.playerStates.length && g.books.every(b => b.initialPrompt !== null && b.pages.length === g.totalStages)));
export const DrawRelayPlayingProjectionSchema = v.union([DrawRelayDrawingProjectionSchema,DrawRelayGuessProjectionSchema,DrawRelayRevealProjectionSchema]);
export type DrawRelayPlayingProjection = v.InferOutput<typeof DrawRelayPlayingProjectionSchema>;
export type DrawRelayFinishedProjection = v.InferOutput<typeof DrawRelayFinishedProjectionSchema>;
