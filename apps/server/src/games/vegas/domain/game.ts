import * as v from "valibot";
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, VegasActionSchema, VegasFaceSchema, VegasNoteSchema, VegasPlayerSchema, VegasResultSchema, VegasRoundResultSchema, VegasFeedbackSchema, VegasPlayingProjectionSchema, VegasFinishedProjectionSchema, VEGAS_TURN_DURATION_MS, VEGAS_FACES, vegasPayout, vegasProjectionIsConsistent, type GameId, type PlayerId, type TurnId, type ServerTime, type VegasAction, type VegasFace, type VegasProjection, type VegasRoundResult, } from "@hangul-rummikub/shared";
export type VegasRandom = {
    nextInt(upperBound: number): number;
};
const notes = v.pipe(v.array(VegasNoteSchema), v.maxLength(54));
const StateSchema = v.strictObject({ rulesVersion: v.literal("vegas-base-v1"), gameId: GameIdSchema, revision: GameRevisionSchema, startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema),
    phase: v.picklist(["PLAYING", "FINISHED"]), round: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(4)), transitionId: TurnIdSchema,
    activePlayerId: PlayerIdSchema, roundStarterId: PlayerIdSchema, turnStartedAt: ServerTimeSchema, deadlineAt: v.nullable(ServerTimeSchema),
    turnStage: v.picklist(["AWAITING_ROLL", "AWAITING_PLACEMENT"]), rolled: v.pipe(v.array(VegasFaceSchema), v.maxLength(8)),
    players: v.pipe(v.array(v.strictObject({ ...VegasPlayerSchema.entries, banknotes: notes })), v.minLength(2), v.maxLength(5)),
    deck: notes, casinos: v.pipe(v.array(notes), v.length(6)), lastRound: v.nullable(VegasRoundResultSchema), feedback: v.nullable(VegasFeedbackSchema), result: v.nullable(VegasResultSchema),
});
export type VegasState = v.InferOutput<typeof StateSchema>;
export const VEGAS_BANK = [6, 8, 8, 6, 6, 5, 5, 5, 5].flatMap((count, i) => Array.from({ length: count }, () => v.parse(VegasNoteSchema, (i + 1) * 10000)));
function pick(random: VegasRandom, bound: number) { const n = random.nextInt(bound); if (!Number.isInteger(n) || n < 0 || n >= bound)
    throw new Error('Invalid random source.'); return n; }
function fund(s: VegasState) {
    s.casinos = VEGAS_FACES.map(() => []);
    for (const casino of s.casinos)
        while (casino.reduce((a, b) => a + b, 0) < 50000) {
            const note = s.deck.shift();
            if (note === undefined)
                throw new Error('Vegas bank exhausted.');
            casino.push(note);
        }
}
export function publicVegas(s: VegasState, viewer: PlayerId): VegasProjection {
    const own = s.players.find(p => p.playerId === viewer);
    if (!own)
        throw new Error('Vegas viewer missing.');
    const base = { gameType: 'VEGAS', gameId: s.gameId, gameRevision: s.revision, rulesVersion: s.rulesVersion, round: s.round, casinos: s.casinos,
        playerStates: s.players.map(({ playerId, remainingDice, casinoDice }) => ({ playerId, remainingDice, casinoDice })), roundStarterId: s.roundStarterId, viewerPlayerId: viewer, ownBanknotes: own.banknotes, lastRound: s.lastRound, feedback: s.feedback };
    return s.phase === 'PLAYING' ? v.parse(VegasPlayingProjectionSchema, { ...base, phase: s.phase, turnId: s.transitionId, activePlayerId: s.activePlayerId, turnStartedAt: s.turnStartedAt, deadlineAt: s.deadlineAt, turnStage: s.turnStage, rolled: s.rolled })
        : v.parse(VegasFinishedProjectionSchema, { ...base, phase: s.phase, result: s.result });
}
export function parseVegasState(raw: unknown): VegasState {
    const s = v.parse(StateSchema, raw), players = new Set(s.players.map(p => p.playerId));
    if (players.size !== s.players.length || !players.has(s.activePlayerId) || !players.has(s.roundStarterId))
        throw new Error('Vegas roster invalid.');
    const all = [...s.deck, ...s.casinos.flat(), ...s.players.flatMap(p => p.banknotes)];
    if (all.length !== 54 || VEGAS_BANK.some(note => all.filter(n => n === note).length !== VEGAS_BANK.filter(n => n === note).length))
        throw new Error('Vegas bank conservation.');
    if (s.players.some(p => p.remainingDice + p.casinoDice.reduce((a, b) => a + b, 0) !== 8))
        throw new Error('Vegas dice conservation.');
    if (s.phase === 'PLAYING' ? (s.finishedAt !== null || s.result !== null || s.deadlineAt === null) : (s.finishedAt === null || s.result === null || s.deadlineAt !== null))
        throw new Error('Vegas lifecycle mismatch.');
    if (!vegasProjectionIsConsistent(publicVegas(s, s.players[0]!.playerId)))
        throw new Error('Vegas projection inconsistent.');
    if (s.phase === 'FINISHED' && s.result?.reason === 'FOUR_ROUNDS' && (s.players.some(p => p.remainingDice !== 0) || s.casinos.some(c => c.length !== 0) || s.result.scores.some(p => { const owner = s.players.find(a => a.playerId === p.playerId)!; return p.total !== owner.banknotes.reduce((a, b) => a + b, 0) || p.banknoteCount !== owner.banknotes.length; })))
        throw new Error('Vegas result inconsistent.');
    return s;
}
export function createVegasGame(input: {
    gameId: GameId;
    playerIds: readonly PlayerId[];
    now: ServerTime;
    turnId: TurnId;
    starter: number;
    random: VegasRandom;
}): VegasState {
    if (input.playerIds.length < 2 || input.playerIds.length > 5 || new Set(input.playerIds).size !== input.playerIds.length || !input.playerIds[input.starter])
        throw new Error('Vegas player count.');
    const deck = [...VEGAS_BANK];
    for (let i = deck.length - 1; i > 0; i--) {
        const j = pick(input.random, i + 1);
        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }
    const s: VegasState = { rulesVersion: 'vegas-base-v1', gameId: input.gameId, revision: v.parse(GameRevisionSchema, 0), startedAt: input.now, finishedAt: null, phase: 'PLAYING', round: 1, transitionId: input.turnId,
        activePlayerId: input.playerIds[input.starter]!, roundStarterId: input.playerIds[input.starter]!, turnStartedAt: input.now, deadlineAt: v.parse(ServerTimeSchema, input.now + VEGAS_TURN_DURATION_MS), turnStage: 'AWAITING_ROLL', rolled: [],
        players: input.playerIds.map(playerId => ({ playerId, remainingDice: 8, casinoDice: [0, 0, 0, 0, 0, 0], banknotes: [] })), deck, casinos: [], lastRound: null, feedback: null, result: null };
    fund(s);
    return parseVegasState(s);
}
function roll(s: VegasState, random: VegasRandom) { const p = s.players.find(p => p.playerId === s.activePlayerId)!; s.rolled = Array.from({ length: p.remainingDice }, () => VEGAS_FACES[pick(random, 6)]!); s.turnStage = 'AWAITING_PLACEMENT'; }
function settle(s: VegasState, now: ServerTime) {
    const casinos: VegasRoundResult['casinos'] = s.casinos.map((notes, i) => {
        const counts = s.players.map(p => p.casinoDice[i]!), payout = vegasPayout(counts, notes);
        const awards = payout.awards.map(a => { const p = s.players[a.playerIndex]!, amount = v.parse(VegasNoteSchema, a.amount); p.banknotes.push(amount); return { playerId: p.playerId, amount }; });
        const returned = payout.returned.map(n => v.parse(VegasNoteSchema, n));
        s.deck.push(...returned);
        return { face: VEGAS_FACES[i]!, counts, excludedPlayerIds: s.players.filter((_, j) => payout.excluded[j]).map(p => p.playerId), awards, returned };
    });
    s.lastRound = { round: s.round, casinos };
    s.casinos = VEGAS_FACES.map(() => []);
    if (s.round === 4) {
        const scores = s.players.map(p => ({ playerId: p.playerId, total: p.banknotes.reduce((a, b) => a + b, 0), banknoteCount: p.banknotes.length }));
        const best = [...scores].sort((a, b) => b.total - a.total || b.banknoteCount - a.banknoteCount)[0]!;
        s.result = { reason: 'FOUR_ROUNDS', scores, winnerPlayerIds: scores.filter(p => p.total === best.total && p.banknoteCount === best.banknoteCount).map(p => p.playerId) };
        s.phase = 'FINISHED';
        s.finishedAt = now;
        s.deadlineAt = null;
        return;
    }
    s.round++;
    s.roundStarterId = s.players[(s.players.findIndex(p => p.playerId === s.roundStarterId) + 1) % s.players.length]!.playerId;
    s.activePlayerId = s.roundStarterId;
    for (const p of s.players) {
        p.remainingDice = 8;
        p.casinoDice = [0, 0, 0, 0, 0, 0];
    }
    fund(s);
}
function place(s: VegasState, face: VegasFace, now: ServerTime, nextTurnId: TurnId, automatic: boolean) {
    const p = s.players.find(p => p.playerId === s.activePlayerId)!, count = s.rolled.filter(n => n === face).length;
    if (count === 0)
        throw new Error('Missing selected face.');
    p.remainingDice -= count;
    p.casinoDice[face - 1]! += count;
    s.rolled = [];
    s.turnStage = 'AWAITING_ROLL';
    s.feedback = { kind: 'PLACE', playerId: p.playerId, face, count, automatic, at: now };
    if (s.players.every(p => p.remainingDice === 0))
        settle(s, now);
    else {
        const at = s.players.indexOf(p);
        for (let offset = 1; offset <= s.players.length; offset++) {
            const next = s.players[(at + offset) % s.players.length]!;
            if (next.remainingDice > 0) {
                s.activePlayerId = next.playerId;
                break;
            }
        }
    }
    s.transitionId = nextTurnId;
    if (s.phase === 'PLAYING') {
        s.turnStartedAt = now;
        s.deadlineAt = v.parse(ServerTimeSchema, now + VEGAS_TURN_DURATION_MS);
    }
}
export function applyVegasAction(state: VegasState, actor: PlayerId, raw: VegasAction, now: ServerTime, nextTurnId: TurnId, random: VegasRandom): {
    ok: true;
    state: VegasState;
} | {
    ok: false;
    reason: 'INVALID_ACTION' | 'INVALID_PHASE' | 'NOT_YOUR_TURN' | 'TURN_EXPIRED';
} {
    if (state.phase !== 'PLAYING')
        return { ok: false, reason: 'INVALID_PHASE' };
    if (actor !== state.activePlayerId)
        return { ok: false, reason: 'NOT_YOUR_TURN' };
    if (state.deadlineAt === null || now >= state.deadlineAt)
        return { ok: false, reason: 'TURN_EXPIRED' };
    const parsed = v.safeParse(VegasActionSchema, raw);
    if (!parsed.success)
        return { ok: false, reason: 'INVALID_ACTION' };
    const action = parsed.output;
    if (action.kind === 'ROLL' ? state.turnStage !== 'AWAITING_ROLL' : state.turnStage !== 'AWAITING_PLACEMENT' || !state.rolled.includes(action.face))
        return { ok: false, reason: 'INVALID_ACTION' };
    const s = parseVegasState(state);
    if (action.kind === 'ROLL') {
        roll(s, random);
        s.feedback = { kind: 'ROLL', playerId: actor, face: null, count: s.rolled.length, automatic: false, at: now };
    }
    else
        place(s, action.face, now, nextTurnId, false);
    s.revision = v.parse(GameRevisionSchema, state.revision + 1);
    return { ok: true, state: parseVegasState(s) };
}
export function timeoutVegas(state: VegasState, now: ServerTime, nextTurnId: TurnId, random: VegasRandom): VegasState | null {
    if (state.phase !== 'PLAYING' || state.deadlineAt === null || now < state.deadlineAt)
        return null;
    const s = parseVegasState(state);
    if (s.turnStage === 'AWAITING_ROLL')
        roll(s, random);
    const faces = VEGAS_FACES.filter(f => s.rolled.includes(f));
    place(s, faces[pick(random, faces.length)]!, now, nextTurnId, true);
    s.revision = v.parse(GameRevisionSchema, state.revision + 1);
    return parseVegasState(s);
}
export function cancelVegas(state: VegasState, now: ServerTime): VegasState { const s = parseVegasState(state); s.phase = 'FINISHED'; s.finishedAt = now; s.deadlineAt = null; s.result = { reason: 'CANCELLED', winnerPlayerIds: [], scores: [] }; s.revision = v.parse(GameRevisionSchema, s.revision + 1); return parseVegasState(s); }
