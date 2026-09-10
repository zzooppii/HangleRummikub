import type { CityPublicBuilding } from '@hangul-rummikub/shared';
import { CityIcon } from './CityVisuals.js';

/** A visual summary of public v3 buildings; completion and game end remain server-owned. */
export function CityConstructionProgress({ buildings, ending, finished, cityName = '내 도시', variant = 'hand' }: Readonly<{
  buildings: readonly CityPublicBuilding[];
  ending: boolean;
  finished: boolean;
  cityName?: string;
  variant?: 'hand' | 'public';
}>) {
  const monument = buildings.find(card => card.templateId === 'CB-SP-16');
  const count = buildings.length + Number(Boolean(monument));
  const slots = buildings.flatMap(card => card === monument ? [card, card] : [card]);
  return <div className={`city-construction-progress${variant === 'public' ? ' is-public' : ''}`} aria-label={`${cityName} 건설 현황`}>
    <div className="city-construction-heading">{variant === 'hand' && <strong><CityIcon name="civic" />{cityName}</strong>}<span>건물 {buildings.length}채 <b>· {Math.min(count, 8)} / 8칸</b></span></div>
    <div className="city-construction-slots" role="progressbar" aria-label={variant === 'public' ? `${cityName} 완성` : '도시 완성'} aria-valuemin={0} aria-valuemax={8} aria-valuenow={Math.min(count, 8)} aria-valuetext={`건물 ${buildings.length}채, 완성 ${Math.min(count, 8)} / 8칸${monument ? ', 기념비는 2칸' : ''}`}>
      {Array.from({ length: 8 }, (_, index) => {
        const card = slots[index];
        return <span key={index} className={`city-construction-slot${card ? ' is-built' : ''}`} title={card ? `${card.name}${card === monument ? ' · 완성 2칸' : ''}` : '빈 건물 터'} aria-hidden="true">
          <CityIcon name="civic" />
        </span>;
      })}
    </div>
    {variant === 'hand' && <p>{finished ? '게임 종료' : ending ? '마지막 라운드 · 이번 라운드가 끝나면 게임 종료' : '8칸을 완성하면 그 라운드가 끝날 때 게임 종료'}{monument && <span> · 기념비는 2칸</span>}</p>}
  </div>;
}
