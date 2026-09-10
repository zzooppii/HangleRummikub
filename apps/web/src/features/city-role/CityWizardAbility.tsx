import { useState } from 'react';
import type { CityPublicBuilding, CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityIcon } from './CityVisuals.js';
import { CityBuildingFace } from './CityBuildingFace.js';
import { cityBuildPreview } from './city-build-preview.js';

type Player = CityRolePlayingPlatformSnapshotV2['game']['playerStates'][number];
export function CityWizardTargets({ players, viewerId, nickname, ready, used, onInspect }: Readonly<{
  players: readonly Player[]; viewerId: string; nickname(id: string): string;
  ready: boolean; used: boolean; onInspect(id: string): void;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const targets = players.filter(p => p.playerId !== viewerId && !p.forfeited);
  const selected = targets.find(p => p.playerId === selectedId && p.handCount > 0);
  return <div className="city-wizard" aria-label="마법사의 상대 선택">
    <p className="city-wizard-intro">상대 손패를 확인하고 카드 1장을 가져오거나 즉시 건설합니다.</p>
    <div className="city-wizard-players">{targets.map(p => <button key={p.playerId} className="city-wizard-player" aria-pressed={selected?.playerId === p.playerId} disabled={!ready || used || p.handCount === 0} onClick={() => setSelectedId(p.playerId)}>
      <CityIcon name="cards" /><strong>{nickname(p.playerId)}</strong><span>손패 <b>{p.handCount}</b>장</span><small>{p.handCount === 0 ? '확인할 카드 없음' : selected?.playerId === p.playerId ? '✓ 선택됨' : '이 상대 선택'}</small>
    </button>)}</div>
    <div className="city-wizard-confirm"><p>{used ? '이번 차례 능력을 사용했습니다.' : '상대를 고른 뒤 손패를 확인하세요. 능력 사용은 선택 사항입니다.'}</p><button disabled={!ready || used || !selected} onClick={() => { if (selected) onInspect(selected.playerId); }}>{used ? '능력 사용 완료' : selected ? `${nickname(selected.playerId)}님의 손패 확인` : '상대를 선택하세요'}</button></div>
  </div>;
}

export function CityWizardChoices({ cards, buildings, gold, taxCollector, disabled, onDecide }: Readonly<{
  cards: readonly CityPublicBuilding[]; buildings: readonly CityPublicBuilding[]; gold: number;
  taxCollector: boolean; disabled: boolean;
  onDecide(cardId: string, choice: 'KEEP' | 'BUILD'): void;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const preview = (card: CityPublicBuilding) => cityBuildPreview(card, { buildings, gold, taxCollector, job: 'WIZARD', buildingsBuilt: 0, wizardImmediate: true });
  const selected = cards.find(card => card.cardId === selectedId);
  const build = selected ? preview(selected) : null;
  return <div className="city-wizard" aria-label="마법사가 확인한 손패">
    <p className="city-wizard-intro">카드 1장을 선택하세요. 손패로 가져오기는 무료이며, 즉시 건설은 건설 횟수를 쓰지 않습니다.</p>
    <div className="city-wizard-cards">{cards.map(card => { const offer = preview(card); return <div key={card.cardId} className={`city-expanded-card${card.cardId === selected?.cardId ? ' is-selected' : ''}`}>
      <button className="city-card-select" aria-label={`${card.name} 선택`} aria-pressed={card.cardId === selected?.cardId} disabled={disabled} onClick={() => setSelectedId(card.cardId)}><CityBuildingFace card={card} rulesVersion="city-rules-v3" /></button>
      <div className="city-build-offer"><div className="city-build-price"><span><CityIcon name="coin" />즉시 건설 <b>{offer.cost}</b> 금화</span>{offer.discount > 0 && <small>공장 −{offer.discount}</small>}{offer.tax > 0 && <small>건설 후 세금 +{offer.tax}</small>}</div><p>{offer.reason ?? '즉시 건설 가능'}</p></div>
    </div>; })}</div>
    <div className="city-wizard-decision"><strong>{selected ? `${selected.name} 선택됨` : '가져올 카드를 선택하세요'}</strong>{build?.reason && <p>{build.reason} · 손패로 가져올 수 있습니다.</p>}<div>
      <button disabled={disabled || !selected} onClick={() => { if (selected) onDecide(selected.cardId, 'KEEP'); }}>손패로 가져오기</button>
      <button disabled={disabled || !selected || Boolean(build?.reason)} onClick={() => { if (selected && !build?.reason) onDecide(selected.cardId, 'BUILD'); }}>{build ? `금화 ${build.cost}개로 즉시 건설` : '카드 선택 후 즉시 건설'}</button>
    </div></div>
  </div>;
}
