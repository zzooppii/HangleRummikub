import { GEM_BASIC_RESOURCE_IDS } from "@hangul-rummikub/shared";
import { GEM_RESOURCE_IDS, GEM_RESOURCE_LABELS, gemPaymentPreview, type GemUiCard, type GemUiPlayer } from "./gem-card-ui.js";
import { GemResourceMark } from "./GemVisuals.js";

/** Pure snapshot explanation. Never supplies a payment plan to the command owner. */
export function GemPurchasePreview({ card, player }: Readonly<{ card: GemUiCard; player: GemUiPlayer }>) {
  const payment = gemPaymentPreview(card, player);
  const owned = GEM_RESOURCE_IDS.filter(resource => player.resources[resource] > 0).map(resource => `${GEM_RESOURCE_LABELS[resource]} ${player.resources[resource]}`).join(" · ");
  return <div className="gem-purchase-explanation">
    <div className="gem-selected-benefit"><strong>승점 {card.victoryPoints}점</strong><span>{GEM_RESOURCE_LABELS[card.productionResource]} 영구 할인 +1</span></div>
    <div className="gem-effective-cost" aria-label="할인 적용 후 필요한 자원">{GEM_BASIC_RESOURCE_IDS.filter(resource => card.cost[resource] > 0).map(resource => <span key={resource}><GemResourceMark resource={resource} /><span>{GEM_RESOURCE_LABELS[resource]}<strong>{payment.effective[resource]}</strong></span></span>)}</div>
    <details className="gem-payment-details"><summary>비용과 영구 할인 상세</summary><table className="gem-payment-table"><caption>기본 비용 → 내 할인 적용 후</caption>
      <thead><tr><th>자원</th><th>기본</th><th>영구 할인</th><th>실제 비용</th></tr></thead>
      <tbody>{GEM_BASIC_RESOURCE_IDS.filter(resource => card.cost[resource] > 0).map(resource => <tr key={resource}><th>{GEM_RESOURCE_LABELS[resource]}</th><td>{card.cost[resource]}</td><td>−{player.production[resource]}</td><td><strong>{payment.effective[resource]}</strong></td></tr>)}</tbody>
    </table></details>
    <p className="gem-owned-preview">현재 보유 자원: {owned || "없음"}</p>
    {payment.canAfford ? <div className="gem-purchase-availability available" role="status">
      <strong>{payment.isFree ? "구매 가능 · 할인으로 무료" : "구매 가능"}</strong>
      <p>실제 예상 지불: {payment.isFree ? "없음 (0개)" : [...GEM_BASIC_RESOURCE_IDS.filter(resource => payment.basicPayment[resource] > 0).map(resource => `${GEM_RESOURCE_LABELS[resource]} ${payment.basicPayment[resource]}`), ...(payment.prismRequired > 0 ? [`프리즘 ${payment.prismRequired}`] : [])].join(" · ")}</p>
    </div> : <div className="gem-purchase-availability unavailable" role="status">
      <strong>구매 불가 · 자원 부족</strong>
      <p>부족한 기본 자원: {GEM_BASIC_RESOURCE_IDS.filter(resource => payment.missing[resource] > 0).map(resource => `${GEM_RESOURCE_LABELS[resource]} ${payment.missing[resource]}`).join(" · ")}</p>
      <p>프리즘 대체 필요 {payment.prismRequired}개 · 보유 {payment.prismOwned}개</p>
      <small>보유 프리즘으로도 {payment.prismRequired - payment.prismOwned}개 부족합니다.</small>
    </div>}
    <small className="gem-muted">기본 자원을 먼저 쓰고 부족분만 프리즘으로 채웁니다. 실제 지불과 구매는 서버가 확정합니다.</small>
  </div>;
}
