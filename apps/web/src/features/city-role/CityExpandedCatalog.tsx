import { CITY_ALL_ROLE_IDS, CITY_EXPANDED_ROLES, CITY_SPECIAL_BUILDINGS, type CityRolePlayingPlatformSnapshotV2, type CityRoleFinishedPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityRoleEmblem } from './CityVisuals.js';

export function CityExpandedCatalog({ snapshot }: Readonly<{ snapshot: CityRolePlayingPlatformSnapshotV2 | CityRoleFinishedPlatformSnapshotV2 }>) {
  const game = snapshot.game, e = game.expansion!;
  const nickname = (id: string) => snapshot.room.players.find(player => player.playerId === id)?.nickname ?? '참가자';
  return <><div className="city-role-grid city-expanded-role-catalog">{e.settings.roles.map((id, i) => { const r = CITY_EXPANDED_ROLES.find(r => r.id === id)!; return <article key={id} className="city-role-card" data-role={CITY_ALL_ROLE_IDS[i]}><CityRoleEmblem roleId={CITY_ALL_ROLE_IDS[i]!}/><span className="city-role-order">등장 순서 {i + 1}</span><strong>{r.name}</strong><p>{r.text}</p><small>{game.publicRemovedRoleIds.includes(CITY_ALL_ROLE_IDS[i]!) ? '이번 라운드 공개 제외' : game.revealedRoles.filter(row => row.roundNumber === game.roundNumber && row.roleId === CITY_ALL_ROLE_IDS[i]).map(row => `${nickname(row.playerId)}${row.kind === 'DISABLED' ? ' · 암살됨' : ''}`).join(', ') || '아직 공개되지 않음'}</small></article>; })}</div><div className="city-special-lineup">{e.specialIds.map(id => { const b = CITY_SPECIAL_BUILDINGS.find(b => b.templateId === id)!; return <article key={id}><img src={`/city-art/expanded-v3/${id.toLowerCase()}.webp`} alt="" loading="lazy"/><strong>{b.name} · {b.cost}</strong><p>{b.text}</p></article>; })}</div></>;
}
