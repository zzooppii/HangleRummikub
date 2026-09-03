import type { FinishedStateSnapshot } from "@hangul-rummikub/shared";

export type FinishedScreenProps = Readonly<{
  snapshot: FinishedStateSnapshot;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  roomLeavePending: boolean;
  onLeaveRoom: () => void;
  onGoHome: () => void;
}>;

export function FinishedScreen(props: FinishedScreenProps) {
  const { game, room, self } = props.snapshot;
  const winner = room.players.find(
    (player) => player.playerId === game.result.winnerPlayerId,
  );

  return (
    <main className="app-shell playing-shell">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">ROOM {room.roomCode}</p>
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

      <section className="finish-panel" aria-labelledby="game-result-heading">
        <p className="step-label">GAME RESULT</p>
        <h2 id="game-result-heading">
          {winner?.nickname ?? "승자"}님이 랙을 모두 비웠습니다.
        </h2>
        <ol className="score-list" aria-label="최종 점수">
          {game.result.scores.map((entry) => {
            const player = room.players.find(
              (candidate) => candidate.playerId === entry.playerId,
            );
            return (
              <li key={entry.playerId}>
                <span>
                  {player?.nickname ?? "참가자"}
                  {entry.playerId === self.playerId ? " (나)" : ""}
                  {entry.playerId === game.result.winnerPlayerId
                    ? " · 승자"
                    : ""}
                  {player?.forfeited ? " · 기권" : ""}
                </span>
                <strong>
                  {entry.score > 0 ? `+${entry.score}` : entry.score}점
                </strong>
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
    </main>
  );
}
