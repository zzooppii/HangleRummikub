import * as v from "valibot";
import { HALLI_FRUITS, HalliCardFaceSchema, HalliFeedbackSchema, HalliResultSchema, GameIdSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, GameRevisionSchema, type PlayerId } from "@hangul-rummikub/shared";
const CardSchema = v.strictObject({ ...HalliCardFaceSchema.entries, id: v.pipe(v.string(), v.minLength(1)) });
const PlayerSchema = v.strictObject({ playerId: PlayerIdSchema, deck: v.array(CardSchema), discard: v.array(CardSchema), eliminated: v.boolean(), lastBellAt: v.nullable(ServerTimeSchema) });
const StateSchema = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal("halli-galli-v1"), revision: GameRevisionSchema,
 phase: v.picklist(["PLAYING", "FINISHED"]), startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema), gameDeadlineAt: ServerTimeSchema,
 transitionId: TurnIdSchema, nextTransitionAt: v.nullable(ServerTimeSchema), flipAvailableAt: ServerTimeSchema, activePlayerId: PlayerIdSchema,
 players: v.pipe(v.array(PlayerSchema), v.minLength(2), v.maxLength(6)), feedback: HalliFeedbackSchema, result: v.nullable(HalliResultSchema) });
export type HalliState = v.InferOutput<typeof StateSchema>;
export type HalliCard = v.InferOutput<typeof CardSchema>;
export function makeHalliDeck(id: (index: number) => string): HalliCard[] {
 const cards: HalliCard[] = [];
 for (const fruit of HALLI_FRUITS) for (const count of [1, 2, 3, 4, 5] as const) {
  const copies = [5, 3, 3, 2, 1][count - 1]!;
  for (let i = 0; i < copies; i++) cards.push({ id: id(cards.length), fruit, count });
 }
 return cards;
}
export function parseHalliState(input: unknown): HalliState {
 const s = v.parse(StateSchema, input), cards = s.players.flatMap(p => [...p.deck, ...p.discard]);
 if (new Set(s.players.map(p => p.playerId)).size !== s.players.length || cards.length !== 56 || new Set(cards.map(c => c.id)).size !== 56) throw new Error("HALLI identity/conservation failure.");
 for (const fruit of HALLI_FRUITS) for (const count of [1, 2, 3, 4, 5]) if (cards.filter(c => c.fruit === fruit && c.count === count).length !== [5, 3, 3, 2, 1][count - 1]) throw new Error("HALLI inventory failure.");
 if (s.players.some(p => p.eliminated !== (p.deck.length === 0)) || !s.players.some(p => p.playerId === s.activePlayerId)) throw new Error("HALLI roster failure.");
 if (s.gameDeadlineAt !== s.startedAt + 900_000) throw new Error("HALLI game deadline failure.");
 if (s.phase === "PLAYING") {
  if (s.result !== null || s.finishedAt !== null || s.nextTransitionAt === null || s.nextTransitionAt > s.gameDeadlineAt || !s.players.some(p => p.playerId === s.activePlayerId && !p.eliminated) || s.players.filter(p => !p.eliminated).length < 2) throw new Error("HALLI running state failure.");
 } else if (!s.result || s.finishedAt === null || s.nextTransitionAt !== null || JSON.stringify(s.result) !== JSON.stringify(v.parse(HalliResultSchema, resultFor(s, s.result.reason)))) throw new Error("HALLI result failure.");
 return s;
}
function resultFor(s: HalliState, reason: NonNullable<HalliState["result"]>["reason"]): NonNullable<HalliState["result"]> {
 const scores = s.players.map(p => ({ playerId: p.playerId, cards: p.deck.length + p.discard.length }));
 const highest = Math.max(...scores.map(p => p.cards));
 return { reason, scores, winnerPlayerIds: reason === "CANCELLED" ? [] : scores.filter(p => p.cards === highest).map(p => p.playerId) };
}
function finish(s: HalliState, now: number, reason: NonNullable<HalliState["result"]>["reason"]): void {
 s.phase = "FINISHED"; s.finishedAt = v.parse(ServerTimeSchema, now); s.nextTransitionAt = null; s.result = resultFor(s, reason);
}
function resetTurn(s: HalliState, now: number, token: string): void {
 s.transitionId = v.parse(TurnIdSchema, token); s.flipAvailableAt = v.parse(ServerTimeSchema, now + 1000);
 s.nextTransitionAt = v.parse(ServerTimeSchema, Math.min(now + 10_000, s.gameDeadlineAt));
}
function nextPlayer(s: HalliState, after: PlayerId): PlayerId {
 const start = s.players.findIndex(p => p.playerId === after);
 for (let offset = 1; offset <= s.players.length; offset++) { const p = s.players[(start + offset) % s.players.length]!; if (!p.eliminated) return p.playerId; }
 return after;
}
function settle(s: HalliState, now: number): void {
 for (const p of s.players) p.eliminated = p.deck.length === 0;
 if (s.players.filter(p => !p.eliminated).length <= 1) finish(s, now, "LAST_PLAYER");
}
export function createHalliGame(input: { gameId: string; playerIds: readonly PlayerId[]; deck: readonly HalliCard[]; now: number; transitionId: string }): HalliState {
 const players = input.playerIds.map(playerId => ({ playerId, deck: [] as HalliCard[], discard: [] as HalliCard[], eliminated: false, lastBellAt: null }));
 if (players.length < 2 || players.length > 6) throw new Error("HALLI requires 2–6 players.");
 input.deck.forEach((c, i) => players[i % players.length]!.deck.push({ ...c }));
 return parseHalliState({ gameId: input.gameId, rulesVersion: "halli-galli-v1", revision: 0, phase: "PLAYING", startedAt: input.now, finishedAt: null,
 gameDeadlineAt: input.now + 900_000, transitionId: input.transitionId, nextTransitionAt: input.now + 10_000, flipAvailableAt: input.now + 1000,
 activePlayerId: players[0]!.playerId, players, feedback: null, result: null });
}
export function hasFive(s: HalliState): boolean {
 return HALLI_FRUITS.some(fruit => s.players.reduce((n, p) => { const card = p.discard.at(-1); return n + (card?.fruit === fruit ? card.count : 0); }, 0) === 5);
}
function collect(s: HalliState, playerId: PlayerId): number {
 const p = s.players.find(p => p.playerId === playerId)!; const cards = s.players.flatMap(p => p.discard);
 for (const p of s.players) p.discard = [];
 p.deck.push(...cards); return cards.length;
}
export function flipHalli(state: HalliState, actor: PlayerId, now: number, token: string, automatic = false): HalliState | null {
 if (state.phase !== "PLAYING" || state.activePlayerId !== actor || now >= state.gameDeadlineAt || (!automatic && (now < state.flipAvailableAt || now >= state.nextTransitionAt!))) return null;
 const s = parseHalliState(state), p = s.players.find(p => p.playerId === actor)!;
 const card = p.deck.shift(); if (!card) return null;
 p.discard.push(card); s.revision = v.parse(GameRevisionSchema, s.revision + 1);
 s.feedback = { playerId: actor, kind: automatic ? "AUTO" : "FLIP", cards: 1, at: v.parse(ServerTimeSchema, now) };
 settle(s, now);
 if (s.phase === "PLAYING") { s.activePlayerId = nextPlayer(s, actor); resetTurn(s, now, token); }
 return parseHalliState(s);
}
export function ringHalli(state: HalliState, actor: PlayerId, now: number, token: string): HalliState | null {
 const original = state.players.find(p => p.playerId === actor);
 if (state.phase !== "PLAYING" || !original || original.eliminated || now >= state.nextTransitionAt! || (original.lastBellAt !== null && now - original.lastBellAt < 700)) return null;
 const s = parseHalliState(state), p = s.players.find(p => p.playerId === actor)!;
 p.lastBellAt = v.parse(ServerTimeSchema, now);
 const correct = hasFive(s), final = s.players.filter(p => !p.eliminated).length === 2;
 let cards = 0;
 if (correct) { cards = collect(s, actor); s.activePlayerId = actor; }
 else if (final) { cards = collect(s, s.players.find(p => !p.eliminated && p.playerId !== actor)!.playerId); }
 else {
  const start = s.players.indexOf(p);
  for (let i = 1; i < s.players.length; i++) { const other = s.players[(start + i) % s.players.length]!; if (!other.eliminated) { const c = p.deck.shift(); if (c) { other.deck.push(c); cards++; } } }
 }
 s.revision = v.parse(GameRevisionSchema, s.revision + 1); s.feedback = { playerId: actor, kind: correct ? "CORRECT" : "WRONG", cards, at: v.parse(ServerTimeSchema, now) };
 settle(s, now);
 if (final) finish(s, now, "FINAL_BELL");
 if (s.phase === "PLAYING") { if (s.players.find(p => p.playerId === s.activePlayerId)!.eliminated) s.activePlayerId = nextPlayer(s, s.activePlayerId); resetTurn(s, now, token); }
 return parseHalliState(s);
}
export function timeoutHalli(state: HalliState, now: number, token: string): HalliState | null {
 if (state.phase !== "PLAYING" || now < state.nextTransitionAt!) return null;
 if (now >= state.gameDeadlineAt) { const s = parseHalliState(state); s.revision = v.parse(GameRevisionSchema, s.revision + 1); finish(s, now, "TIME_LIMIT"); return parseHalliState(s); }
 return flipHalli(state, state.activePlayerId, now, token, true);
}
export function cancelHalli(state: HalliState, now: number): HalliState {
 const s = parseHalliState(state); s.revision = v.parse(GameRevisionSchema, s.revision + 1); finish(s, now, "CANCELLED"); return parseHalliState(s);
}
