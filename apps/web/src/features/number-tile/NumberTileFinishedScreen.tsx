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
}>;

export function NumberTileFinishedScreen(
  props: NumberTileFinishedScreenProps,
) {
  const { game, room, self } = props.snapshot;
  const result = game.result;
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
