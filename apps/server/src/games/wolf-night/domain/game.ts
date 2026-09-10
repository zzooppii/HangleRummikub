import * as v from "valibot";
import { PlayerIdSchema, GameIdSchema, TurnIdSchema, WolfRoleSchema, WolfSettingsSchema, WolfDeckSchema, WolfStageSchema,
  WolfObservationSchema, WolfResultSchema, WolfTextSchema, WOLF_NIGHT_ORDER, defaultWolfDeck,
  type WolfRole, type WolfAction, type WolfSettings, type WolfStage, type PlayerId } from "@hangul-rummikub/shared";

const Nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const CardSchema = v.strictObject({ id: Nat, role: WolfRoleSchema, copiedRole: v.nullable(WolfRoleSchema) });
const PlayerSchema = v.strictObject({ playerId: PlayerIdSchema, originalRole: WolfRoleSchema, copiedRole: v.nullable(WolfRoleSchema), card: CardSchema,
  actionRevision: Nat, done: v.boolean(), observations: v.pipe(v.array(WolfObservationSchema), v.maxLength(30)), votedFor: v.nullable(PlayerIdSchema), lastSaidAt: v.nullable(Nat) });
const Shape = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal("wolf-night-v1"), revision: Nat,
  settings: WolfSettingsSchema, deck: WolfDeckSchema, players: v.pipe(v.array(PlayerSchema), v.minLength(3), v.maxLength(10)),
  center: v.tuple([CardSchema, CardSchema, CardSchema]), phase: v.picklist(["PLAYING", "FINISHED"]), stage: WolfStageSchema,
  transitionId: TurnIdSchema, startedAt: Nat, phaseStartedAt: Nat, nextTransitionAt: v.nullable(Nat), finishedAt: v.nullable(Nat), result: v.nullable(WolfResultSchema),
  messages: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, text: WolfTextSchema, at: Nat })), v.maxLength(100)) });
export type WolfState = v.InferOutput<typeof Shape>;
type Player = WolfState["players"][number];
type Card = Player["card"];
function invariant(ok: boolean): asserts ok { if (!ok) throw new Error("Invalid WOLF_NIGHT state."); }
export function effectiveRole(card: Card): WolfRole { return card.role === "DOPPELGANGER" ? card.copiedRole ?? "DOPPELGANGER" : card.role; }
export function parseWolfState(value: unknown): WolfState {
  const s = v.parse(Shape, value), ids = s.players.map(p => p.playerId), cards = [...s.players.map(p => p.card), ...s.center];
  invariant(new Set(ids).size === ids.length && s.deck.length === ids.length + 3);
  invariant(new Set(cards.map(c => c.id)).size === cards.length && cards.every(c => c.id < cards.length && c.role === s.deck[c.id]));
  invariant(cards.every(c => c.copiedRole === null || c.role === "DOPPELGANGER" && c.copiedRole !== "DOPPELGANGER"));
  invariant(s.players.every(p => (p.copiedRole === null || p.originalRole === "DOPPELGANGER" && p.copiedRole !== "DOPPELGANGER") &&
    (p.votedFor === null || p.votedFor !== p.playerId && ids.includes(p.votedFor))));
  invariant(s.players.every((p, i) => p.originalRole === s.deck[i]));
  invariant(s.settings.roles === null || [...s.settings.roles].sort().join() === [...s.deck].sort().join());
  const originalDoppel = s.players.find(p => p.originalRole === "DOPPELGANGER");
  invariant(cards.every(c => c.role !== "DOPPELGANGER" || c.copiedRole === (originalDoppel?.copiedRole ?? null)));
  invariant(s.stage === "FINISHED" || stages(s).includes(s.stage));
  invariant(s.phaseStartedAt >= s.startedAt && s.messages.every(m => ids.includes(m.playerId) && m.at >= s.startedAt));
  invariant(s.phase === "FINISHED" ? s.stage === "FINISHED" && s.result !== null && s.finishedAt !== null && s.nextTransitionAt === null
    : s.stage !== "FINISHED" && s.result === null && s.finishedAt === null && s.nextTransitionAt !== null && s.nextTransitionAt > s.phaseStartedAt);
  if (s.result) {
    const expected = resultFor(s, s.result.reason);
    invariant(JSON.stringify(s.result) === JSON.stringify(expected));
  }
  return s;
}
/** Application supplies an already shuffled deck; card identity stays server-only. */
export function createWolfGame(input: { gameId: WolfState["gameId"]; playerIds: readonly PlayerId[]; settings: WolfSettings; deck: WolfRole[]; now: number; transitionId: WolfState["transitionId"] }): WolfState {
  const selected = input.settings.roles ?? defaultWolfDeck(input.playerIds.length);
  invariant([...selected].sort().join() === [...input.deck].sort().join());
  const cards = input.deck.map((role, id) => ({ id, role, copiedRole: null }));
  return parseWolfState({ gameId: input.gameId, rulesVersion: "wolf-night-v1", revision: 0, settings: input.settings, deck: input.deck,
    players: input.playerIds.map((playerId, i) => ({ playerId, originalRole: cards[i]!.role, copiedRole: null, card: cards[i], actionRevision: 0, done: false, observations: [], votedFor: null, lastSaidAt: null })),
    center: cards.slice(input.playerIds.length), phase: "PLAYING", stage: "REVEAL", transitionId: input.transitionId, startedAt: input.now,
    phaseStartedAt: input.now, nextTransitionAt: input.now + 15_000, finishedAt: null, result: null, messages: [] });
}
function nightRole(p: Player): WolfRole { return p.originalRole === "DOPPELGANGER" ? p.copiedRole ?? "DOPPELGANGER" : p.originalRole; }
function actors(s: WolfState, role: WolfRole): Player[] { return s.players.filter(p => nightRole(p) === role); }
function note(p: Player, label: Player["observations"][number]["label"], playerIds: PlayerId[] = [], cards: { location: string; role: WolfRole }[] = []) { p.observations.push({ label, playerIds, cards }); }
const immediate = (r: WolfRole) => ["SEER", "ROBBER", "TROUBLEMAKER", "DRUNK"].includes(r);
/** Only an actor's original night identity permits actions, never a stolen card. */
export function actionRole(s: WolfState, p: Player): WolfRole | null {
  if (s.phase !== "PLAYING" || p.done) return null;
  if (s.stage === "DOPPELGANGER" && p.originalRole === "DOPPELGANGER") return p.copiedRole === null ? "DOPPELGANGER" : immediate(p.copiedRole) ? p.copiedRole : null;
  if (s.stage === "WEREWOLF" && nightRole(p) === "WEREWOLF" && actors(s, "WEREWOLF").length === 1) return "WEREWOLF";
  if (p.originalRole !== "DOPPELGANGER" && s.stage === p.originalRole && immediate(p.originalRole)) return p.originalRole;
  return null;
}
export function canPass(role: WolfRole | null): boolean { return role !== null && role !== "DOPPELGANGER" && role !== "DRUNK"; }
function applyAction(s: WolfState, p: Player, action: WolfAction): boolean {
  const role = actionRole(s, p);
  if (!role) return false;
  if (action.type === "PASS") {
    if (!canPass(role)) return false;
    note(p, "PASSED"); p.done = true; p.actionRevision++; return true;
  }
  const targets = action.type === "PLAYERS" ? action.playerIds.map(id => s.players.find(x => x.playerId === id)) : [];
  if (targets.some(x => !x || x.playerId === p.playerId) || new Set(targets).size !== targets.length) return false;
  const one = targets.length === 1 ? targets[0] : undefined;
  if (role === "DOPPELGANGER" && one) {
    p.copiedRole = one.card.role; p.card.copiedRole = one.card.role;
    note(p, "COPY", [one.playerId], [{ location: one.playerId, role: one.card.role }]);
    if (p.copiedRole === "MINION") note(p, "WOLVES", actors(s, "WEREWOLF").map(x => x.playerId));
    p.done = !immediate(p.copiedRole);
  } else if (role === "SEER" && one) note(p, "SEEN", [], [{ location: one.playerId, role: one.card.role }]);
  else if ((role === "SEER" || role === "WEREWOLF") && action.type === "CENTER" && action.indices.length === (role === "SEER" ? 2 : 1)) {
    note(p, "SEEN", [], action.indices.map(i => ({ location: `center:${i}`, role: s.center[i]!.role })));
  } else if (role === "ROBBER" && one) {
    [p.card, one.card] = [one.card, p.card]; note(p, "SWAPPED", [one.playerId], [{ location: p.playerId, role: p.card.role }]);
  } else if (role === "TROUBLEMAKER" && targets.length === 2 && targets[0] && targets[1]) {
    [targets[0].card, targets[1].card] = [targets[1].card, targets[0].card]; note(p, "SWAPPED", [targets[0].playerId, targets[1].playerId]);
  } else if (role === "DRUNK" && action.type === "CENTER" && action.indices.length === 1) {
    const i = action.indices[0]!; const previous = p.card; p.card = s.center[i]!; s.center[i] = previous;
    note(p, "SWAPPED", [], []); // Deliberately no new role in the observation.
  } else return false;
  if (role !== "DOPPELGANGER") p.done = true;
  p.actionRevision++; return true;
}
export function actWolf(previous: WolfState, playerId: PlayerId, phaseId: string, expectedActionRevision: number, action: WolfAction, now: number): { ok: true; state: WolfState } | { ok: false; reason: "STALE" | "INVALID" } {
  const s = parseWolfState(previous), p = s.players.find(x => x.playerId === playerId);
  if (s.phase !== "PLAYING" || s.transitionId !== phaseId || now >= s.nextTransitionAt! || !p || p.actionRevision !== expectedActionRevision) return { ok: false, reason: "STALE" };
  if (!applyAction(s, p, action)) return { ok: false, reason: "INVALID" };
  s.revision++; return { ok: true, state: parseWolfState(s) };
}
function stages(s: WolfState): WolfStage[] {
  return ["REVEAL", ...WOLF_NIGHT_ORDER.filter(r => r === "DOPPEL_INSOMNIAC" ? s.deck.includes("DOPPELGANGER") && s.deck.includes("INSOMNIAC") : s.deck.includes(r)), "DISCUSSION", "VOTE"];
}
function enterStage(s: WolfState) {
  for (const p of s.players) {
    p.done = false; p.actionRevision++;
    if (s.stage === "WEREWOLF" && nightRole(p) === "WEREWOLF") note(p, "WOLVES", actors(s, "WEREWOLF").filter(x => x !== p).map(x => x.playerId));
    if (s.stage === "MINION" && p.originalRole === "MINION") note(p, "WOLVES", actors(s, "WEREWOLF").map(x => x.playerId));
    if (s.stage === "MASON" && nightRole(p) === "MASON") note(p, "MASONS", actors(s, "MASON").filter(x => x !== p).map(x => x.playerId));
    if (s.stage === "INSOMNIAC" && p.originalRole === "INSOMNIAC" || s.stage === "DOPPEL_INSOMNIAC" && p.originalRole === "DOPPELGANGER" && p.copiedRole === "INSOMNIAC") {
      note(p, "SEEN", [], [{ location: p.playerId, role: p.card.role }]);
    }
  }
}
/** Caller supplies bounded random indices for mandatory timeout choices. */
export function advanceWolf(previous: WolfState, now: number, nextToken: WolfState["transitionId"], playerSample: number, centerSample: number): WolfState {
  const s = parseWolfState(previous);
  invariant(s.phase === "PLAYING" && now >= s.nextTransitionAt! && nextToken !== s.transitionId);
  invariant(Number.isInteger(playerSample) && playerSample >= 0 && playerSample < s.players.length - 1 && Number.isInteger(centerSample) && centerSample >= 0 && centerSample < 3);
  for (const p of s.players) {
    if (actionRole(s, p) === "DOPPELGANGER") {
      const other = s.players.filter(x => x !== p)[playerSample]!;
      invariant(applyAction(s, p, { type: "PLAYERS", playerIds: [other.playerId] })); note(p, "AUTO");
    }
    if (actionRole(s, p) === "DRUNK") { invariant(applyAction(s, p, { type: "CENTER", indices: [centerSample] })); note(p, "AUTO"); }
  }
  if (s.stage === "VOTE") return finish(s, now, "VOTED");
  const order = stages(s), next = order[order.indexOf(s.stage) + 1]; invariant(next !== undefined);
  s.stage = next; s.phaseStartedAt = now; s.transitionId = nextToken;
  s.nextTransitionAt = now + (next === "DISCUSSION" ? s.settings.discussionSeconds * 1000 : next === "VOTE" || next === "DOPPELGANGER" ? 45_000 : 10_000);
  enterStage(s); s.revision++; return parseWolfState(s);
}
function resultFor(s: WolfState, reason: "VOTED" | "CANCELLED"): v.InferOutput<typeof WolfResultSchema> {
  const rows = s.players.map(p => ({ playerId: p.playerId, originalRole: p.originalRole, finalRole: p.card.role, effectiveRole: effectiveRole(p.card), votedFor: p.votedFor,
    votesReceived: s.players.filter(x => x.votedFor === p.playerId).length }));
  const dead = new Set<PlayerId>(), highest = Math.max(...rows.map(r => r.votesReceived));
  if (reason === "VOTED" && highest > 1) rows.filter(r => r.votesReceived === highest).forEach(r => dead.add(r.playerId));
  let count = -1;
  while (count !== dead.size) { count = dead.size; rows.forEach(r => { if (dead.has(r.playerId) && r.effectiveRole === "HUNTER" && r.votedFor) dead.add(r.votedFor); }); }
  const wolves = rows.filter(r => r.effectiveRole === "WEREWOLF"), minions = rows.filter(r => r.effectiveRole === "MINION");
  const wolfDead = wolves.some(r => dead.has(r.playerId)), tannerWins = rows.some(r => r.effectiveRole === "TANNER" && dead.has(r.playerId));
  const villageWins = reason === "VOTED" && (wolfDead || wolves.length === 0 && dead.size === 0);
  const wolvesWin = reason === "VOTED" && !wolfDead && !tannerWins && (wolves.length > 0 || minions.length > 0 && rows.some(r => r.effectiveRole !== "MINION" && dead.has(r.playerId)));
  return { reason, eliminatedPlayerIds: [...dead], winnerPlayerIds: rows.filter(r => reason === "VOTED" && (r.effectiveRole === "TANNER" ? dead.has(r.playerId) : r.effectiveRole === "WEREWOLF" || r.effectiveRole === "MINION" ? wolvesWin : villageWins)).map(r => r.playerId), villageWins, wolvesWin, tannerWins,
    players: rows, center: [s.center[0].role, s.center[1].role, s.center[2].role] };
}
function finish(s: WolfState, now: number, reason: "VOTED" | "CANCELLED"): WolfState {
  s.phase = "FINISHED"; s.stage = "FINISHED"; s.nextTransitionAt = null; s.finishedAt = now; s.result = resultFor(s, reason); s.revision++;
  return parseWolfState(s);
}
export function cancelWolf(previous: WolfState, now: number): WolfState { return finish(parseWolfState(previous), now, "CANCELLED"); }
export function voteWolf(previous: WolfState, playerId: PlayerId, target: PlayerId, phaseId: string, now: number): WolfState | null {
  const s = parseWolfState(previous), p = s.players.find(x => x.playerId === playerId);
  if (s.stage !== "VOTE" || s.transitionId !== phaseId || now >= s.nextTransitionAt! || !p || p.votedFor !== null || target === playerId || !s.players.some(x => x.playerId === target)) return null;
  p.votedFor = target;
  if (s.players.every(x => x.votedFor !== null)) return finish(s, now, "VOTED");
  s.revision++; return parseWolfState(s);
}
export function sayWolf(previous: WolfState, playerId: PlayerId, text: string, phaseId: string, now: number): WolfState | null {
  const s = parseWolfState(previous), p = s.players.find(x => x.playerId === playerId), parsed = v.safeParse(WolfTextSchema, text);
  if (s.stage !== "DISCUSSION" || s.transitionId !== phaseId || now >= s.nextTransitionAt! || !p || !parsed.success || p.lastSaidAt !== null && now - p.lastSaidAt < 1000) return null;
  p.lastSaidAt = now; s.messages.push({ playerId, text: parsed.output, at: now }); s.messages = s.messages.slice(-100); s.revision++;
  return parseWolfState(s);
}
