import { useState } from 'react';
import type { CityPublicBuilding, CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { cityBuildPreview } from './city-build-preview.js';
import { CityTemplateArt } from './CityTemplateArt.js';

type Player = CityRolePlayingPlatformSnapshotV2['game']['playerStates'][number];
export function CityCardinalBuild({ hand, buildings, gold, buildingsBuilt, taxCollector, players, viewerId, nickname, ready, onBuild }: Readonly<{
  hand: readonly CityPublicBuilding[]; buildings: readonly CityPublicBuilding[]; gold: number; buildingsBuilt: number; taxCollector: boolean;
  players: readonly Player[]; viewerId: string; nickname(id: string): string; ready: boolean;
  onBuild(cardId: string, paymentIds: string[], targetPlayerId: string): void;
}>) {
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [paymentIds, setPaymentIds] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const preview = (card: CityPublicBuilding) => cityBuildPreview(card, { buildings, gold, job: 'CARDINAL', buildingsBuilt, taxCollector });
  const building = hand.find(c => c.cardId === buildingId && c.cost > 0);
  const price = building && preview(building);
  const shortfall = price?.shortfall ?? 0;
  const paymentCards = hand.filter(c => c.cardId !== buildingId);
  const selected = paymentCards.filter(c => paymentIds.includes(c.cardId)).map(c => c.cardId);
  const opponents = players.filter(p => !p.forfeited && p.playerId !== viewerId);
  const eligible = opponents.filter(p => p.gold >= shortfall);
  const target = eligible.length === 1 ? eligible[0] : eligible.find(p => p.playerId === targetId);
  const reason = !building ? '지을 건물을 먼저 고르세요.' : price?.restriction ?? (shortfall === 0 ? '보유 금화로 건설할 수 있습니다. 손패의 일반 건설 버튼을 사용하세요.' : paymentCards.length < shortfall ? `지급할 손패가 부족합니다. ${shortfall}장이 필요합니다.` : eligible.length === 0 ? `금화 ${shortfall}개를 줄 수 있는 상대가 없습니다.` : selected.length !== shortfall ? `상대에게 줄 카드 ${shortfall}장을 선택하세요. 현재 ${selected.length}장 선택했습니다.` : !target ? '금화를 받을 상대를 고르세요.' : null);
  const canBuild = ready && building && !reason && target;
  return <section className="city-cardinal" aria-label="추기경 교환 건설">
    <h3>추기경 · 카드 여러 장으로 부족한 금화 받기</h3>
    <p className="city-muted">부족한 금화 1개마다 손패 1장을 한 상대에게 줍니다. 지을 건물은 지급 카드에 포함되지 않습니다.</p>
    <h4>1. 지을 건물 한 장</h4>
    <div className="city-cardinal-cards">{hand.filter(c => c.cost > 0).map(c => { const p = preview(c); return <button type="button" key={c.cardId} aria-label={`${c.name} 건설 대상으로 선택`} aria-pressed={buildingId === c.cardId} disabled={!ready || Boolean(p.restriction)} onClick={() => { setBuildingId(c.cardId); setPaymentIds([]); }}><CityTemplateArt templateId={c.templateId} category={c.category}/><strong>{c.name}</strong><small>{p.restriction ?? `건설 ${p.cost}금화 · 부족 ${p.shortfall}금화`}</small></button>; })}</div>
    {building && price && <><p className="city-cardinal-cost">건설 {price.cost}금화 − 내 금화 {gold}개 = 부족 <b>{shortfall}금화</b>{price.discount > 0 && <span> · 공장 할인 반영</span>}</p>
      {shortfall > 0 && !price.restriction && <><h4>2. 상대에게 줄 카드 여러 장 <span aria-live="polite">{selected.length} / {shortfall}장</span></h4>
        <div className="city-cardinal-cards" aria-label="추기경 지급 카드">{paymentCards.map(c => <button type="button" key={c.cardId} aria-label={`${c.name} 지급 카드 선택`} aria-pressed={selected.includes(c.cardId)} disabled={!ready || selected.length >= shortfall && !selected.includes(c.cardId)} onClick={() => setPaymentIds(ids => ids.includes(c.cardId) ? ids.filter(id => id !== c.cardId) : [...ids,c.cardId])}><CityTemplateArt templateId={c.templateId} category={c.category}/><strong>{c.name}</strong><small>{selected.includes(c.cardId) ? '✓ 지급할 카드' : '눌러서 추가 선택'}</small></button>)}</div>
        <h4>3. 금화를 받을 상대</h4><div className="city-cardinal-opponents">{opponents.map(p => <button type="button" key={p.playerId} aria-pressed={target?.playerId === p.playerId} disabled={!ready || p.gold < shortfall} onClick={() => setTargetId(p.playerId)}><strong>{nickname(p.playerId)}님</strong><span>보유 {p.gold}금화{p.gold < shortfall ? ' · 금화 부족' : ''}</span></button>)}</div></>}
    </>}
    <p className="city-muted" aria-live="polite">{reason ?? (target && `${nickname(target.playerId)}님에게 카드 ${selected.length}장을 주고 금화 ${shortfall}개를 받아 건설합니다.`)}</p>
    <button type="button" className="city-cardinal-confirm" disabled={!canBuild} onClick={() => { if (canBuild) onBuild(building.cardId, selected, target.playerId); }}>카드 {selected.length}장 교환하고 건설</button>
  </section>;
}
