import { useState } from 'react';
import type { CityPublicBuilding, CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityIcon } from './CityVisuals.js';

type Player = CityRolePlayingPlatformSnapshotV2['game']['playerStates'][number];

/** Display candidates from public gold counts; the server revalidates the submitted target. */
export function CityAbbotTribute({ players, viewerId, nickname, ready, used, onCollect }: Readonly<{
  players: readonly Player[]; viewerId: string; nickname(id: string): string;
  ready: boolean; used: boolean; onCollect(id: string): void;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const self = players.find(p => p.playerId === viewerId);
  const richest = Math.max(0, ...players.filter(p => !p.forfeited).map(p => p.gold));
  const targets = self && !self.forfeited && self.gold < richest
    ? players.filter(p => !p.forfeited && p.playerId !== viewerId && p.gold === richest) : [];
  const selected = targets.length === 1 ? targets[0] : targets.find(p => p.playerId === selectedId);
  const locked = !ready || used;
  return <section className="city-abbot" aria-label="수도원장 금화 받기">
    <h3><CityIcon name="coin" />가장 부유한 상대에게 금화 1개</h3>
    <p className="city-muted">{used ? '이번 차례에는 이미 금화 1개를 받았습니다.' : targets.length === 0 ? '내가 가장 부유하거나 공동 1위라 받을 수 없습니다. 건설 후 금화가 줄면 다시 확인하세요.' : targets.length === 1 ? `${nickname(targets[0]!.playerId)}님이 가장 부유합니다 · 보유 금화 ${richest}개` : `최고 금화 ${richest}개로 동률입니다. 받을 상대 한 명을 고르세요.`}</p>
    {!used && targets.length > 1 && <div className="city-abbot-targets">{targets.map(p => <button type="button" key={p.playerId} aria-pressed={selected?.playerId === p.playerId} disabled={locked} onClick={() => setSelectedId(p.playerId)}><strong>{nickname(p.playerId)}님</strong><span>금화 {p.gold}개</span></button>)}</div>}
    <button type="button" className="city-abbot-collect" disabled={locked || !selected} onClick={() => { if (!locked && selected) onCollect(selected.playerId); }}>{used ? '금화 받기 완료' : selected ? `${nickname(selected.playerId)}님에게 금화 1개 받기` : targets.length === 0 ? '받을 수 있는 금화 없음' : '동률인 상대를 선택하세요'}</button>
  </section>;
}

export function CityAbbotIncome({ buildings, ready, used, onCollect }: Readonly<{
  buildings: readonly CityPublicBuilding[]; ready: boolean; used: boolean; onCollect(goldCount: number): void;
}>) {
  const [chosenGold, setChosenGold] = useState<number | null>(null);
  const cultures = buildings.filter(b => b.category === 'CULTURE').length;
  const magic = buildings.some(b => b.templateId === 'CB-SP-23');
  const count = cultures + Number(magic);
  const gold = Math.min(chosenGold ?? count, count), cards = count - gold;
  const locked = !ready || used || count === 0;
  return <section className="city-abbot city-abbot-income" aria-label="수도원장 문화 건물 수입">
    <h3><CityIcon name="culture" />문화 건물 수입</h3>
    <p className="city-muted">{used ? '이번 차례의 문화 건물 수입을 받았습니다.' : `문화 건물 ${cultures}채${magic ? ' + 마법 학교 1채' : ''} · 금화와 카드를 합쳐 ${count}개 받을 수 있습니다.`}</p>
    {count > 0 && !used && <><div className="city-abbot-split" aria-live="polite"><span><CityIcon name="coin" />금화 <b>{gold}</b>개</span><span><CityIcon name="cards" />카드 <b>{cards}</b>장</span></div><label className="city-abbot-slider">금화와 카드 배분<input aria-label="문화 수입으로 받을 금화 개수" type="range" min="0" max={count} step="1" value={gold} disabled={locked} onChange={ev => setChosenGold(Number(ev.target.value))}/><span>카드만 받기 <span>금화만 받기</span></span></label></>}
    <button type="button" className="city-abbot-collect" disabled={locked} onClick={() => { if (!locked) onCollect(gold); }}>{used ? '문화 수입 받기 완료' : count === 0 ? '수입을 받을 문화 건물이 없습니다' : `금화 ${gold}개 · 카드 ${cards}장 받기`}</button>
  </section>;
}
