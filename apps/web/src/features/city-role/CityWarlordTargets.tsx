import type { CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityBuildingFace } from './CityBuildingFace.js';
import { CityIcon } from './CityVisuals.js';
import { cityWarlordTargets } from './city-warlord-ui.js';

export function CityWarlordTargets({ game, viewerId, gold, ready, used, targetPlayerId, targetCardId, nickname, onSelect, onDestroy }: {
  game: CityRolePlayingPlatformSnapshotV2['game'];
  viewerId: string;
  gold: number;
  ready: boolean;
  used: boolean;
  targetPlayerId: string;
  targetCardId: string;
  nickname(id: string): string;
  onSelect(playerId: string, cardId: string): void;
  onDestroy(playerId: string, cardId: string): void;
}) {
  const cities = cityWarlordTargets(game, gold).sort((a, b) => Number(a.playerId === viewerId) - Number(b.playerId === viewerId));
  const city = cities.find(p => p.playerId === targetPlayerId) ?? cities[0];
  const selected = city?.playerId === targetPlayerId ? city.buildings.find(b => b.card.cardId === targetCardId) : undefined;
  const locked = !ready || used;
  return <section className="city-warlord" aria-label="장군의 건물 파괴">
    <div className="city-warlord-heading"><div><span className="city-eyebrow">장군 · 건물 파괴</span><h3>파괴할 건물을 고르세요</h3></div><span className="city-warlord-wallet"><CityIcon name="coin"/>보유 <b>{gold}</b></span></div>
    <p className="city-muted">도시와 건물 카드를 선택한 뒤 파괴하세요. 건물 비용보다 금화 1개 적게 냅니다.</p>
    <div className="city-warlord-cities" aria-label="파괴 대상 도시">{cities.map(p => <button key={p.playerId} aria-pressed={city?.playerId === p.playerId} onClick={() => onSelect(p.playerId, '')}>{p.playerId === viewerId ? '내 도시' : nickname(p.playerId)}<span>{p.buildings.length}채</span></button>)}</div>
    {city && <div className="city-warlord-buildings" aria-label={`${nickname(city.playerId)}의 파괴 대상 건물`}>
      {city.buildings.map(b => <article key={b.card.cardId} className={`city-expanded-card city-warlord-card${selected?.card.cardId === b.card.cardId ? ' is-selected' : ''}${b.reason ? ' is-unavailable' : ''}`}>
        <button className="city-card-select" disabled={locked || b.reason !== null} aria-pressed={selected?.card.cardId === b.card.cardId} aria-label={`${nickname(city.playerId)}의 ${b.card.name} · 파괴 ${b.cost}금화${b.reason ? ` · ${b.reason}` : ' · 선택'}`} onClick={() => onSelect(city.playerId, b.card.cardId)}><CityBuildingFace card={b.card} rulesVersion="city-rules-v3"/></button>
        <div className="city-warlord-price"><span><CityIcon name="hammer"/>파괴 <b>{b.cost}</b> 금화</span>{b.wallSurcharge > 0 && <small>대성벽 +1 포함</small>}<strong>{b.reason ?? (selected?.card.cardId === b.card.cardId ? '✓ 선택됨' : '카드를 눌러 선택')}</strong></div>
      </article>)}
      {city.buildings.length === 0 && <p className="city-warlord-empty">이 도시에 지어진 건물이 없습니다.</p>}
    </div>}
    <div className="city-warlord-confirm"><div aria-live="polite">{used ? <strong>이번 차례의 파괴 능력을 사용했습니다.</strong> : selected ? <><strong>{nickname(city!.playerId)} · {selected.card.name}</strong><span>{selected.reason ?? `파괴 후 남는 금화 ${gold - selected.cost}개`}</span></> : <span>파괴할 건물 카드를 선택하세요.</span>}</div><button disabled={locked || !selected || selected.reason !== null} onClick={() => { if (!locked && city && selected && selected.reason === null) onDestroy(city.playerId, selected.card.cardId); }}><CityIcon name="hammer"/>{selected ? `${selected.cost}금화로 파괴` : '건물 파괴'}</button></div>
  </section>;
}
