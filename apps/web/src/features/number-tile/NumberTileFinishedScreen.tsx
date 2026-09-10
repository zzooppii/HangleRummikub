import { useEffect, useRef } from "react";
import { TileButton } from "./NumberTileTurnDraftEditor.js";
import type {
  NumberTileFinishedPlatformSnapshotV2,
  NumberTilePlayerResultEntryV2,
} from "@hangul-rummikub/shared";

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function reasonLabel(
  reason: NumberTileFinishedPlatformSnapshotV2["game"]["result"]["reason"],
): string {
  switch (reason) {
    case "RACK_EMPTY":
      return "한 참가자가 랙을 모두 비웠습니다.";
    case "PLACEMENT_COMPLETE": return "모든 참가자의 순위가 확정되었습니다.";
    case "STALEMATE":
      return "풀 소진 후 한 바퀴 동안 배치가 없어 종료되었습니다.";
    case "LAST_PLAYER_STANDING":
      return "마지막 남은 참가자가 승리했습니다.";
  }
}

export type NumberTileFinishedScreenProps = Readonly<{
  snapshot: NumberTileFinishedPlatformSnapshotV2;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  roomLeavePending: boolean;
  onLeaveRoom: () => void;
  onGoHome: () => void;
  onRematch?: () => void;
  rematchPending?: boolean;
}>;

function NumberPlacementFinished(props: NumberTileFinishedScreenProps) {
  const { game, room } = props.snapshot, dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const modal = dialog.current; if (modal && !modal.open) modal.showModal(); }, [game.gameId]);
  if (!("rankingMode" in game.result)) return null;
  const host = room.players.some(p => p.playerId === props.snapshot.self.playerId && p.isHost);
  const face = (tile: (typeof game.privateState.rack)[number]) => <TileButton key={tile.tileId} tile={tile} locationLabel="마지막 게임판" interactionLabel="보기 전용" disabled onSelect={() => {}} />;
  return <main className="app-shell playing-shell number-playing-shell number-placement-finished">
    <header className="lobby-header"><div><p className="eyebrow">숫자 타일 게임 · ROOM {room.roomCode}</p><h1>순위 결정 완료</h1></div>
      <span className={`connection-chip ${props.connectionTone}`}>{props.connectionLabel}</span>
      <button type="button" onClick={() => dialog.current?.showModal()}>게임 결과</button>
      <button type="button" disabled={props.roomLeavePending} onClick={props.onLeaveRoom}>방 나가기</button></header>
    {props.errorMessage ? <p role="alert">{props.errorMessage}</p> : null}
    <section className="number-board-surface" aria-label="마지막 공용 테이블">{game.table.melds.map((meld,i) => <div className="number-final-meld" key={i}>{meld.tiles.map(face)}</div>)}</section>
    <section aria-label="내 남은 랙" className="number-final-rack"><h2>내 남은 타일 · {game.privateState.rack.length}개</h2><div>{game.privateState.rack.map(face)}</div></section>
    <dialog ref={dialog} className="number-result-modal" aria-labelledby="number-placement-result-heading">
      <h2 id="number-placement-result-heading">게임 결과</h2><p>{game.result.reason === "LAST_PLAYER_STANDING" ? "기권으로 남은 참가자의 순위가 확정되었습니다." : reasonLabel(game.result.reason)}</p>
      <ol className="score-list">{game.result.rankings.map(entry => <li key={entry.playerId}><strong>{entry.rank}위</strong><span>{room.players.find(p => p.playerId === entry.playerId)?.nickname ?? "참가자"}{entry.forfeited ? " · 기권" : ""}<small>남은 타일 {entry.remainingRackCount}개</small></span></li>)}</ol>
      <button type="button" onClick={() => dialog.current?.close()}>결과 닫기</button>
      {host ? <button type="button" className="primary-button" disabled={props.sessionReplaced || props.connectionTone !== "connected" || props.rematchPending} onClick={props.onRematch}>대기실로 돌아가기</button> : <p>방장이 새 게임을 준비할 때까지 기다려 주세요.</p>}
    </dialog>
  </main>;
}

export function NumberTileFinishedScreen(
  props: NumberTileFinishedScreenProps,
) {
  const { game, room, self } = props.snapshot;
  const result = game.result;
  if ("rankingMode" in result) return <NumberPlacementFinished {...props} />;
  const entries: readonly NumberTilePlayerResultEntryV2[] =
    result.reason === "STALEMATE" ? result.rankings : result.playerResults;
  const winnerIds = new Set(result.winnerPlayerIds);

  return (
    <main className="app-shell playing-shell number-playing-shell">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">숫자 타일 게임 · ROOM {room.roomCode}</p>
          <h1>게임이 끝났습니다.</h1>
        </div>
        <span className={`connection-chip ${props.connectionTone}`}>
          <span className="status-dot" aria-hidden="true" />
          {props.connectionLabel}
        </span>
      </header>

      {props.sessionReplaced ? (
        <section className="notice replaced-notice" role="alert">
          <div>
            <strong>이 플레이어 세션이 다른 창에서 연결되었습니다.</strong>
            <span>이 창에서는 더 이상 명령을 보내지 않습니다.</span>
          </div>
          <button className="text-button" type="button" onClick={props.onGoHome}>
            홈으로 돌아가기
          </button>
        </section>
      ) : null}
      {props.errorMessage !== null ? (
        <p className="notice error-notice" role="alert">
          {props.errorMessage}
        </p>
      ) : null}

      <section className="finish-panel" aria-labelledby="number-result-heading">
        <p className="step-label">NUMBER TILE RESULT</p>
        <h2 id="number-result-heading">{reasonLabel(result.reason)}</h2>
        <ol className="score-list" aria-label="서버가 확정한 최종 결과">
          {entries.map((entry) => {
            const player = room.players.find(
              (candidate) => candidate.playerId === entry.playerId,
            );
            const rank = "rank" in entry ? entry.rank : null;
            return (
              <li key={entry.playerId}>
                <span className="result-rank">
                  {rank === null
                    ? winnerIds.has(entry.playerId)
                      ? "승자"
                      : "결과"
                    : `${rank}위`}
                </span>
                <span className="result-player">
                  <strong>{player?.nickname ?? "참가자"}</strong>
                  {entry.playerId === self.playerId ? " (나)" : ""}
                  {winnerIds.has(entry.playerId) ? " · 승자" : ""}
                  {entry.forfeited ? " · 기권" : ""}
                  <small>
                    남은 타일 {entry.remainingRackCount}개 · 벌점 {entry.penaltyCost}
                  </small>
                </span>
                <strong className="result-score">{scoreLabel(entry.score)}</strong>
              </li>
            );
          })}
        </ol>
        {!props.sessionReplaced ? (
          <button
            className="secondary-button"
            type="button"
            disabled={props.roomLeavePending}
            aria-busy={props.roomLeavePending}
            onClick={props.onLeaveRoom}
          >
            {props.roomLeavePending ? "나가는 중..." : "방 나가기"}
          </button>
        ) : null}
      </section>
      <p className="live-region" aria-live="polite">
        {props.connectionLabel}
      </p>
    </main>
  );
}
