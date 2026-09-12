import {
  BURGUNDY_EXPANSION_CATALOG, BURGUNDY_SHIELDS, BURGUNDY_NEIGHBORS, burgundyBoard, burgundyDefinition,
  type BurgundyAction, type BurgundyPlayer, type BurgundyPlayerExpansion,
  type BurgundyExpansion,
  type BurgundyTile, type TileId,
} from "@hangul-rummikub/shared";
import type { BurgundyState, BurgundyRandom } from "./game.js";

export class BurgundyExpansionRuleError extends Error {}
function fail(message: string): never { throw new BurgundyExpansionRuleError(message); }
export function hasBurgundyShield(player: BurgundyPlayer, id: number): boolean {
  return player.extension.shields.some(s => s.shieldId === id);
}
export function createBurgundyPlayerExpansion(): BurgundyPlayerExpansion {
  return { shields: [], shield16Used: false, tradeRoute: [], tradeRouteFilled: 0, tradeRouteGoods: [], borderConnections: [] };
}
export function createBurgundyExpansion(): BurgundyExpansion {
  return { shieldDepots: [[], [], [], [], [], []], borderFinishers: [] };
}
function shuffled<T>(items: readonly T[], random: BurgundyRandom): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    if (!Number.isInteger(j) || j < 0 || j > i) throw new Error("Invalid random source");
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}
export function initializeBurgundyExpansions(s: BurgundyState, random: BurgundyRandom): void {
  if (s.settings.shields) {
    const shields = shuffled(BURGUNDY_SHIELDS.map(shield => shield.id), random);
    s.expansion.shieldDepots = Array.from({ length: 6 }, (_, i) => shields.splice(0, s.players.length === 4 || s.players.length === 3 && i % 2 === 1 ? 2 : 1));
    s.shieldDiscard.push(...shields);
  }
  if (s.settings.tradeRoutes) {
    if (BURGUNDY_EXPANSION_CATALOG.tradeRoutes.length !== 12) fail("공식 교역로 12장 데이터가 아직 확인되지 않았습니다.");
    const routes = shuffled(BURGUNDY_EXPANSION_CATALOG.tradeRoutes, random), count = s.players.length === 2 ? 5 : s.players.length === 3 ? 4 : 3;
    for (const player of s.players) player.extension.tradeRoute = routes.splice(0, count).flatMap(route => structuredClone([...route]));
  }
}

/** Shield 6 copies actual monastery tiles, never recursively copies another shield. */
export function effectiveBurgundyKnowledge(s: BurgundyState, p: BurgundyPlayer): number[] {
  const own = p.board.flatMap(t => { const n = burgundyDefinition(t.tile).knowledge; return n ? [n] : []; });
  const targetId = p.extension.shields.find(shield => shield.shieldId === 6)?.copiedPlayerId;
  const target = targetId ? s.players.find(player => player.playerId === targetId) : undefined;
  const copied = target?.board.flatMap(t => { const n = burgundyDefinition(t.tile).knowledge; return n ? [n] : []; }) ?? [];
  return [...new Set([...own, ...copied])];
}
export function expansionGainWorkers(s: BurgundyState, p: BurgundyPlayer, amount: number): void {
  if (amount <= 0) return;
  p.workers += amount;
  // Only one physical #2 exists. A worker gained from it cannot trigger itself.
  for (const other of s.players) if (other.playerId !== p.playerId && hasBurgundyShield(other, 2)) other.workers += amount;
}
export function burgundyExpansionStorageUsed(p: BurgundyPlayer): number { return p.storage.length; }
export function burgundyExpansionStorageCapacity(p: BurgundyPlayer): number { return hasBurgundyShield(p, 4) ? Infinity : 3; }
export function burgundyExpansionAreaSize(p: BurgundyPlayer, size: number, inns: number): number { return Math.min(8, size + inns + Number(hasBurgundyShield(p, 17))); }
export function burgundyExpansionBonusPoints(p: BurgundyPlayer, points: number): number { return points * (hasBurgundyShield(p, 7) ? 2 : 1); }
export function burgundyExpansionMineSilver(p: BurgundyPlayer, mines: number): number { return mines * (hasBurgundyShield(p, 8) ? 2 : 1); }
export function burgundyExpansionKnowledgeScore(p: BurgundyPlayer, score: number): number { return score * (hasBurgundyShield(p, 10) ? 2 : 1); }

export function resolveBurgundyImmediateBonuses(s: BurgundyState, p: BurgundyPlayer): void {
  while (s.pending[0]?.type === "GAIN" || s.pending[0]?.type === "TRADE_FILL") {
    const bonus = s.pending[0]; s.pending.shift();
    if (bonus.type === "GAIN") {
      expansionGainWorkers(s, p, bonus.workers); p.silver += bonus.silver; p.score += bonus.score; p.scoreBreakdown.expansion += bonus.score;
      continue;
    }
    const extension = p.extension;
    if (bonus.remaining === 0 || extension.tradeRouteFilled >= extension.tradeRoute.length) continue;
    const space = extension.tradeRoute[extension.tradeRouteFilled++]!;
    extension.tradeRouteGoods.push(bonus.value);
    if (bonus.remaining > 1 && extension.tradeRouteFilled < extension.tradeRoute.length) s.pending.unshift({ ...bonus, remaining: bonus.remaining - 1 });
    if (space.die === bonus.value) s.pending.unshift(structuredClone(space.bonus));
  }
}
/** The 2019 border duchies reward a continuous chain linking two, then three posts. */
export function onBurgundyPlacement(s: BurgundyState, p: BurgundyPlayer): void {
  if (!s.settings.borderPosts) return;
  const board = burgundyBoard(p.boardId), groups = board.borderPostGroups;
  if (!groups) return;
  const unseen = new Set(p.board.map(t => t.cellId));
  let connectedPosts = 0;
  while (unseen.size) {
    const start = unseen.values().next().value;
    if (!start) break;
    const component = new Set([start]), queue = [start]; unseen.delete(start);
    for (const id of queue) {
      const cell = board.cells.find(c => c.id === id)!;
      for (const [dq, dr] of BURGUNDY_NEIGHBORS) {
        const next = `${cell.q + dq},${cell.r + dr}`;
        if (unseen.delete(next)) { component.add(next); queue.push(next); }
      }
    }
    connectedPosts = Math.max(connectedPosts, groups.filter(group => group.some(id => component.has(id))).length);
  }
  for (const count of [2, 3]) {
    const key = `BORDER_${count}`;
    if (connectedPosts >= count && !p.extension.borderConnections.includes(key)) {
      p.extension.borderConnections.push(key);
      const points = 10 - s.phaseIndex * 2; p.score += points; p.scoreBreakdown.phaseBonus += points;
    }
  }
  if (connectedPosts === 3 && !p.bonuses.includes("BORDER") && s.expansion.borderFinishers.length < 2 && !s.expansion.borderFinishers.includes(p.playerId)) {
    const points = burgundyExpansionBonusPoints(p, s.players.length + (s.expansion.borderFinishers.length === 0 ? 3 : 0));
    p.score += points; p.scoreBreakdown.colorBonus += points; p.bonuses.push("BORDER"); s.expansion.borderFinishers.push(p.playerId);
  }
}
/** Called after ordinary sale rewards, so only incremental shield rewards are added. */
export function onBurgundySale(s: BurgundyState, p: BurgundyPlayer, type: number, amount: number): void {
  if (hasBurgundyShield(p, 9)) p.silver += amount - (effectiveBurgundyKnowledge(s, p).includes(3) ? 2 : 1);
  if (hasBurgundyShield(p, 12)) { p.score += amount * s.players.length; p.scoreBreakdown.goodsSales += amount * s.players.length; }
  if (!s.settings.tradeRoutes) return;
  if (amount > 0 && p.extension.tradeRouteFilled < p.extension.tradeRoute.length)
    s.pending.unshift({ type: "TRADE_FILL", value: type, remaining: amount });
}

export function scoreBurgundyExpansion(_s: BurgundyState, p: BurgundyPlayer): number {
  const shieldScore = p.extension.shields.reduce((sum, shield) => sum + (BURGUNDY_SHIELDS.find(s => s.id === shield.shieldId)?.points ?? 0), 0);
  return shieldScore * (hasBurgundyShield(p, 13) ? 2 : 1);
}

export interface BurgundyExpansionCorePort {
  place(s: BurgundyState, p: BurgundyPlayer, tileId: TileId, cellId: string): void;
  store(s: BurgundyState, p: BurgundyPlayer, tile: BurgundyTile, discardId?: TileId): void;
  adjust(s: BurgundyState, p: BurgundyPlayer, from: number, to: number, discount: number): void;
}
export function applyBurgundyExpansionAction(s: BurgundyState, p: BurgundyPlayer, a: BurgundyAction, core: BurgundyExpansionCorePort): boolean {
  const pending = s.pending[0];
  switch (a.type) {
    case "SHIELD_COPY": {
      const shield = p.extension.shields.find(shield => shield.shieldId === 6);
      if (!shield || shield.copiedPlayerId !== null || a.playerId === p.playerId || !s.players.some(other => other.playerId === a.playerId)) fail("지식을 공유할 상대를 한 번 선택하세요.");
      shield.copiedPlayerId = a.playerId; return true;
    }
    case "SHIELD_DIE":
      if (!hasBurgundyShield(p, 16) || p.extension.shield16Used || p.dice[a.die].used) fail("이번 턴에 주사위를 바꿀 수 없습니다.");
      p.dice[a.die].value = a.value; p.extension.shield16Used = true; return true;
    case "TAKE_SHIELD": {
      if (!s.settings.shields) fail("방패 확장이 꺼져 있습니다.");
      const castle = p.board.find(t => t.cellId === a.castleCellId);
      if (!castle || burgundyDefinition(castle.tile).color !== "CASTLE" || burgundyDefinition(castle.tile).inn) fail("성을 선택하세요.");
      const source = s.expansion.shieldDepots[a.value - 1]!, index = source.indexOf(a.shieldId);
      if (index < 0) fail("사용할 수 없는 방패입니다.");
      if (pending?.type === "ACTION" && pending.die === null && pending.source === "CASTLE" && hasBurgundyShield(p, 11)) s.pending.shift();
      else {
        if (s.pending.length || p.dice.some(die => die.used)) fail("두 주사위를 모두 사용할 수 있어야 합니다.");
        core.adjust(s, p, p.dice[0].value, a.value, 0); core.adjust(s, p, p.dice[1].value, a.value, 0);
        p.dice[0].used = true; p.dice[1].used = true;
      }
      const replaced = p.extension.shields.findIndex(shield => shield.castleCellId === a.castleCellId);
      if (replaced >= 0) s.shieldDiscard.push(p.extension.shields.splice(replaced, 1)[0]!.shieldId);
      source.splice(index, 1); p.extension.shields.push({ shieldId: a.shieldId, castleCellId: a.castleCellId, copiedPlayerId: null }); return true;
    }
    case "SHIELD_TRIBUTE": {
      if (pending?.type !== "SHIELD_TRIBUTE" || pending.playerId !== p.playerId) fail("지금 공물을 낼 차례가 아닙니다.");
      if (new Set(a.keepShieldIds).size !== a.keepShieldIds.length || a.keepShieldIds.some(id => !hasBurgundyShield(p, id))) fail("유지할 방패를 확인하세요.");
      if (a.workers > a.keepShieldIds.length || a.workers > p.workers || a.workers > 0 && !hasBurgundyShield(p, 3)) fail("공물을 낼 일꾼이 부족합니다.");
      const silver = a.keepShieldIds.length - a.workers;
      if (silver > p.silver) fail("공물을 낼 은화가 부족합니다.");
      p.workers -= a.workers; p.silver -= silver;
      s.shieldDiscard.push(...p.extension.shields.filter(shield => !a.keepShieldIds.includes(shield.shieldId)).map(shield => shield.shieldId));
      p.extension.shields = p.extension.shields.filter(shield => a.keepShieldIds.includes(shield.shieldId));
      s.pending.shift(); return true;
    }
    case "SHIELD_PLACE": {
      if (pending?.type !== "SHIELD_PLACE") fail("현재 사용할 수 없는 효과입니다.");
      const source = pending.black ? s.blackDepot : s.depots.find(depot => depot.some(t => t.tileId === a.tileId));
      const index = source?.findIndex(t => t.tileId === a.tileId) ?? -1;
      if (!source || index < 0) fail("사용할 수 없는 타일입니다.");
      const tile = source.splice(index, 1)[0]!; s.pending.shift(); p.storage.push(tile); core.place(s, p, tile.tileId, a.cellId); return true;
    }
    default: return false;
  }
}
