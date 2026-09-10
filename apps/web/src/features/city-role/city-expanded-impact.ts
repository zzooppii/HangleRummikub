import type { CityImpact, CityImpactSnapshot } from './city-impact.js';

/** V3 events come only from consecutive server projections, including publicly visible transfers. */
export function deriveExpandedCityImpacts(before: CityImpactSnapshot, after: CityImpactSnapshot): CityImpact[] {
  const a = before.game, b = after.game, self = after.self.playerId;
  if (!a.expansion || !b.expansion) return [];
  const events: CityImpact[] = [];
  const name = (id: string) => after.room.players.find(p => p.playerId === id)?.nickname ?? '참가자';
  const emit = (key: string, cue: CityImpact['cue'], message: string, owner = self, cardId?: string) => {
    events.push({ id: `${b.gameId}:r${b.gameRevision}:${key}`, cue, message,
      intensity: owner === self ? 'medium' : 'small', ...(cardId ? { cardId } : {}) });
  };
  const own = b.playerStates.find(p => p.playerId === self);
  if (!own) return [];
  const sameTurn = a.phase === 'ROLE_ACTION' && b.phase === 'ROLE_ACTION' && a.window.actionId === b.window.actionId;
  const entry = b.phase === 'ROLE_ACTION' && (a.phase !== 'ROLE_ACTION' || a.window.actionId !== b.window.actionId);
  const activeJob = a.phase === 'ROLE_ACTION' ? a.expansion.settings.roles[Number(a.window.activeRoleId.slice(-2)) - 1] : null;
  const thieves = new Set<string>();
  const theftActor = entry && b.phase === 'ROLE_ACTION' && b.expansion.settings.roles[1] === 'THIEF' && b.expansion.robbedRole === b.window.activeRoleId
    ? b.revealedRoles.find(r => r.roundNumber === b.roundNumber && r.kind === 'NORMAL' && r.roleId === (b.expansion?.witchTarget === 'CR-02' ? 'CR-01' : 'CR-02'))?.playerId
    : sameTurn && a.phase === 'ROLE_ACTION' && (activeJob === 'SPY' || a.expansion.pending === 'BLACKMAIL') ? a.window.activePlayerId : undefined;
  if (theftActor) {
    const gain = (b.playerStates.find(p => p.playerId === theftActor)?.gold ?? 0) - (a.playerStates.find(p => p.playerId === theftActor)?.gold ?? 0);
    const victim = b.playerStates.find(p => !p.forfeited && p.playerId !== theftActor && (a.playerStates.find(old => old.playerId === p.playerId)?.gold ?? 0) - p.gold === gain);
    if (gain > 0 && victim) {
      thieves.add(theftActor); thieves.add(victim.playerId);
      if (self === theftActor || self === victim.playerId) emit('steal', 'STEAL', self === theftActor ? `금화 ${gain}개를 빼앗아 왔습니다.` : `금화 ${gain}개를 빼앗겼습니다.`);
    }
  }
  const oldBuilt = new Map(a.playerStates.flatMap(p => p.builtBuildings.map(card => [card.cardId, p.playerId] as const)));
  const newBuilt = new Set(b.playerStates.flatMap(p => p.builtBuildings.map(card => card.cardId)));
  for (const player of b.playerStates) {
    const old = a.playerStates.find(p => p.playerId === player.playerId);
    if (!old || player.forfeited || old.forfeited) continue;
    const subject = player.playerId === self ? '' : `${name(player.playerId)}님이 `;
    for (const card of player.builtBuildings.filter(c => !old.builtBuildings.some(prior => prior.cardId === c.cardId))) {
      emit(`build:${card.cardId}`, 'BUILD', `${subject}${card.name} 건물을 ${oldBuilt.has(card.cardId) ? '가져왔습니다' : '건설했습니다'}.`, player.playerId, card.cardId);
    }
    for (const card of old.builtBuildings.filter(c => !newBuilt.has(c.cardId))) {
      events.push({ id: `${b.gameId}:r${b.gameRevision}:destroy:${card.cardId}`, cue: 'BREAK', intensity: player.playerId === self ? 'large' : 'small', cardId: card.cardId,
        message: `${player.playerId === self ? '내' : `${name(player.playerId)}님의`} ${card.name} 건물이 사라졌습니다.`, departingBuilding: { templateId: card.templateId, category: card.category, name: card.name } });
    }
    if (!thieves.has(player.playerId) && player.gold > old.gold) emit(`gold:${player.playerId}`, 'COIN_GAIN', `${subject}금화 ${player.gold - old.gold}개를 받았습니다.`, player.playerId);
    if (player.playerId === self) {
      const added = b.privateState.hand.filter(c => !a.privateState.hand.some(prior => prior.cardId === c.cardId)).length;
      const removed = a.privateState.hand.filter(c => !b.privateState.hand.some(next => next.cardId === c.cardId) && !newBuilt.has(c.cardId)).length;
      if (added || removed) emit('hand', added && removed ? 'SHUFFLE' : added ? 'DRAW' : 'SHUFFLE', added && removed ? '손패를 교환했습니다.' : added ? `건물 카드 ${added}장을 받았습니다.` : `손패 ${removed}장을 사용했습니다.`);
    } else if (player.handCount > old.handCount) emit(`draw:${player.playerId}`, 'DRAW', `${subject}건물 카드 ${player.handCount - old.handCount}장을 받았습니다.`, player.playerId);
  }
  if ('pendingCards' in b.privateState && b.privateState.pendingCards?.length && (!('pendingCards' in a.privateState) || !a.privateState.pendingCards?.length)) emit('draw-choice', 'DRAW', '건물 카드를 뽑았습니다. 가져갈 카드를 선택하세요.');
  if (b.privateState.selectedRoleIds.join() !== a.privateState.selectedRoleIds.join()) emit('roles', 'TICK', b.expansion.pending === 'THEATER' || a.expansion.pending === 'THEATER' ? '직업 카드가 교환되었습니다.' : '직업 카드가 선택되었습니다.');
  if (a.leaderPlayerId !== b.leaderPlayerId) emit('leader', 'LEADER', `${name(b.leaderPlayerId)}님에게 왕관이 전달되었습니다.`, b.leaderPlayerId);
  if (!a.protectedPlayerIds.includes(self) && b.protectedPlayerIds.includes(self)) emit('shield', 'SHIELD', '주교의 보호가 활성화되었습니다.');
  if (!own.forfeited && b.revealedRoles.some(r => r.roundNumber === b.roundNumber && r.playerId === self && r.kind === 'DISABLED' && !a.revealedRoles.some(old => old.roundNumber === r.roundNumber && old.roleId === r.roleId && old.kind === r.kind))) emit('strike', 'STRIKE', '암살된 직업의 차례를 건너뛰었습니다.');
  if (a.firstCompletion === null && b.firstCompletion !== null) emit('completion', 'BELL', `${name(b.firstCompletion.playerId)}님이 도시를 완성했습니다.`);
  if (a.phase !== 'FINISHED' && b.phase === 'FINISHED') emit('finish', b.result.winnerPlayerIds.includes(self) ? 'VICTORY' : 'BELL', b.result.winnerPlayerIds.includes(self) ? '도시 건설에서 승리했습니다!' : '게임이 종료되었습니다.');
  else if (a.roundNumber < b.roundNumber) emit('round', 'BELL', `${b.roundNumber}라운드를 시작합니다.`);
  else if (b.phase !== 'FINISHED' && b.window.activePlayerId === self && (a.phase === 'FINISHED' || a.window.actionId !== b.window.actionId || a.window.activePlayerId !== self) && events.length === 0) emit('turn', 'BELL', '내 차례입니다.');
  return events;
}
