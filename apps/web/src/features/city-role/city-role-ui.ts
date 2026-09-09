import {
  CITY_ROLE_IDS,
  type CityRoleId,
  type CityRolePlayingProjectionV2,
  type CityRoleFinishedProjectionV2,
  type CityPublicBuilding,
  type PlayerId,
} from "@hangul-rummikub/shared";

export type { CityActionIntent, CityActionFeedback } from "./city-role-actions.js";
export type CityUiPlayer = CityRolePlayingProjectionV2["playerStates"][number];
export type CityUiCard = CityPublicBuilding;

export const CITY_CATEGORY_LABELS: Readonly<Record<CityUiCard["category"], string>> = {
  CIVIC: "시정", CULTURE: "문화", TRADE: "교역", GUARD: "수비", LANDMARK: "명소",
};

/** Public role descriptions, never a record of another player's secret selection. */
export const CITY_ROLE_HELP: Readonly<Record<CityRoleId, Readonly<{ name: string; summary: string; detail: string }>>> = {
  "CR-01": { name: "가림꾼", summary: "뒤에 불릴 역할 하나의 차례를 막습니다.", detail: "기본 획득 후 한 번, 더 높은 순서의 역할을 비밀리에 지목할 수 있습니다. 자기의 다른 역할에는 효과가 없습니다." },
  "CR-02": { name: "징수꾼", summary: "지목한 역할이 나타날 때 금화를 가져옵니다.", detail: "기본 획득 후 한 번, 더 높은 순서의 역할을 지목합니다. 그 역할의 정상 등장 때 금화 전부를 가져옵니다. 자기 역할·미등장·봉쇄 역할에는 효과가 없습니다." },
  "CR-03": { name: "교환꾼", summary: "손패 전체를 교환하거나 내 카드를 교체합니다.", detail: "기본 획득 후 한 번, 다른 참가자와 손패 전체를 교환하거나 내 카드 1장 이상을 버리고 같은 수만큼 뽑습니다. 건물·금화·역할은 바뀌지 않습니다." },
  "CR-04": { name: "길잡이", summary: "다음 역할 선택을 이끌고 시정 수입을 받습니다.", detail: "등장 시 선도자가 되고, 이미 지은 시정 건물마다 금화 1을 자동으로 받습니다." },
  "CR-05": { name: "수호꾼", summary: "도시를 보호하고 문화 수입을 받습니다.", detail: "등장 시 문화 건물마다 금화 1을 자동으로 받습니다. 등장 후 라운드 끝까지 내 도시가 파괴로부터 보호됩니다." },
  "CR-06": { name: "장터지기", summary: "교역 수입과 추가 금화 1을 받습니다.", detail: "등장 시 교역 건물마다 금화 1을 받습니다. 기본 획득을 마치면 선택 종류에 관계없이 금화 1을 추가로 받습니다." },
  "CR-07": { name: "설계꾼", summary: "추가 카드 최대 2장 · 건설 최대 3개.", detail: "등장 시 가능한 카드 최대 2장을 바로 손패에 받습니다. 이 역할 차례에는 기본 1개 대신 최대 3개를 건설할 수 있습니다." },
  "CR-08": { name: "해체꾼", summary: "수비 수입을 받고 다른 도시의 건물을 파괴합니다.", detail: "등장 시 수비 건물마다 금화 1을 받습니다. 기본 획득 후 한 번, 다른 도시의 건물을 비용보다 금화 1 적게 내고 파괴할 수 있습니다. 보호 중이거나 건물 8개 이상인 도시는 제외됩니다." },
};

export function cityRoleOrder(roleId: CityRoleId): number {
  return CITY_ROLE_IDS.indexOf(roleId) + 1;
}

export function cityRoleLabel(roleId: CityRoleId): string {
  return `${cityRoleOrder(roleId)} · ${CITY_ROLE_HELP[roleId].name}`;
}

/** Higher public role identities only: do not filter by secret ownership or removals. */
export function cityTargetRoleOptions(roleId: CityRoleId): readonly CityRoleId[] {
  return CITY_ROLE_IDS.filter(candidate => cityRoleOrder(candidate) > cityRoleOrder(roleId));
}

export function cityCardLabel(card: CityUiCard): string {
  return `${card.name}, ${CITY_CATEGORY_LABELS[card.category]}, 비용 금화 ${card.cost}, 건물 점수 ${card.victoryPoints}점`;
}

export function cityBuildLimit(roleId: CityRoleId): number {
  return roleId === "CR-07" ? 3 : 1;
}

export function cityBuildPreview(game: CityRolePlayingProjectionV2, playerId: PlayerId, card: CityUiCard): Readonly<{ allowed: boolean; message: string; missingGold: number; paidCost: number }> {
  const player = game.playerStates.find(candidate => candidate.playerId === playerId);
  const history = game.landmarkHistory?.find(row => row.playerId === playerId);
  const discount = game.rulesVersion === "city-rules-v2" && history !== undefined && history.staircaseRemaining > 0 &&
    history.lastDiscountRound !== game.roundNumber && player?.builtBuildings.some(building => building.templateId === "CB-LAN-04") &&
    card.category !== "LANDMARK" && card.cost >= 2 ? 1 : 0;
  const paidCost = card.cost - discount;
  const missingGold = Math.max(0, paidCost - (player?.gold ?? 0));
  const reject = (message: string) => ({ allowed: false, message, missingGold, paidCost });
  if (player === undefined || player.forfeited) return reject("기권한 참가자는 건설할 수 없습니다.");
  if (!game.privateState.hand.some(candidate => candidate.cardId === card.cardId)) return reject("내 손패에서 건물을 선택하세요.");
  if (player.builtBuildings.some(candidate => candidate.templateId === card.templateId)) return reject("같은 건물은 내 도시에 두 번 지을 수 없습니다.");
  if (missingGold > 0) return reject(`금화 ${missingGold} 부족 · 비용 ${paidCost} / 보유 ${player.gold}`);
  if (game.phase !== "ROLE_ACTION" || game.window.activePlayerId !== playerId || game.privateState.action === undefined) return reject("내 역할 차례에 건설할 수 있습니다.");
  if (game.privateState.action.acquisition !== "COMPLETE") return reject("먼저 금화 또는 건물 카드 획득을 마치세요.");
  if (game.privateState.action.buildingsBuilt >= cityBuildLimit(game.window.activeRoleId)) return reject("이번 역할의 건설 한도를 모두 사용했습니다.");
  return { allowed: true, missingGold: 0, paidCost, message: `건설 가능 · 금화 ${paidCost} 지불${discount ? " · 바람계단 할인" : ""}` };
}

/** Public target preview only; destruction legality and payment remain server-owned. */
export function cityDestroyPreview(game: CityRolePlayingProjectionV2, actorId: PlayerId, target: CityUiPlayer, card: CityUiCard): Readonly<{ allowed: boolean; cost: number; message: string }> {
  const cost = Math.max(0, card.cost - 1) + (game.rulesVersion === "city-rules-v2" && card.templateId === "CB-LAN-03" ? 1 : 0);
  const reject = (message: string) => ({ allowed: false, cost, message });
  if (target.playerId === actorId) return reject("내 도시는 파괴할 수 없습니다.");
  if (target.forfeited) return reject("기권한 참가자의 도시는 유지됩니다.");
  if (target.builtBuildings.length >= 8) return reject("건물이 8개 이상인 도시는 파괴할 수 없습니다.");
  if (game.protectedPlayerIds.includes(target.playerId)) return reject("이번 라운드에 보호받는 도시입니다.");
  if (!target.builtBuildings.some(candidate => candidate.cardId === card.cardId)) return reject("현재 공개된 건물을 선택하세요.");
  const actor = game.playerStates.find(player => player.playerId === actorId);
  if (game.phase !== "ROLE_ACTION" || game.window.activePlayerId !== actorId || game.window.activeRoleId !== "CR-08" || actor?.forfeited !== false) return reject("해체꾼의 차례에 사용할 수 있습니다.");
  if (game.privateState.action?.acquisition !== "COMPLETE") return reject("먼저 기본 획득을 마치세요.");
  if (game.privateState.action.abilityUsed) return reject("이번 역할의 능력을 이미 사용했습니다.");
  if (actor.gold < cost) return reject(`금화 ${cost - actor.gold} 부족 · 파괴 비용 ${cost}`);
  return { allowed: true, cost, message: `파괴 비용 금화 ${cost}` };
}

export function cityCurrentHint(game: CityRolePlayingProjectionV2, selfId: PlayerId): string {
  if (game.playerStates.find(player => player.playerId === selfId)?.forfeited) return "기권 처리되었습니다. 공개된 진행 상황을 볼 수 있습니다.";
  if (game.window.activePlayerId !== selfId) return game.phase === "ROLE_SELECTION" ? "다른 참가자가 비밀 역할을 선택하고 있습니다." : "다른 참가자의 역할 차례입니다. 공개 도시와 내 손패를 살펴보세요.";
  if (game.phase === "ROLE_SELECTION") return game.secretPairDraft ? "가져갈 역할과 비공개로 버릴 역할을 고르세요." : "역할을 하나 고르세요. 선택한 역할은 나에게만 보입니다.";
  if (game.window.waitingFor === "DRAW_BUILDING_CHOICE") return "카드 1장을 선택하세요. 선택을 마쳐야 다음 행동을 할 수 있습니다.";
  if (game.privateState.action?.acquisition === "NOT_TAKEN") return "금화 2 받기 또는 건물 카드 보기를 선택하세요.";
  return "원한다면 건설하거나 역할 능력을 쓰고, 차례를 마치세요.";
}

export function cityFinishReasonLabel(reason: CityRoleFinishedProjectionV2["result"]["reason"]): string {
  switch (reason) {
    case "CITY_COMPLETION_ROUND_END": return "도시 완성 · 마지막 라운드 종료";
    case "LAST_PLAYER_STANDING": return "마지막 남은 참가자";
    case "NO_ELIGIBLE_PLAYERS": return "모든 참가자의 게임 종료";
  }
}
