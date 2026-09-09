import type { CityRoleFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { CityBuildingFace } from "./CityRolePlayingScreen.js";
import { cityCardLabel, cityFinishReasonLabel, cityRoleLabel, type CityActionFeedback } from "./city-role-ui.js";
import { CityGameHelp } from "./CityGameHelp.js";
import { useCitySound } from "./city-role-sound.js";

export type CityRoleFinishedScreenProps = Readonly<{
  snapshot: CityRoleFinishedPlatformSnapshotV2;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  actionFeedback: CityActionFeedback | null;
  actionPending: boolean;
  retryPending: boolean;
  roomLeavePending: boolean;
  onRetry: () => void;
  onLeaveRoom: () => void;
  onGoHome: () => void;
}>;

export function CityRoleFinishedScreen(props: CityRoleFinishedScreenProps) {
  const { room, game, self } = props.snapshot;
  const sound = useCitySound(props.snapshot, props.actionFeedback, props.sessionReplaced, true);
  const winners = game.result.winnerPlayerIds.map(id => room.players.find(player => player.playerId === id)?.nickname ?? "참가자");
  return <main className="app-shell city-shell city-finished-shell">
    <header className="city-header"><div><p className="eyebrow">비밀 도시 게임 · ROOM {room.roomCode}</p><h1>우리 도시의 마지막 기록.</h1></div><div className="city-header-actions"><span className={`connection-chip ${props.connectionTone}`}>{props.connectionLabel}</span><CityGameHelp placement="PLAYING" rulesVersion={game.rulesVersion} /><button type="button" className="text-button" aria-pressed={sound.enabled} onClick={sound.toggle}>사운드 {sound.enabled ? "켜짐" : "꺼짐"}</button></div></header>
    {props.sessionReplaced ? <section className="notice replaced-notice" role="alert"><p>다른 창에서 연결되었습니다. 이 창에서는 명령을 보내지 않습니다.</p><button type="button" className="text-button" onClick={props.onGoHome}>홈으로 돌아가기</button></section> : null}
    {props.errorMessage !== null ? <p className="notice error-notice" role="alert">{props.errorMessage}</p> : null}
    {props.actionFeedback !== null ? <p className="city-action-feedback" role="status">{props.actionFeedback.message}</p> : null}
    {props.retryPending ? <section className="notice" role="status"><p>마지막 행동의 결과를 확인해야 합니다. 같은 요청으로 다시 확인할 수 있습니다.</p><button type="button" className="secondary-button" disabled={props.connectionTone !== "connected" || props.actionPending || props.sessionReplaced || props.roomLeavePending} onClick={props.onRetry}>이전 행동 결과 다시 확인</button></section> : null}
    <section className="city-finish-hero" aria-labelledby="city-finish-heading"><p className="step-label">서버가 확정한 최종 결과 · 라운드 {game.roundNumber}</p><h2 id="city-finish-heading">{cityFinishReasonLabel(game.result.reason)}</h2><p role="status">{winners.length === 0 ? "이번 게임은 우승자 없이 종료되었습니다." : <><strong>{winners.join(" · ")}</strong> {winners.length > 1 ? "공동 우승" : "우승"}</>}</p></section>
    <ol className="city-results" aria-label="최종 순위와 점수">{game.result.rankings.map(entry => {
      const participant = room.players.find(player => player.playerId === entry.playerId);
      const player = game.playerStates.find(state => state.playerId === entry.playerId);
      return <li className={`city-result-row${entry.winner ? " is-winner" : ""}`} key={entry.playerId}><header><div><span className="city-result-rank">{entry.rank}위{entry.winner ? " · 우승" : ""}</span><h3>{participant?.nickname ?? "참가자"}{entry.playerId === self.playerId ? " · 나" : ""}</h3><p>{entry.forfeited ? "기권 · " : ""}건물 {entry.buildingCount}개</p></div><strong className="city-result-score">{entry.score}<small>점</small></strong></header>
        <dl className="city-score-details"><div><dt>건물 점수</dt><dd>{entry.buildingVP}</dd></div><div><dt>완성 보너스</dt><dd>+{entry.completionBonus}</dd></div><div><dt>다양성 보너스</dt><dd>+{entry.diversityBonus}</dd></div>{entry.landmarkBonus !== undefined ? <div><dt>명소 보너스</dt><dd>+{entry.landmarkBonus}</dd></div> : null}</dl>
        {player !== undefined && player.builtBuildings.length > 0 ? <div className="city-card-grid city-built-grid">{player.builtBuildings.map(card => <div className="city-building is-built" key={card.cardId} aria-label={cityCardLabel(card)}><CityBuildingFace card={card} rulesVersion={game.rulesVersion} /></div>)}</div> : null}
      </li>;
    })}</ol>
    <details className="city-panel city-frozen-private"><summary>내 마지막 비공개 정보 보기</summary><p>다른 참가자의 손패와 비밀 역할은 게임이 끝나도 공개하지 않습니다.</p><p>내 역할: {game.privateState.selectedRoleIds.length === 0 ? "없음" : game.privateState.selectedRoleIds.map(cityRoleLabel).join(" · ")}</p>
      <h3>남은 내 손패 {game.privateState.hand.length}장</h3><div className="city-card-grid">{game.privateState.hand.map(card => <div className="city-building" key={card.cardId} aria-label={cityCardLabel(card)}><CityBuildingFace card={card} rulesVersion={game.rulesVersion} /></div>)}</div>
      {game.privateState.pendingCards !== undefined ? <><h3>종료 시 선택 대기 중이던 카드</h3><p>종료된 게임에서는 더 이상 선택하지 않습니다.</p><div className="city-card-grid">{game.privateState.pendingCards.map(card => <div className="city-building" key={card.cardId} aria-label={cityCardLabel(card)}><CityBuildingFace card={card} rulesVersion={game.rulesVersion} /></div>)}</div></> : null}
    </details>
    {!props.sessionReplaced ? <button type="button" className="secondary-button" disabled={props.roomLeavePending || props.actionPending || props.retryPending} aria-busy={props.roomLeavePending} onClick={props.onLeaveRoom}>{props.roomLeavePending ? "나가는 중…" : "방 나가기"}</button> : null}
  </main>;
}
