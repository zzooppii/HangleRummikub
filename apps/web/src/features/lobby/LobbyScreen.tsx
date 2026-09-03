import type { StateSnapshot } from "@hangul-rummikub/shared";

import type { GameStartControl } from "../../lib/game-start.js";

export type LobbyScreenProps = Readonly<{
  snapshot: StateSnapshot;
  invitationUrl: string;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  copyMessage: string | null;
  sessionReplaced: boolean;
  gameStartControl: GameStartControl;
  onCopyInvitation: () => void;
  onStartGame: () => void;
  onGoHome: () => void;
}>;

export function LobbyScreen(props: LobbyScreenProps) {
  const { room, self } = props.snapshot;

  return (
    <main className="app-shell lobby-shell">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">한글 루미큐브</p>
          <h1>게임 대기실</h1>
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

      <div className="lobby-grid">
        <section className="room-card" aria-labelledby="room-code-heading">
          <p className="step-label" id="room-code-heading">
            ROOM CODE
          </p>
          <strong className="room-code-display">{room.roomCode}</strong>
          <p className="room-invite-copy">
            아래 주소를 친구에게 보내 함께 입장하세요.
          </p>
          <output className="invitation-url" aria-label="초대 URL">
            {props.invitationUrl}
          </output>
          <button
            className="primary-button copy-button"
            type="button"
            onClick={props.onCopyInvitation}
          >
            초대 URL 복사
          </button>
          <p className="copy-status" aria-live="polite">
            {props.copyMessage ?? " "}
          </p>
        </section>

        <section className="players-card" aria-labelledby="players-heading">
          <div className="players-heading-row">
            <div>
              <p className="step-label">PLAYERS</p>
              <h2 id="players-heading">참가자</h2>
            </div>
            <span className="player-count" aria-label={`참가자 ${room.players.length}명, 최대 4명`}>
              {room.players.length} / 4
            </span>
          </div>

          <ol className="player-list">
            {room.players.map((player) => {
              const isSelf = player.playerId === self.playerId;
              const isConnected = player.connectionStatus === "CONNECTED";

              return (
                <li className="player-row" key={player.playerId}>
                  <span className="player-avatar" aria-hidden="true">
                    {Array.from(player.nickname)[0]?.toLocaleUpperCase()}
                  </span>
                  <span className="player-identity">
                    <strong>{player.nickname}</strong>
                    <span className="player-badges">
                      {isSelf ? <span className="badge self-badge">나</span> : null}
                      {player.isHost ? (
                        <span className="badge host-badge">방장</span>
                      ) : null}
                    </span>
                  </span>
                  <span
                    className={`presence-label ${isConnected ? "online" : "offline"}`}
                  >
                    <span className="status-dot" aria-hidden="true" />
                    {isConnected ? "접속 중" : "오프라인"}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="waiting-copy">
            참가자 상태는 서버에서 실시간으로 동기화됩니다.
          </p>

          <div className="game-start-panel">
            {props.gameStartControl.isHost ? (
              <button
                className="primary-button"
                type="button"
                disabled={!props.gameStartControl.canStart}
                aria-describedby="game-start-guidance"
                onClick={props.onStartGame}
              >
                게임 시작
              </button>
            ) : null}
            <p id="game-start-guidance" className="game-start-guidance">
              {props.gameStartControl.guidance}
            </p>
          </div>
        </section>
      </div>

      <p className="live-region" aria-live="polite">
        {props.connectionLabel}
      </p>
    </main>
  );
}
