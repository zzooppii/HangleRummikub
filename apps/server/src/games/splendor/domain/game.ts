import * as v from "valibot";
import {
  GameIdSchema,
  PlayerIdSchema,
  TurnIdSchema,
  ServerTimeSchema,
  GameRevisionSchema,
  SplendorCardSchema,
  SplendorCitySchema,
  SPLENDOR_CITY_TILES,
  meetsSplendorCity,
  type SplendorCity,
  SplendorNobleSchema,
  SplendorTokensSchema,
  SplendorCardIdSchema,
  SplendorTierSchema,
  SplendorFeedbackSchema,
  SplendorResultSchema,
  SplendorActionSchema,
  SPLENDOR_COLORS,
  SPLENDOR_TOKENS,
  type SplendorCard,
  type SplendorTokens,
  type SplendorCost,
  type SplendorAction,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { makeSplendorCards, SPLENDOR_NOBLES } from "./catalog.js";
export const SPLENDOR_TURN_MS = 90_000;
export const emptyTokens = (): SplendorTokens => ({
  WHITE: 0,
  BLUE: 0,
  GREEN: 0,
  RED: 0,
  BLACK: 0,
  GOLD: 0,
});
const Player = v.strictObject({
  playerId: PlayerIdSchema,
  tokens: SplendorTokensSchema,
  purchased: v.array(SplendorCardIdSchema),
  reserved: v.pipe(v.array(SplendorCardIdSchema), v.maxLength(3)),
  nobles: v.array(SplendorNobleSchema),
  cities: v.optional(v.array(SplendorCitySchema), () => []),
});
const State = v.strictObject({
  gameId: GameIdSchema,
  rulesVersion: v.picklist(["splendor-base-v1", "splendor-cities-2017-v1"]),
  revision: GameRevisionSchema,
  phase: v.picklist(["PLAYING", "FINISHED"]),
  startedAt: ServerTimeSchema,
  finishedAt: v.nullable(ServerTimeSchema),
  transitionId: TurnIdSchema,
  nextTransitionAt: v.nullable(ServerTimeSchema),
  activePlayerId: PlayerIdSchema,
  round: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  finalRound: v.boolean(),
  noProgress: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  cards: v.pipe(v.array(SplendorCardSchema), v.length(90)),
  market: v.pipe(
    v.array(
      v.strictObject({
        tier: SplendorTierSchema,
        slots: v.pipe(v.array(v.nullable(SplendorCardIdSchema)), v.length(4)),
        deck: v.array(SplendorCardIdSchema),
      }),
    ),
    v.length(3),
  ),
  bank: SplendorTokensSchema,
  nobles: v.array(SplendorNobleSchema),
  cities: v.optional(v.array(SplendorCitySchema), () => []),
  players: v.pipe(v.array(Player), v.minLength(2), v.maxLength(4)),
  feedback: SplendorFeedbackSchema,
  result: v.nullable(SplendorResultSchema),
});
export type SplendorState = v.InferOutput<typeof State>;
export type SplendorPlayer = SplendorState["players"][number];
export function cardFor(s: SplendorState, id: string): SplendorCard {
  const card = s.cards.find((c) => c.cardId === id);
  if (!card) throw new Error("Invalid SPLENDOR internal card reference.");
  return card;
}
export function bonusesFor(s: SplendorState, p: SplendorPlayer): SplendorCost {
  const b = { WHITE: 0, BLUE: 0, GREEN: 0, RED: 0, BLACK: 0 };
  for (const id of p.purchased) b[cardFor(s, id).bonus]++;
  return b;
}
export function scoreFor(s: SplendorState, p: SplendorPlayer): number {
  return (
    p.purchased.reduce((n, id) => n + cardFor(s, id).points, 0) +
    p.nobles.length * 3
  );
}
const total = (tokens: SplendorTokens) =>
  SPLENDOR_TOKENS.reduce((n, k) => n + tokens[k], 0);
const signature = (c: SplendorCard) =>
  JSON.stringify([
    c.tier,
    c.bonus,
    c.points,
    ...SPLENDOR_COLORS.map((k) => c.cost[k]),
    c.art,
  ]);
const expectedCards = makeSplendorCards(() => "catalog-only")
  .map(signature)
  .sort();
export function resultFor(
  s: SplendorState,
  reason: NonNullable<SplendorState["result"]>["reason"],
): NonNullable<SplendorState["result"]> {
  const scores = s.players.map((p) => ({
    playerId: p.playerId,
    score: scoreFor(s, p),
    cards: p.purchased.length,
  }));
  const contenders = reason === "CITIES" ? scores.filter(score => s.players.some(p => p.playerId === score.playerId && p.cities.length > 0)) : scores;
  const ordered = [...contenders].sort(
      (a, b) => b.score - a.score || a.cards - b.cards,
    ),
    best = ordered[0]!;
  return v.parse(SplendorResultSchema, {
    reason,
    scores,
    winnerPlayerIds:
      (reason === "POINTS" || reason === "CITIES") && best
        ? ordered
            .filter((p) => p.score === best.score && p.cards === best.cards)
            .map((p) => p.playerId)
        : [],
  });
}
export function parseSplendorState(input: unknown): SplendorState {
  const s = v.parse(State, input),
    ids = s.cards.map((c) => c.cardId),
    used = s.market
      .flatMap((t) => [
        ...t.deck,
        ...t.slots.filter((id): id is NonNullable<typeof id> => id !== null),
      ])
      .concat(s.players.flatMap((p) => [...p.purchased, ...p.reserved]));
  if (
    new Set(ids).size !== 90 ||
    used.length !== 90 ||
    new Set(used).size !== 90 ||
    used.some((id) => !ids.includes(id))
  )
    throw new Error("SPLENDOR card conservation failure.");
  if (
    JSON.stringify(s.cards.map(signature).sort()) !==
    JSON.stringify(expectedCards)
  )
    throw new Error("SPLENDOR catalog mismatch.");
  if (
    s.market.some(
      (t, i) =>
        t.tier !== i + 1 ||
        [
          ...t.deck,
          ...t.slots.filter((id): id is NonNullable<typeof id> => id !== null),
        ].some((id) => cardFor(s, id).tier !== t.tier) ||
        (t.deck.length > 0 && t.slots.some((id) => id === null)),
    )
  )
    throw new Error("SPLENDOR market mismatch.");
  if (
    new Set(s.players.map((p) => p.playerId)).size !== s.players.length ||
    !s.players.some((p) => p.playerId === s.activePlayerId)
  )
    throw new Error("SPLENDOR roster mismatch.");
  const amount = s.players.length === 2 ? 4 : s.players.length === 3 ? 5 : 7;
  for (const k of SPLENDOR_TOKENS)
    if (
      s.bank[k] + s.players.reduce((n, p) => n + p.tokens[k], 0) !==
      (k === "GOLD" ? 5 : amount)
    )
      throw new Error("SPLENDOR token conservation failure.");
  if (s.players.some((p) => total(p.tokens) > 10))
    throw new Error("SPLENDOR hand limit exceeded.");
  const nobles = [...s.nobles, ...s.players.flatMap((p) => p.nobles)];
  if (
    nobles.length !== (s.rulesVersion === "splendor-base-v1" ? s.players.length + 1 : 0) ||
    new Set(nobles.map((n) => n.nobleId)).size !== nobles.length ||
    nobles.some(
      (n) =>
        JSON.stringify(n) !==
        JSON.stringify(SPLENDOR_NOBLES.find((x) => x.nobleId === n.nobleId)),
    )
  )
    throw new Error("SPLENDOR noble conservation failure.");
  if (
    s.players.some((p) =>
      p.nobles.some((n) =>
        SPLENDOR_COLORS.some((k) => bonusesFor(s, p)[k] < n.cost[k]),
      ),
    )
  )
    throw new Error("SPLENDOR unearned noble.");
  const cities = [...s.cities, ...s.players.flatMap(p => p.cities)];
  if (cities.length !== (s.rulesVersion === "splendor-base-v1" ? 0 : 3) ||
      new Set(cities.map(c => c.tile)).size !== cities.length ||
      cities.some(c => JSON.stringify(c) !== JSON.stringify(SPLENDOR_CITY_TILES.flat().find(x => x.cityId === c.cityId))) ||
      s.players.some(p => p.cities.length > 1 || p.cities.some(c => !meetsSplendorCity(c, scoreFor(s, p), bonusesFor(s, p)))))
    throw new Error("SPLENDOR city conservation or qualification failure.");
  if (s.rulesVersion === "splendor-cities-2017-v1" && s.players.some(p => p.cities.length > 0) !== s.finalRound)
    throw new Error("SPLENDOR missing city final round.");
  if (s.phase === "PLAYING") {
    if (
      s.result !== null ||
      s.finishedAt !== null ||
      s.nextTransitionAt === null
    )
      throw new Error("SPLENDOR running metadata mismatch.");
  } else if (
    s.result === null ||
    s.finishedAt === null ||
    s.nextTransitionAt !== null ||
    JSON.stringify(s.result) !== JSON.stringify(resultFor(s, s.result.reason))
  )
    throw new Error("SPLENDOR finished metadata mismatch.");
  if (
    s.result?.reason === "POINTS" &&
    (s.rulesVersion !== "splendor-base-v1" || !s.finalRound || !s.players.some((p) => scoreFor(s, p) >= 15))
  )
    throw new Error("SPLENDOR premature finish.");
  if (s.result?.reason === "CITIES" &&
      (s.rulesVersion !== "splendor-cities-2017-v1" || !s.finalRound || !s.players.some(p => p.cities.length > 0)))
    throw new Error("SPLENDOR premature city finish.");
  return s;
}
export function createSplendorGame(input: {
  gameId: string;
  playerIds: readonly PlayerId[];
  cards: readonly SplendorCard[];
  cities?: readonly SplendorCity[];
  nobles: readonly (typeof SPLENDOR_NOBLES)[number][];
  now: number;
  transitionId: string;
}): SplendorState {
  const amount =
    input.playerIds.length === 2 ? 4 : input.playerIds.length === 3 ? 5 : 7;
  return parseSplendorState({
    gameId: input.gameId,
    rulesVersion: input.cities ? "splendor-cities-2017-v1" : "splendor-base-v1",
    revision: 0,
    phase: "PLAYING",
    startedAt: input.now,
    finishedAt: null,
    transitionId: input.transitionId,
    nextTransitionAt: input.now + SPLENDOR_TURN_MS,
    activePlayerId: input.playerIds[0],
    round: 1,
    finalRound: false,
    noProgress: 0,
    cards: input.cards,
    market: [1, 2, 3].map((tier) => {
      const ids = input.cards
        .filter((c) => c.tier === tier)
        .map((c) => c.cardId);
      return { tier, slots: ids.slice(0, 4), deck: ids.slice(4) };
    }),
    bank: {
      WHITE: amount,
      BLUE: amount,
      GREEN: amount,
      RED: amount,
      BLACK: amount,
      GOLD: 5,
    },
    nobles: input.cities ? [] : input.nobles.slice(0, input.playerIds.length + 1),
    cities: input.cities ?? [],
    players: input.playerIds.map((playerId) => ({
      playerId,
      tokens: emptyTokens(),
      purchased: [],
      reserved: [],
      nobles: [],
    })),
    feedback: null,
    result: null,
  });
}
export function affordable(
  s: SplendorState,
  p: SplendorPlayer,
  c: SplendorCard,
): boolean {
  const b = bonusesFor(s, p);
  return (
    SPLENDOR_COLORS.reduce(
      (n, k) => n + Math.max(0, c.cost[k] - b[k] - p.tokens[k]),
      0,
    ) <= p.tokens.GOLD
  );
}
export function hasSplendorAction(
  s: SplendorState,
  p: SplendorPlayer,
): boolean {
  if (SPLENDOR_COLORS.some((k) => s.bank[k] > 0)) return true;
  if (
    p.reserved.length < 3 &&
    s.market.some((t) => t.deck.length > 0 || t.slots.some((id) => id !== null))
  )
    return true;
  return [
    ...p.reserved,
    ...s.market.flatMap((t) =>
      t.slots.filter((id): id is NonNullable<typeof id> => id !== null),
    ),
  ].some((id) => affordable(s, p, cardFor(s, id)));
}
function finish(
  s: SplendorState,
  now: number,
  reason: NonNullable<SplendorState["result"]>["reason"],
): void {
  s.phase = "FINISHED";
  s.finishedAt = v.parse(ServerTimeSchema, now);
  s.nextTransitionAt = null;
  s.result = resultFor(s, reason);
}
function endTurn(s: SplendorState, now: number, token: string): void {
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  if (s.rulesVersion === "splendor-base-v1" ? s.players.some((p) => scoreFor(s, p) >= 15) : s.players.some(p => p.cities.length > 0)) s.finalRound = true;
  const next =
    (s.players.findIndex((p) => p.playerId === s.activePlayerId) + 1) %
    s.players.length;
  if (s.finalRound && next === 0) {
    finish(s, now, s.rulesVersion === "splendor-base-v1" ? "POINTS" : "CITIES");
    return;
  }
  if (s.noProgress >= s.players.length * 3) {
    finish(s, now, "INACTIVE");
    return;
  }
  s.activePlayerId = s.players[next]!.playerId;
  if (next === 0) s.round++;
  s.transitionId = v.parse(TurnIdSchema, token);
  s.nextTransitionAt = v.parse(ServerTimeSchema, now + SPLENDOR_TURN_MS);
}
function removeMarket(s: SplendorState, id: string): boolean {
  for (const t of s.market) {
    const index = t.slots.findIndex((c) => c === id);
    if (index >= 0) {
      t.slots[index] = t.deck.shift() ?? null;
      return true;
    }
  }
  return false;
}
export type SplendorActionResult =
  | { ok: true; state: SplendorState }
  | {
      ok: false;
      reason:
        | "INVALID_ACTION"
        | "INVALID_PAYMENT"
        | "INVALID_RETURN"
        | "CHOOSE_NOBLE"
        | "CHOOSE_CITY"
        | "TURN_EXPIRED";
    };
export function applySplendorAction(
  state: SplendorState,
  actor: PlayerId,
  input: SplendorAction,
  now: number,
  token: string,
): SplendorActionResult {
  const parsed = v.safeParse(SplendorActionSchema, input);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const action = parsed.output;
  if (state.phase !== "PLAYING" || state.activePlayerId !== actor)
    return { ok: false, reason: "INVALID_ACTION" };
  if (state.nextTransitionAt === null || now >= state.nextTransitionAt)
    return { ok: false, reason: "TURN_EXPIRED" };
  const s = parseSplendorState(state),
    p = s.players.find((p) => p.playerId === actor)!;
  const before = scoreFor(s, p);
  switch (action.kind) {
    case "TAKE": {
      const colors = SPLENDOR_COLORS.filter((k) => action.tokens[k] > 0),
        available = SPLENDOR_COLORS.filter((k) => s.bank[k] > 0).length;
      const distinct =
        colors.length === Math.min(3, available) &&
        colors.length > 0 &&
        colors.every((k) => action.tokens[k] === 1);
      const double =
        colors.length === 1 &&
        action.tokens[colors[0]!] === 2 &&
        s.bank[colors[0]!] >= 4;
      if (
        action.tokens.GOLD !== 0 ||
        (!distinct && !double) ||
        colors.some((k) => action.tokens[k] > s.bank[k])
      )
        return { ok: false, reason: "INVALID_ACTION" };
      for (const k of colors) {
        s.bank[k] -= action.tokens[k];
        p.tokens[k] += action.tokens[k];
      }
      break;
    }
    case "BUY": {
      // Resolve ownership before looking up any hidden definition; all unauthorized references fail identically.
      const reserved = p.reserved.indexOf(action.cardId),
        market = s.market.some((t) => t.slots.includes(action.cardId));
      if (reserved < 0 && !market)
        return { ok: false, reason: "INVALID_ACTION" };
      const card = cardFor(s, action.cardId),
        bonus = bonusesFor(s, p);
      let gold = 0;
      for (const k of SPLENDOR_COLORS) {
        const need = Math.max(0, card.cost[k] - bonus[k]);
        if (action.payment[k] > need || action.payment[k] > p.tokens[k])
          return { ok: false, reason: "INVALID_PAYMENT" };
        gold += need - action.payment[k];
      }
      if (action.payment.GOLD !== gold || gold > p.tokens.GOLD)
        return { ok: false, reason: "INVALID_PAYMENT" };
      for (const k of SPLENDOR_TOKENS) {
        p.tokens[k] -= action.payment[k];
        s.bank[k] += action.payment[k];
      }
      if (reserved >= 0) p.reserved.splice(reserved, 1);
      else removeMarket(s, action.cardId);
      p.purchased.push(action.cardId);
      break;
    }
    case "RESERVE":
    case "RESERVE_DECK": {
      if (p.reserved.length >= 3)
        return { ok: false, reason: "INVALID_ACTION" };
      if (action.kind === "RESERVE") {
        if (!removeMarket(s, action.cardId))
          return { ok: false, reason: "INVALID_ACTION" };
        p.reserved.push(action.cardId);
      } else {
        const deck = s.market.find((t) => t.tier === action.tier),
          id = deck?.deck.shift();
        if (!id) return { ok: false, reason: "INVALID_ACTION" };
        p.reserved.push(id);
      }
      if (s.bank.GOLD > 0) {
        s.bank.GOLD--;
        p.tokens.GOLD++;
      }
      break;
    }
    case "PASS":
      if (hasSplendorAction(s, p))
        return { ok: false, reason: "INVALID_ACTION" };
      break;
  }
  const excess = Math.max(0, total(p.tokens) - 10);
  if (
    total(action.returns) !== excess ||
    SPLENDOR_TOKENS.some((k) => action.returns[k] > p.tokens[k])
  )
    return { ok: false, reason: "INVALID_RETURN" };
  for (const k of SPLENDOR_TOKENS) {
    p.tokens[k] -= action.returns[k];
    s.bank[k] += action.returns[k];
  }
  const bonuses = bonusesFor(s, p),
    eligible = s.nobles.filter((n) =>
      SPLENDOR_COLORS.every((k) => bonuses[k] >= n.cost[k]),
    );
  const noble =
    action.nobleId === null
      ? eligible.length === 1
        ? eligible[0]
        : undefined
      : eligible.find((n) => n.nobleId === action.nobleId);
  if ((eligible.length > 0 && !noble) || (action.nobleId !== null && !noble))
    return { ok: false, reason: "CHOOSE_NOBLE" };
  if (noble) {
    s.nobles = s.nobles.filter((n) => n.nobleId !== noble.nobleId);
    p.nobles.push(noble);
  }
  const eligibleCities = s.cities.filter(c => meetsSplendorCity(c, scoreFor(s, p), bonusesFor(s, p)));
  const city = action.cityId == null
    ? eligibleCities.length === 1 ? eligibleCities[0] : undefined
    : eligibleCities.find(c => c.cityId === action.cityId);
  if ((eligibleCities.length > 0 && !city) || (action.cityId != null && !city))
    return {ok: false, reason: "CHOOSE_CITY"};
  if (city) {
    s.cities = s.cities.filter(c => c.cityId !== city.cityId);
    p.cities.push(city);
  }
  s.noProgress = action.kind === "PASS" ? s.noProgress + 1 : 0;
  s.feedback = {
    playerId: actor,
    kind: action.kind,
    at: v.parse(ServerTimeSchema, now),
    points: scoreFor(s, p) - before,
  };
  endTurn(s, now, token);
  return { ok: true, state: parseSplendorState(s) };
}
export function timeoutSplendor(
  state: SplendorState,
  now: number,
  token: string,
): SplendorState | null {
  if (
    state.phase !== "PLAYING" ||
    state.nextTransitionAt === null ||
    now < state.nextTransitionAt
  )
    return null;
  const s = parseSplendorState(state);
  s.noProgress++;
  s.feedback = {
    playerId: s.activePlayerId,
    kind: "TIMEOUT",
    at: v.parse(ServerTimeSchema, now),
    points: 0,
  };
  endTurn(s, now, token);
  return parseSplendorState(s);
}
export function cancelSplendor(
  state: SplendorState,
  now: number,
): SplendorState {
  const s = parseSplendorState(state);
  s.revision = v.parse(GameRevisionSchema, s.revision + 1);
  finish(s, now, "CANCELLED");
  return parseSplendorState(s);
}
