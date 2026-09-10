import { CITY_SPECIAL_BUILDINGS, type CityRoleFinishedPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityIcon } from './CityVisuals.js';

type Ranking = CityRoleFinishedPlatformSnapshotV2['game']['result']['rankings'][number];
function specialReason(id: string, points: number) {
  switch (id) {
    case 'CB-SP-02': return `비용이 홀수인 건물 ${points}채 × 1점`;
    case 'CB-SP-03': return '같은 종류의 건물 3채 이상';
    case 'CB-SP-04': return '건설 완료 보너스';
    case 'CB-SP-10': return `남은 금화 ${points}개 × 1점`;
    case 'CB-SP-11': return '도시의 유일한 특수 건물';
    case 'CB-SP-15': return `남은 손패 ${points}장 × 1점`;
    case 'CB-SP-17': return `박물관에 보관한 카드 ${points}장 × 1점`;
    case 'CB-SP-24': return '게임 종료까지 손에 보관';
    case 'CB-SP-27': return '종료 시 왕관 보유';
    case 'CB-SP-30': return `특수 건물 ${points}채 × 1점 · 우물 포함`;
    default: return '';
  }
}
export function CityBonusDetails({ row }: { row: Ranking }) {
  const total = row.completionBonus + row.diversityBonus + (row.landmarkBonus ?? 0);
  return <div className="city-bonus-details"><strong className="city-bonus-total">보너스 +{total}점</strong>{total === 0 ? <p className="city-muted">{row.forfeited ? '기권 · 보너스 미적용' : '획득한 보너스 없음'}</p> : <ul>
    {row.completionBonus > 0 && <li><CityIcon name="civic"/><div><span>{row.completionBonus === 4 ? '첫 도시 완성' : '도시 완성'}</span><small>{row.completionBonus === 4 ? '가장 먼저 완성 기준 달성' : '완성 기준 달성'}</small></div><b>+{row.completionBonus}점</b></li>}
    {row.diversityBonus > 0 && <li><CityIcon name="market"/><div><span>5종류 완성</span><small>교역 · 시정 · 수비 · 문화 · 특수</small></div><b>+{row.diversityBonus}점</b></li>}
    {row.specialBonusBreakdown?.map(item => <li key={item.templateId}><CityIcon name="landmark"/><div><span>{CITY_SPECIAL_BUILDINGS.find(b => b.templateId === item.templateId)?.name ?? '특수 건물'}</span><small>{specialReason(item.templateId, item.points)}</small></div><b>+{item.points}점</b></li>)}
    {row.specialBonusBreakdown === undefined && (row.landmarkBonus ?? 0) > 0 && <li><CityIcon name="landmark"/><div><span>특수 건물 합계</span><small>이 결과에는 건물별 내역이 없습니다.</small></div><b>+{row.landmarkBonus}점</b></li>}
  </ul>}</div>;
}

export function CityExpandedResults({ game, players }: { game: CityRoleFinishedPlatformSnapshotV2['game']; players: CityRoleFinishedPlatformSnapshotV2['room']['players'] }) {
  const nickname = (id: string) => players.find(p => p.playerId === id)?.nickname ?? '참가자';
  return <section className="city-expansion-panel city-expanded-results"><h2>완성된 도시의 기록</h2><table className="city-results-table"><thead><tr><th>순위</th><th>플레이어</th><th>건물 점수</th><th>보너스 상세</th><th>총점</th></tr></thead><tbody>{game.result.rankings.map(row => <tr key={row.playerId}>
    <td className="city-result-rank">{row.rank}<span className="city-result-mobile-label">위</span></td><td className="city-result-player">{nickname(row.playerId)}{row.winner ? ' 👑' : ''}{row.forfeited ? ' · 기권' : ''}</td>
    <td className="city-result-building"><span className="city-result-mobile-label">건물 점수 </span>{row.buildingVP}점</td><td className="city-result-bonus"><CityBonusDetails row={row}/></td><td className="city-result-total"><b>{row.score}</b>점</td>
  </tr>)}</tbody></table>{(game.expansion?.vaultOwners.length ?? 0) > 0 && <p>비밀 금고 공개: {game.expansion?.vaultOwners.map(nickname).join(', ')}</p>}</section>;
}
