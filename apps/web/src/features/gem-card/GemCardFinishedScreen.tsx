import type { GemCardFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { GemCardFace, GemPublicCards, GemResourceRow } from "./GemCardPlayingScreen.js";
import { gemCardAccessibleLabel, gemFinishReasonLabel } from "./gem-card-ui.js";
import { useGemActionSound, type GemCardActionFeedback } from "./gem-card-sound.js";

export type GemCardFinishedScreenProps = Readonly<{
  snapshot: GemCardFinishedPlatformSnapshotV2;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  roomLeavePending: boolean;
  actionFeedback?: GemCardActionFeedback | null;
  onLeaveRoom: () => void;
  onGoHome: () => void;
}>;

export function GemCardFinishedScreen(props: GemCardFinishedScreenProps) {
  const { room, game, self } = props.snapshot;
  const result = game.result;
  useGemActionSound(`${room.roomId}:${self.playerId}`, props.actionFeedback ?? null);
  const winners = result.winnerPlayerIds.map(id => room.players.find(player => player.playerId === id)?.nickname ?? "참가자");
  return <main className="app-shell gem-shell">
    <header className="gem-header"><div><p className="eyebrow">보석 카드 게임 · ROOM {room.roomCode}</p><h1>함께 만든 마지막 한 수.</h1></div><span className={`connection-chip ${props.connectionTone}`}>{props.connectionLabel}</span></header>
    {props.sessionReplaced ? <section className="notice replaced-notice" role="alert"><p>다른 창에서 연결되었습니다. 이 창에서는 명령을 보내지 않습니다.</p><button type="button" className="text-button" onClick={props.onGoHome}>홈으로 돌아가기</button></section> : null}
    {props.errorMessage !== null ? <p className="notice error-notice" role="alert">{props.errorMessage}</p> : null}
    {props.actionFeedback ? <p className="gem-action-feedback" role="status">{props.actionFeedback.message}</p> : null}
    <section className="gem-finish-hero" aria-labelledby="gem-finish-heading"><p className="step-label">서버가 확정한 최종 결과</p><h2 id="gem-finish-heading">{gemFinishReasonLabel(result.reason)}</h2><p role="status"><strong>{winners.join(" · ")}</strong> {winners.length > 1 ? "공동 우승" : "우승"}</p></section>
    <ol className="gem-results" aria-label="서버 순위와 최종 공개 정보">{result.rankings.map(entry => {
      const player = room.players.find(candidate => candidate.playerId === entry.playerId);
      const state = game.playerStates.find(candidate => candidate.playerId === entry.playerId);
      return <li className="gem-player" key={entry.playerId}><header><div><p className="gem-rank">{entry.rank}위{result.winnerPlayerIds.includes(entry.playerId) ? " · 우승" : ""}</p><h3>{player?.nickname ?? "참가자"}{entry.playerId === self.playerId ? " · 나" : ""}</h3><span>{entry.forfeited ? "기권 · " : ""}구매 카드 {entry.purchasedCardCount}장</span></div><strong className="gem-player-score">{entry.score}<small>점</small></strong></header>
        {state === undefined ? null : <><GemResourceRow counts={state.resources} label="최종 보유 자원" /><GemResourceRow counts={state.production} label="최종 생산 할인" production /><div className="gem-player-card-details"><GemPublicCards cards={state.purchasedCards} label="구매 카드" /><GemPublicCards cards={state.reservedCards} label="예약 카드 · 공개" /></div></>}
      </li>;
    })}</ol>
    <details className="gem-panel gem-final-market"><summary>최종 시장과 공용 공급 보기</summary><GemResourceRow counts={game.supply} label="최종 공용 공급" />{game.market.map(tier => <section className="gem-market-tier" key={tier.tier}><h3>{tier.tier}단계 · 남은 덱 {tier.remainingDeckCount}장</h3><div className="gem-market-slots">{tier.slots.map((card, index) => <div className="gem-market-slot" key={index} data-gem-slot={`${tier.tier}-${index}`}>{card === null ? <div className="gem-empty-slot" aria-label={`${tier.tier}단계 ${index + 1}번 빈 슬롯`}>빈 자리</div> : <div className="gem-card" aria-label={gemCardAccessibleLabel(card)}><GemCardFace card={card} /></div>}</div>)}</div></section>)}</details>
    {!props.sessionReplaced ? <button type="button" className="secondary-button" disabled={props.roomLeavePending} aria-busy={props.roomLeavePending} onClick={props.onLeaveRoom}>{props.roomLeavePending ? "나가는 중…" : "방 나가기"}</button> : null}
  </main>;
}
