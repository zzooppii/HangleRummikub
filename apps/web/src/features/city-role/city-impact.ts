import type { CityRolePlayingPlatformSnapshotV2, CityRoleFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { CityActionFeedback } from "./city-role-actions.js";

export type CityImpactSnapshot = CityRolePlayingPlatformSnapshotV2 | CityRoleFinishedPlatformSnapshotV2;
export type CityImpactCue = "STRIKE" | "COIN_GAIN" | "COIN_LOSS" | "SHUFFLE" | "DRAW" | "BUILD" | "BREAK" | "SHIELD" | "LEADER" | "WATER" | "TICK" | "WIND" | "MOON" | "BELL" | "VICTORY";
export type CityImpact = Readonly<{ id: string; cue: CityImpactCue; message: string; intensity: "small" | "medium" | "large"; cardId?: string;
  departingBuilding?: Readonly<Pick<CityImpactSnapshot["game"]["playerStates"][number]["builtBuildings"][number], "templateId" | "category" | "name">> }>;

/** Only consecutive, viewer-projected states are evidence. Never examines hidden state. */
export function deriveCityImpacts(before: CityImpactSnapshot, after: CityImpactSnapshot): CityImpact[] {
  const a = before.game, b = after.game, self = after.self.playerId;
  if (a.gameId !== b.gameId || before.self.playerId !== self || b.gameRevision !== a.gameRevision + 1) return [];
  const events: CityImpact[] = [];
  const name = (id: string) => after.room.players.find(p => p.playerId === id)?.nickname ?? "참가자";
  const emit = (key: string, cue: CityImpactCue, message: string, intensity: CityImpact["intensity"] = "medium", cardId?: string) => {
    events.push({ id: `${b.gameId}:${key}`, cue, message, intensity, ...(cardId === undefined ? {} : { cardId }) });
  };
  const revision = `r${b.gameRevision}`;
  const oldSelf = a.playerStates.find(p => p.playerId === self), me = b.playerStates.find(p => p.playerId === self);
  if (!oldSelf || !me) return [];
  const entry = b.phase === "ROLE_ACTION" && (a.phase !== "ROLE_ACTION" || a.window.actionId !== b.window.actionId);
  const sameWindow = a.phase === "ROLE_ACTION" && b.phase === "ROLE_ACTION" && a.window.actionId === b.window.actionId;

  // Own skipped role is knowable only after its order has passed, or lawful round-end reveal.
  if (!me.forfeited) for (const role of a.privateState.selectedRoleIds) {
    const normal = b.revealedRoles.some(r => r.roundNumber === a.roundNumber && r.roleId === role && r.kind === "NORMAL");
    const disabled = b.revealedRoles.some(r => r.roundNumber === a.roundNumber && r.roleId === role && r.playerId === self && r.kind === "DISABLED");
    const passed = b.roundNumber === a.roundNumber && b.phase === "ROLE_ACTION" && Number(b.window.activeRoleId.slice(-2)) > Number(role.slice(-2));
    const alreadyPassed = a.phase === "ROLE_ACTION" && Number(a.window.activeRoleId.slice(-2)) > Number(role.slice(-2)) || a.revealedRoles.some(r => r.roundNumber === a.roundNumber && r.roleId === role && r.kind === "DISABLED");
    if (!alreadyPassed && !normal && (disabled || passed)) emit(`round${a.roundNumber}:${role}:disabled:${self}`, "STRIKE", "기습당했습니다! 가림꾼의 방해로 이번 역할 차례를 진행할 수 없습니다.", "large");
  }
  if (entry && b.phase === "ROLE_ACTION") {
    const owner = b.window.activePlayerId, role = b.window.activeRoleId;
    const oldOwner = a.playerStates.find(p => p.playerId === owner), ownerNow = b.playerStates.find(p => p.playerId === owner);
    const thief = b.revealedRoles.find(r => r.roundNumber === b.roundNumber && r.roleId === "CR-02" && r.kind === "NORMAL")?.playerId;
    const oldThief = a.playerStates.find(p => p.playerId === thief), thiefNow = b.playerStates.find(p => p.playerId === thief);
    const incomeCategory = role === "CR-04" ? "CIVIC" : role === "CR-05" ? "CULTURE" : role === "CR-06" ? "TRADE" : role === "CR-08" ? "GUARD" : null;
    const income = ownerNow?.builtBuildings.filter(c => c.category === incomeCategory).length ?? 0;
    // Net gold loss alone is not a steal: require both sides and post-entry income correlation.
    if (oldOwner && ownerNow && oldThief && thiefNow && thief !== owner && !ownerNow.forfeited && !thiefNow.forfeited && oldOwner.gold > 0 && ownerNow.gold === income && thiefNow.gold - oldThief.gold === oldOwner.gold) {
      if (self === owner) emit(`${revision}:steal-loss`, "COIN_LOSS", `금화 ${oldOwner.gold}개를 빼앗겼습니다.`, "large");
      if (self === thief) emit(`${revision}:steal-gain`, "COIN_GAIN", `금화 ${oldOwner.gold}개를 획득했습니다.`, "large");
    }
    if (owner === self) {
      if (role === "CR-04") emit(`${revision}:leader`, "LEADER", "다음 라운드의 선도자가 되었습니다.");
      if (role === "CR-07") {
        const pending = "pendingCards" in a.privateState ? a.privateState.pendingCards ?? [] : [];
        const known = new Set([...a.privateState.hand, ...pending].map(c => c.cardId));
        const count = b.privateState.hand.filter(c => !known.has(c.cardId)).length;
        emit(`${revision}:architect`, "DRAW", `설계꾼 효과로 건물 카드 ${count}장을 추가로 받았습니다. 이번 역할에서는 최대 3개까지 건설할 수 있습니다.`);
      }
    }
  }
  if (!a.protectedPlayerIds.includes(self) && b.protectedPlayerIds.includes(self)) emit(`${revision}:protection`, "SHIELD", "수호꾼의 보호가 활성화되었습니다. 이번 라운드 동안 내 도시는 해체로부터 보호됩니다.");
  if (sameWindow && a.phase === "ROLE_ACTION" && b.phase === "ROLE_ACTION") {
    if (b.window.activePlayerId === self && a.privateState.action?.acquisition !== "COMPLETE" && b.privateState.action?.acquisition === "COMPLETE" && b.window.activeRoleId === "CR-06") emit(`${revision}:merchant`, "COIN_GAIN", "장터지기 효과로 금화 1개를 추가 획득했습니다.", "small");
    if (b.window.activeRoleId === "CR-03" && b.window.activePlayerId !== self && !me.forfeited && a.privateState.hand.map(c => c.cardId).join() !== b.privateState.hand.map(c => c.cardId).join()) {
      emit(`${revision}:swap-target`, "SHUFFLE", `${name(b.window.activePlayerId)}님과 손패를 교환했습니다. 내 손패 ${oldSelf.handCount}장 → ${me.handCount}장.`);
    }
  }
  for (const player of b.playerStates) {
    const old = a.playerStates.find(p => p.playerId === player.playerId);
    if (!old) continue;
    for (const card of player.builtBuildings.filter(c => !old.builtBuildings.some(prior => prior.cardId === c.cardId))) {
      emit(`${revision}:build:${card.cardId}`, "BUILD", player.playerId === self ? `${card.name} 건물을 건설했습니다. 금화 ${old.gold} → ${player.gold}.` : `${name(player.playerId)}님이 ${card.name} 건물을 건설했습니다.`, player.playerId === self ? "medium" : "small", card.cardId);
      if (player.playerId === self && b.rulesVersion === "city-rules-v2" && card.templateId === "CB-LAN-05") emit(`${revision}:moon-built`, "MOON", "달그림회랑: 다양성 보완은 게임 종료 시 판정합니다. 지금 점수가 추가되지는 않습니다.");
    }
    if (sameWindow && a.phase === "ROLE_ACTION" && a.window.activeRoleId === "CR-08" && !player.forfeited) for (const card of old.builtBuildings.filter(c => !player.builtBuildings.some(next => next.cardId === c.cardId))) {
      const actor = a.window.activePlayerId;
      if (self === actor || self === player.playerId) {
        events.push({ id: `${b.gameId}:${revision}:destroy:${card.cardId}`, cue: "BREAK", intensity: "large", cardId: card.cardId,
          message: self === actor ? `${card.name} 건물을 해체했습니다.` : `내 ${card.name} 건물이 해체되었습니다.`,
          departingBuilding: { templateId: card.templateId, category: card.category, name: card.name } });
      }
      if (self === actor && b.rulesVersion === "city-rules-v2" && card.templateId === "CB-LAN-03") emit(`${revision}:stone`, "SHIELD", "돌물결마당의 해체 비용에 금화 1이 추가되었습니다.");
    }
  }
  const oldHistory = a.landmarkHistory?.find(p => p.playerId === self), history = b.landmarkHistory?.find(p => p.playerId === self);
  if (oldHistory && history && !me.forfeited) {
    if (!oldHistory.gardenUsed && history.gardenUsed) emit(`${revision}:garden`, "WATER", "빗물정원: 금화 1을 환급받았습니다.");
    if (!oldHistory.sundialUsed && history.sundialUsed) {
      const built = me.builtBuildings.filter(c => !oldSelf.builtBuildings.some(old => old.cardId === c.cardId)).length;
      const count = me.handCount - oldSelf.handCount + built;
      if (count === 0 || count === 1) emit(`${revision}:sundial`, "TICK", count ? "작은해시계: 건물 카드 1장을 얻었습니다." : "작은해시계: 획득할 카드가 없습니다.");
    }
    if (history.staircaseSpent === oldHistory.staircaseSpent + 1) emit(`${revision}:wind`, "WIND", `바람계단: 건설 할인 1을 사용했습니다. 남은 할인 ${history.staircaseRemaining}/3`);
  }
  if (a.firstCompletion === null && b.firstCompletion !== null) emit(`${revision}:completion`, "BELL", `${name(b.firstCompletion.playerId)}님이 도시를 완성했습니다. 이번 라운드가 마지막 라운드입니다.`, "large");
  if (b.roundNumber > a.roundNumber) emit(`${revision}:round`, "BELL", `라운드 ${a.roundNumber} 종료 · 새 라운드 ${b.roundNumber} 시작.`, "small");
  if (a.phase !== "FINISHED" && b.phase === "FINISHED") {
    const row = b.result.rankings.find(r => r.playerId === self);
    emit(`${revision}:finish`, row?.winner ? "VICTORY" : "BELL", row?.winner ? `${b.result.winnerPlayerIds.length > 1 ? "공동 우승" : "우승"}했습니다! 최종 ${row.score}점입니다.` : `게임이 종료되었습니다. 최종 ${row?.score ?? 0}점입니다.`, "large");
    if (row && !row.forfeited && b.rulesVersion === "city-rules-v2") {
      if (me.builtBuildings.some(c => c.templateId === "CB-LAN-05")) emit(`${revision}:moon`, "MOON", `달그림회랑의 종료 다양성 판정: 보너스 ${row.diversityBonus}점. 중복 지급되지 않습니다.`);
      if (me.builtBuildings.some(c => c.templateId === "CB-LAN-06")) emit(`${revision}:seventh`, "MOON", `일곱길기념뜰: 실제 일반 분류 보너스 +${row.landmarkBonus ?? 0}점.`);
    }
  }
  if (b.phase !== "FINISHED" && b.window.activePlayerId === self && (a.phase === "FINISHED" || a.window.actionId !== b.window.actionId) && events.length === 0) {
    emit(`${revision}:window`, "BELL", b.phase === "ROLE_SELECTION" ? "내 역할을 고를 차례입니다." : "내 역할 차례입니다. 금화 또는 건물 카드를 선택하세요.", "small");
  }
  return events;
}

/** Caller lifetime; mount/resume/gaps establish a silent baseline. Bounded transient history. */
export function createCityImpactTracker() {
  let previous: CityImpactSnapshot | null = null;
  let baselineRevision = 0;
  const seen = new Set<string>();
  return {
    reset() { previous = null; },
    accept(snapshot: CityImpactSnapshot, feedback: CityActionFeedback | null = null): CityImpact[] {
      const old = previous;
      if (old && old.game.gameId === snapshot.game.gameId && old.self.playerId === snapshot.self.playerId && snapshot.game.gameRevision < old.game.gameRevision) return [];
      const continuous = old !== null && old.game.gameId === snapshot.game.gameId && old.self.playerId === snapshot.self.playerId && snapshot.game.gameRevision <= old.game.gameRevision + 1;
      previous = snapshot;
      if (!continuous) baselineRevision = snapshot.game.gameRevision;
      const candidates = continuous ? deriveCityImpacts(old, snapshot) : [];
      if (continuous && feedback?.impact && feedback.impact.gameId === snapshot.game.gameId && feedback.impact.revision === snapshot.game.gameRevision &&
        (feedback.impact.revision > baselineRevision || feedback.impact.event.id.includes(":reject:"))) candidates.push(feedback.impact.event);
      if (!continuous && feedback?.impact) seen.add(feedback.impact.event.id);
      const fresh = candidates.filter(event => { if (seen.has(event.id)) return false; seen.add(event.id); return true; });
      if (seen.size > 256) for (const id of [...seen].slice(0, seen.size - 192)) seen.delete(id);
      return fresh;
    },
  };
}
