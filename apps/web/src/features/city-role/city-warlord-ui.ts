import type { CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';

type PublicCities = Pick<CityRolePlayingPlatformSnapshotV2['game'], 'playerStates' | 'protectedPlayerIds'>;

/** Display estimates from public buildings only. The server validates and charges the action. */
export function cityWarlordTargets(game: PublicCities, gold: number) {
  return game.playerStates.filter(player => !player.forfeited).map(player => {
    const complete = player.builtBuildings.length + Number(player.builtBuildings.some(b => b.templateId === 'CB-SP-16')) >= 8;
    const protectedCity = game.protectedPlayerIds.includes(player.playerId);
    const hasWall = player.builtBuildings.some(b => b.templateId === 'CB-SP-08');
    return { playerId: player.playerId, buildings: player.builtBuildings.map(card => {
      const wallSurcharge = Number(hasWall && card.templateId !== 'CB-SP-08');
      // Projected card.cost already includes artist decoration; do not add it twice.
      const cost = Math.max(0, card.cost - 1) + wallSurcharge;
      const reason = complete ? '완성된 도시' : protectedCity ? '주교의 보호' : card.templateId === 'CB-SP-12' ? '성채 · 파괴 불가' : cost > gold ? `금화 ${cost - gold}개 부족` : null;
      return { card, cost, wallSurcharge, reason };
    }) };
  });
}
