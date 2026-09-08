import {
  GEM_BASIC_RESOURCE_IDS,
  type GemCardPlayingPlatformSnapshotV2,
  type GemCollectSelectionDto,
  type GemMarketSourceDto,
  type GemPurchaseSourceDto,
} from "@hangul-rummikub/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateServerClockOffset, calculateTurnCountdown } from "../../lib/turn-countdown.js";
import {
  GEM_RESOURCE_IDS, GEM_RESOURCE_LABELS, GEM_RESOURCE_MARKERS, GEM_TIER_LABELS,
  formatGemCountdown, gemCardAccessibleLabel, gemCollectPreview, gemFairRoundLabel,
  gemHasMainActionHint, gemPaymentPreview, gemResourceTotal, resolveGemSelectedCard, gemCurrentActionHint,
  toggleGemCollectSelection, type GemResource, type GemUiCard, type GemUiPlayer,
} from "./gem-card-ui.js";
import {
  playGemSound, readGemSoundStorage, shouldAnnounceGemTurn, useGemActionSound,
  writeGemSoundStorage, type GemCardActionFeedback, type GemCardActionKind,
} from "./gem-card-sound.js";
import { GemGameHelp } from "./GemGameHelp.js";
import { GemPurchasePreview } from "./GemPurchasePreview.js";

export type GemCardPlayingScreenProps = Readonly<{
  snapshot: GemCardPlayingPlatformSnapshotV2;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  actionPending: boolean;
  commandRetryKind: GemCardActionKind | null;
  actionFeedback: GemCardActionFeedback | null;
  selectionResetGeneration: number;
  roomLeavePending: boolean;
  canAct: boolean;
  onCollect: (selection: GemCollectSelectionDto) => void;
  onPurchase: (source: GemPurchaseSourceDto) => void;
  onReserve: (source: GemMarketSourceDto) => void;
  onYield: () => void;
  onRetry: () => void;
  onLeaveRoom: () => void;
  onGoHome: () => void;
}>;

export function GemResourceMark({ resource }: Readonly<{ resource: GemResource }>) {
  return <span className={`gem-resource-mark gem-resource-${resource.toLowerCase()}`} aria-hidden="true">{GEM_RESOURCE_MARKERS[resource]}</span>;
}

export function GemResourceRow({ counts, label, production = false }: Readonly<{
  counts: GemUiPlayer["production"] | GemUiPlayer["resources"];
  label: string;
  production?: boolean;
}>) {
  const resources = production ? GEM_BASIC_RESOURCE_IDS : GEM_RESOURCE_IDS;
  return <ul className="gem-resource-row" aria-label={label}>{resources.map(resource => {
    const count = resource === "PRISM" ? ("PRISM" in counts ? counts.PRISM : 0) : counts[resource];
    return <li key={resource}><GemResourceMark resource={resource} /><span>{GEM_RESOURCE_LABELS[resource]}</span><strong>{production ? "+" : ""}{count}</strong></li>;
  })}</ul>;
}

export function GemCardFace({ card }: Readonly<{ card: GemUiCard }>) {
  return <>
    <span className="gem-card-top"><span>{GEM_TIER_LABELS[card.tier]} · {card.tier}단계</span><strong>{card.victoryPoints}<small> 승점</small></strong></span>
    <span className="gem-card-production"><GemResourceMark resource={card.productionResource} /><span>{GEM_RESOURCE_LABELS[card.productionResource]} <strong>영구 할인 +1</strong></span></span>
    <span className="gem-card-cost-title">기본 비용</span>
    <span className="gem-card-costs">{GEM_BASIC_RESOURCE_IDS.filter(resource => card.cost[resource] > 0).map(resource =>
      <span key={resource}><GemResourceMark resource={resource} />{GEM_RESOURCE_LABELS[resource]} <b>{card.cost[resource]}</b></span>
    )}</span>
  </>;
}

export function GemPublicCards({ cards, label }: Readonly<{ cards: readonly GemUiCard[]; label: string }>) {
  return <details className="gem-card-details"><summary>{label} {cards.length}장 보기</summary>
    {cards.length === 0 ? <p className="gem-muted">아직 없습니다.</p> : <ul className="gem-public-card-list">{cards.map(card =>
      <li key={card.cardId} aria-label={gemCardAccessibleLabel(card)}><GemCardFace card={card} /><small className="gem-card-reference">{card.cardId}</small></li>
    )}</ul>}
  </details>;
}

export function GemCardPlayingScreen(props: GemCardPlayingScreenProps) {
  const { game, room, self } = props.snapshot;
  const player = game.playerStates.find(candidate => candidate.playerId === self.playerId);
  const active = room.players.find(candidate => candidate.playerId === game.turn.activePlayerId);
  const isMyTurn = game.turn.activePlayerId === self.playerId;
  const offset = useMemo(() => calculateServerClockOffset(props.snapshot.serverTime, Date.now()), [props.snapshot.serverTime, game.turn.turnId]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [offset, game.turn.turnId]);
  const countdown = calculateTurnCountdown(game.turn.deadlineAt, offset, now);
  const [collect, setCollect] = useState<GemCollectSelectionDto | null>(null);
  const [selected, setSelected] = useState<Readonly<{ source: GemPurchaseSourceDto; cardId: GemUiCard["cardId"] }> | null>(null);
  const actionHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    setCollect(null); setSelected(null);
  }, [game.gameId, game.gameRevision, game.turn.turnId, props.selectionResetGeneration, props.sessionReplaced]);
  const scope = `${room.roomId}:${self.playerId}`;
  const sound = useGemActionSound(scope, props.actionFeedback);
  const turnTracker = useRef({ scope: "", last: null as string | null });
  useEffect(() => {
    const key = `hangul-rummikub:gem-card-turn:${scope}`;
    const tracker = turnTracker.current;
    if (tracker.scope !== key) { tracker.scope = key; tracker.last = readGemSoundStorage("sessionStorage", key); }
    if (props.sessionReplaced || !shouldAnnounceGemTurn(tracker.last, game.turn.turnId, game.turn.activePlayerId, self.playerId)) return;
    tracker.last = game.turn.turnId;
    writeGemSoundStorage("sessionStorage", key, game.turn.turnId);
    if (sound.enabled) playGemSound("TURN_START");
  }, [game.turn.activePlayerId, game.turn.turnId, props.sessionReplaced, scope, self.playerId, sound.enabled]);

  if (player === undefined) return <main className="app-shell"><p role="alert">플레이어 상태를 확인할 수 없습니다. 다시 연결해 주세요.</p></main>;
  const locked = !props.canAct || !isMyTurn || player.forfeited || props.sessionReplaced || props.actionPending || props.commandRetryKind !== null || countdown.expired;
  const card = resolveGemSelectedCard(game, player, selected);
  const payment = card === null ? null : gemPaymentPreview(card, player);
  const collectPreview = gemCollectPreview(collect, player.resources, game.supply);
  const hasMainAction = gemHasMainActionHint(game, player);
  const turnLabel = isMyTurn ? "내 차례입니다" : `${active?.nickname ?? "다른 참가자"}님의 차례입니다`;

  function selectCard(source: GemPurchaseSourceDto, chosen: GemUiCard) {
    if (locked) return;
    setSelected({ source, cardId: chosen.cardId });
    actionHeadingRef.current?.focus();
  }

  return <main className="app-shell gem-shell gem-playing-shell">
    <header className="gem-header">
      <div><p className="eyebrow">보석 카드 게임 · ROOM {room.roomCode}</p><h1>자원을 모아, 다음 한 수.</h1></div>
      <div className="gem-header-actions">
        <GemGameHelp placement="PLAYING" />
        <span className={`connection-chip ${props.connectionTone}`}>{props.connectionLabel}</span>
        <button type="button" className="text-button" onClick={sound.toggle} aria-pressed={sound.enabled}>사운드 {sound.enabled ? "켜짐" : "꺼짐"}</button>
        {!props.sessionReplaced ? <button type="button" className="text-button" disabled={props.roomLeavePending || props.actionPending || props.commandRetryKind !== null} onClick={props.onLeaveRoom}>{props.roomLeavePending ? "나가는 중…" : "게임 나가기"}</button> : null}
      </div>
    </header>
    {props.sessionReplaced ? <section className="notice replaced-notice" role="alert"><p>다른 창에서 연결되었습니다. 이 창에서는 행동할 수 없습니다.</p><button type="button" className="text-button" onClick={props.onGoHome}>홈으로 돌아가기</button></section> : null}
    {props.errorMessage !== null ? <p className="notice error-notice" role="alert">{props.errorMessage}</p> : null}
    <section className={`gem-turn-banner${isMyTurn ? " is-self" : ""}${countdown.remainingSeconds <= 10 ? " warning" : ""}`} aria-label="현재 보석 카드 게임 차례">
      <div><h2>{turnLabel}</h2><p>{isMyTurn ? "행동 하나를 선택하세요 · 자원 받기 / 카드 구매 / 카드 예약" : "시장을 살펴보며 다음 차례를 준비하세요."}</p></div>
      <time role="timer" aria-live="off" className="gem-countdown" aria-label={countdown.expired ? "제한 시간 종료 처리 중" : `남은 시간 ${countdown.remainingSeconds}초`}>{formatGemCountdown(countdown.remainingSeconds)}</time>
    </section>
    {game.fairRound !== null ? <p className="gem-fair-round" role="status">{gemFairRoundLabel(game.fairRound.reason)}</p> : null}
    <p className="live-region" aria-live="polite">{turnLabel}</p>
    <p className="gem-action-feedback" role="status">{props.actionPending ? "서버에서 행동을 확인하고 있습니다…" : props.actionFeedback?.message ?? "카드를 사면 영구 할인과 승점이 쌓입니다."}</p>
    <nav className="gem-mobile-jump" aria-label="게임 영역 바로가기"><a href="#gem-market-heading">시장 보기</a><a href="#gem-my-actions">내 자원·행동</a></nav>

    <div className="gem-table-layout">
      <section className="gem-market" aria-labelledby="gem-market-heading">
        <div className="gem-section-heading"><h2 id="gem-market-heading" tabIndex={-1}>공개 시장</h2><span>목표 18점</span></div>
        {game.market.map(tier => <section className="gem-market-tier" key={tier.tier} aria-label={`${tier.tier}단계 시장`}>
          <header><h3><span>{String(tier.tier).padStart(2, "0")}</span> {GEM_TIER_LABELS[tier.tier]}</h3><small>남은 덱 {tier.remainingDeckCount}장</small></header>
          <div className="gem-market-slots">{tier.slots.map((slot, index) => <div className="gem-market-slot" key={index} data-gem-slot={`${tier.tier}-${index}`}>
            {slot === null ? <div className="gem-empty-slot" aria-label={`${tier.tier}단계 ${index + 1}번 빈 슬롯`}>빈 자리<span>이 단계의 카드가 소진되었습니다.</span></div> :
              <button type="button" className={`gem-card${card?.cardId === slot.cardId ? " is-selected" : ""}`} disabled={locked}
                aria-label={`${gemCardAccessibleLabel(slot)}, 선택`} aria-pressed={card?.cardId === slot.cardId} aria-controls="gem-selected-action"
                onClick={() => { if (index === 0 || index === 1 || index === 2) selectCard({ kind: "MARKET", tier: tier.tier, slotIndex: index }, slot); }}>
                <GemCardFace card={slot} /><span className={`gem-affordability${gemPaymentPreview(slot, player).canAfford ? " available" : ""}`}>{gemPaymentPreview(slot, player).canAfford ? "구매 가능 · 예상" : "자원 부족 · 예상"}</span>
              </button>}
          </div>)}</div>
        </section>)}
      </section>

      <aside className="gem-actions" id="gem-my-actions" tabIndex={-1} aria-label="내 자원과 행동">
        <section className="gem-panel gem-self-panel">
          <div className="gem-section-heading"><h2>내 자원</h2><strong>{gemResourceTotal(player.resources)} / 9개</strong></div>
          <GemResourceRow counts={player.resources} label="내 보유 자원" />
          <h3>영구 할인 <small>앞으로 해당 자원 비용 감소 · 소모되지 않음</small></h3><GemResourceRow counts={player.production} label="내 영구 할인" production />
          <div className="gem-my-score">내 승점 <strong>{player.score}<small> / 목표 18</small></strong></div>
        </section>

        <section className="gem-panel" id="gem-selected-action" aria-labelledby="gem-selection-heading">
          <h2 id="gem-selection-heading" ref={actionHeadingRef} tabIndex={-1}>선택한 카드</h2>
          {card === null || selected === null || payment === null ? <p className="gem-muted">시장 또는 내 예약 카드를 선택하면 구매와 예약을 확인할 수 있습니다. 선택만으로 행동이 실행되지는 않습니다.</p> : <>
            <GemPurchasePreview card={card} player={player} />
            <div className="gem-button-row"><button type="button" className="primary-button" disabled={locked || !payment.canAfford} onClick={() => props.onPurchase(selected.source)}>구매</button>
              {selected.source.kind === "MARKET" ? <button type="button" className="secondary-button" disabled={locked || player.reservedCards.length >= 2} onClick={() => { const source = selected.source; if (source.kind === "MARKET") props.onReserve({ tier: source.tier, slotIndex: source.slotIndex }); }}>예약</button> : null}</div>
            {selected.source.kind === "MARKET" ? <p className="gem-muted">예약 {player.reservedCards.length} / 2장 · 예약 보상은 없습니다.{player.reservedCards.length >= 2 ? " 예약 한도에 도달했습니다." : ""}</p> : null}
          </>}
        </section>

        <section className="gem-panel" aria-labelledby="gem-collect-heading">
          <div className="gem-section-heading"><h2 id="gem-collect-heading">자원 받기</h2><span>공용 공급</span></div>
          {isMyTurn ? <p className="gem-context-hint">{gemCurrentActionHint(game, player)}</p> : null}
          <p className="gem-muted">기본 자원 1~2종, 또는 프리즘 1개만.</p>
          <div className="gem-supply-selectors">{GEM_RESOURCE_IDS.map(resource => {
            const chosen = collect?.kind === "PRISM" ? resource === "PRISM" : resource !== "PRISM" && (collect?.resources.includes(resource) ?? false);
            return <button type="button" key={resource} className={`gem-supply-selector${chosen ? " is-selected" : ""}`} aria-pressed={chosen}
              disabled={locked || game.supply[resource] === 0 || gemResourceTotal(player.resources) >= 9}
              aria-label={`${GEM_RESOURCE_LABELS[resource]}, 공급 ${game.supply[resource]}개, ${chosen ? "선택 취소" : "선택"}`}
              onClick={() => setCollect(current => toggleGemCollectSelection(current, resource))}><GemResourceMark resource={resource} /><strong>{GEM_RESOURCE_LABELS[resource]}</strong><span>공급 {game.supply[resource]}</span></button>;
          })}</div>
          <p className="gem-collect-count">{collect?.kind === "PRISM" ? "프리즘 1개 선택" : `기본 자원 선택 ${collectPreview.count} / 2`} · 예상 보유 {gemResourceTotal(player.resources) + collectPreview.count} / 9</p>
          <p className="gem-collect-hint" role="status">{collectPreview.message}</p>
          <button type="button" className="primary-button" disabled={locked || !collectPreview.canCollect} onClick={() => { if (collect !== null) props.onCollect(collect); }}>선택한 자원 받기</button>
        </section>

        <section className="gem-panel" aria-labelledby="gem-reserved-heading"><div className="gem-section-heading"><h2 id="gem-reserved-heading">내 예약 카드</h2><span>{player.reservedCards.length} / 2장</span></div>
          {player.reservedCards.length === 0 ? <p className="gem-muted">시장 카드를 예약해 두고 나중에 구매할 수 있습니다.</p> : <div className="gem-reserved-cards">{player.reservedCards.map(reserved => <button type="button" key={reserved.cardId} className={`gem-card${card?.cardId === reserved.cardId ? " is-selected" : ""}`} disabled={locked} aria-pressed={card?.cardId === reserved.cardId} aria-label={`내 예약 ${gemCardAccessibleLabel(reserved)}, 구매 선택`} onClick={() => selectCard({ kind: "RESERVED", cardId: reserved.cardId }, reserved)}><GemCardFace card={reserved} /></button>)}</div>}
        </section>
        <section className="gem-yield-panel"><button type="button" className="secondary-button" disabled={locked || hasMainAction} onClick={props.onYield}>행동 없이 턴 종료</button><p className="gem-muted">구매·예약·자원 받기가 모두 불가능할 때만 사용할 수 있습니다. 서버가 가능 여부를 확인합니다.</p></section>
        {props.commandRetryKind !== null ? <section className="notice gem-retry" role="alert"><p>이전 행동의 응답을 확인하지 못했습니다. 같은 요청으로 결과를 다시 확인하세요.</p><button type="button" className="primary-button" disabled={props.actionPending || !props.canAct || props.sessionReplaced} onClick={props.onRetry}>이전 행동 다시 확인</button></section> : null}
      </aside>
    </div>

    <section className="gem-players gem-compact-players" aria-labelledby="gem-players-heading"><div className="gem-section-heading"><h2 id="gem-players-heading">플레이어 현황</h2><span>자원과 소유 카드는 모두 공개됩니다.</span></div>
      {game.playerStates.map(state => {
        const roomPlayer = room.players.find(candidate => candidate.playerId === state.playerId);
        return <article className={`gem-player gem-player-summary${state.forfeited ? " is-forfeited" : ""}`} key={state.playerId}>
          <header><div><h3>{roomPlayer?.nickname ?? "참가자"}{state.playerId === self.playerId ? " · 나" : ""}</h3><span>{state.forfeited ? "기권 · 최종 상태 유지" : state.playerId === game.turn.activePlayerId ? "현재 차례" : roomPlayer?.connectionStatus === "CONNECTED" ? "접속 중" : "연결 끊김"}</span></div><strong className="gem-player-score">{state.score}<small> / 18점</small></strong></header>
          {state.playerId !== self.playerId ? <div className="gem-player-compact-counts"><span>자원</span><GemResourceRow counts={state.resources} label={`${roomPlayer?.nickname ?? "참가자"} 보유 자원`} />
          <span>영구 할인</span><GemResourceRow counts={state.production} label={`${roomPlayer?.nickname ?? "참가자"} 영구 할인`} production /></div> : <p className="gem-muted">내 자원과 영구 할인은 위 행동 패널에서 확인하세요.</p>}
          <div className="gem-player-card-details"><GemPublicCards cards={state.purchasedCards} label="구매 카드" /><GemPublicCards cards={state.reservedCards} label="예약 카드 · 공개" /></div>
        </article>;
      })}
    </section>
  </main>;
}
