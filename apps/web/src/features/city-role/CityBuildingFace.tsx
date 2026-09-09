import type { CityUiCard } from "./city-role-ui.js";
import { cityLandmarkText } from "./city-landmarks.js";
import { CityTemplateArt } from "./CityTemplateArt.js";
import { CityCategoryBadge, CityIcon } from "./CityVisuals.js";

/** One public card face across hands, choices, cities and results; never computes legality. */
export function CityBuildingFace({ card, rulesVersion = "city-rules-v1" }: Readonly<{ card: CityUiCard; rulesVersion?: string }>) {
  const effect = cityLandmarkText(rulesVersion, card.templateId);
  return <>
    <CityCategoryBadge category={card.category} />
    <span className="city-impact-card" data-impact-card={card.cardId}><CityTemplateArt category={card.category} templateId={card.templateId} /></span>
    <strong className="city-building-name">{card.name}</strong>
    <span className="city-building-value">
      <span className="city-card-cost"><CityIcon name="coin" /><span>금화 <b>{card.cost}</b></span></span>
      <span className="city-card-vp"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2 2.9 6 6.6 1-4.8 4.6 1.1 6.6-5.8-3.1-5.8 3.1 1.1-6.6L2.5 9l6.6-1Z" fill="currentColor"/></svg><span><b>{card.victoryPoints}</b>점</span></span>
    </span>
    {effect ? <span className="city-landmark-effect" title={effect.detail}><strong>★ 특수 능력</strong><span>{effect.short}</span></span> : null}
  </>;
}
