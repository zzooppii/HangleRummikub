import { GEM_RESOURCE_IDS, GEM_RESOURCE_LABELS, type GemResource, type GemUiCard } from "./gem-card-ui.js";

/** Public resource identity only. Shapes remain distinguishable without colour. */
const GEM_SHAPES: Readonly<Record<GemResource, string>> = {
  DAWN: "M16 2 28 9 28 23 16 30 4 23 4 9Z",
  TIDE: "M16 2C12 10 4 15 4 21a12 10 0 0 0 24 0C28 15 20 10 16 2Z",
  GROVE: "M5 27C-1 10 13 3 29 3c0 16-7 30-24 24Z",
  EMBER: "m16 1 13 17-13 13L3 18Z",
  ECHO: "m10 2 12 0 8 14-8 14H10L2 16Z",
  PRISM: "m16 1 15 27H1Z",
};

export function GemResourceMark({ resource }: Readonly<{ resource: GemResource }>) {
  return <span className={`gem-resource-mark gem-resource-${resource.toLowerCase()}`} aria-hidden="true">
    <svg viewBox="0 0 32 32" focusable="false"><path d={GEM_SHAPES[resource]} fill="currentColor" stroke="#ffffffb0" strokeWidth="1.4" />
      <path d="m16 5-6 11 6 12 7-12Z" fill="#fff" opacity=".24" /><path d="m6 14 10 2 11-2M16 5v23" fill="none" stroke="#fff" opacity=".58" strokeWidth="1" />
    </svg>
  </span>;
}

export function GemCardArt({ card }: Readonly<{ card: GemUiCard }>) {
  return <span className="gem-card-art" data-gem-art={card.productionResource} data-tier={card.tier} aria-hidden="true">
    <img src={`/gem-art/v1/${card.productionResource.toLowerCase()}.webp`} width="512" height="512" alt="" loading="lazy" decoding="async" draggable={false} />
    <span className="gem-art-corner"><GemResourceMark resource={card.productionResource} /></span>
  </span>;
}

export function GemResourceLegend() {
  return <div className="gem-resource-legend" aria-label="보석 자원 안내">{GEM_RESOURCE_IDS.map(resource =>
    <span key={resource}><GemResourceMark resource={resource} /><strong>{GEM_RESOURCE_LABELS[resource]}</strong></span>
  )}<p>기본 자원은 같은 표시의 비용에 사용합니다. 프리즘은 부족한 기본 자원을 대신합니다.</p></div>;
}
