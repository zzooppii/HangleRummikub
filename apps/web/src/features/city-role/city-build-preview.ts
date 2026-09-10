import type { CityJobId, CityPublicBuilding } from '@hangul-rummikub/shared';

/** Preview of ordinary gold construction. Alternative payments and final validation stay on the server. */
export function cityBuildPreview(card: CityPublicBuilding, context: Readonly<{
  buildings: readonly CityPublicBuilding[];
  gold: number;
  job: CityJobId | undefined;
  buildingsBuilt: number;
  taxCollector: boolean;
  wizardImmediate?: boolean;
}>) {
  const { buildings, gold, job, buildingsBuilt } = context;
  const has = (id: string) => buildings.some(b => b.templateId === id);
  const discount = Number(card.category === 'LANDMARK' && has('CB-SP-05'));
  const cost = Math.max(0, card.cost - discount);
  const tax = Number(context.taxCollector && job !== 'TAX_COLLECTOR' && gold > cost);
  const freeBuild = job === 'WIZARD' && context.wizardImmediate === true || card.templateId === 'CB-SP-26' || job === 'TRADER' && card.category === 'TRADE';
  const limit = job === 'ARCHITECT' ? 3 : job === 'SCHOLAR' || job === 'SEER' ? 2 : 1;
  const restriction = card.templateId === 'CB-SP-24' ? '손에 보관 · 종료 +3점'
    : job === 'NAVIGATOR' ? '항해사는 건설 불가'
    : job === 'WITCH' ? '홀린 직업 차례에 건설'
    : has(card.templateId) && !has('CB-SP-22') && job !== 'WIZARD' ? '이미 지은 건물'
    : card.templateId === 'CB-SP-16' && buildings.length >= 5 ? '건물 5채 이상 · 기념비 건설 불가'
    : !freeBuild && buildingsBuilt >= limit ? '이번 차례 건설 횟수 소진' : null;
  const shortfall = Math.max(0, cost - gold);
  const alternative = restriction !== null ? null : has('CB-SP-06') ? '골조 희생으로도 건설 가능'
    : card.templateId === 'CB-SP-18' && buildings.length > 0 ? '내 건물 희생으로도 건설 가능'
    : card.templateId === 'CB-SP-29' ? '대체 건설에서 손패로도 지불 가능'
    : job === 'CARDINAL' && shortfall > 0 ? '추기경 교환 건설에서 지급 카드 여러 장 선택' : null;
  return { cost, discount, tax, freeBuild, limit, restriction, shortfall, alternative,
    reason: restriction ?? (shortfall > 0 ? `금화 ${shortfall}개 부족` : null) };
}
