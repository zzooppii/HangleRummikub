import { CityIcon } from './CityVisuals.js';

export function CityTurnSteps({ acquisition, handId }: Readonly<{
  acquisition: 'NOT_TAKEN' | 'PENDING' | 'COMPLETE';
  handId: string;
}>) {
  const acquired = acquisition === 'COMPLETE';
  return <div className="city-turn-steps">
    <ol aria-label="내 차례 진행 순서">
      <li className={acquired ? 'is-done' : 'is-current'} aria-current={!acquired ? 'step' : undefined}><b>{acquired ? <CityIcon name="check" /> : '1'}</b><span>자원 받기</span></li>
      <li className={acquired ? 'is-current' : ''} aria-current={acquired ? 'step' : undefined}><b>2</b><span>능력 · 건설</span></li>
      <li><b>3</b><span>차례 마치기</span></li>
    </ol>
    {acquired ? <div className="city-turn-next"><span><CityIcon name="check" />자원 받기 완료</span><a href={`#${handId}`}>손패에서 건설 ↓</a></div>
      : <p>{acquisition === 'PENDING' ? '뽑은 카드 중 받을 카드를 선택하세요.' : '금화 또는 건물 카드 중 하나를 받으세요.'}</p>}
    {acquired && <p>능력과 건설은 원하는 순서로 진행하세요.</p>}
  </div>;
}
