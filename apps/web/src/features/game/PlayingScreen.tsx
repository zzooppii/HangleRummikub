import type { PlayingStateSnapshot } from "@hangul-rummikub/shared";

import { TurnDraftEditor } from "./TurnDraftEditor.js";
import type { TurnDraftController } from "./use-turn-draft.js";

export type PlayingScreenProps = Readonly<{
  snapshot: PlayingStateSnapshot;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  turnDraft: TurnDraftController;
  onGoHome: () => void;
}>;

export function PlayingScreen(props: PlayingScreenProps) {
  const { game, room, self } = props.snapshot;
  const activePlayer = room.players.find(
    (player) => player.playerId === game.turn.activePlayerId,
  );

  return (
    <main className="app-shell playing-shell">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">ROOM {room.roomCode}</p>
          <h1>게임이 시작되었습니다.</h1>
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

      <section className="game-summary" aria-label="현재 게임 상태">
        <article className="summary-card turn-summary">
          <p className="step-label">CURRENT TURN</p>
          <h2>현재 차례</h2>
          <strong className="summary-value">
            {activePlayer?.nickname ?? "참가자 확인 중"}
          </strong>
        </article>

        <article className="summary-card">
          <p className="step-label">PLAYERS</p>
          <h2>참가자</h2>
          <strong className="summary-value">{room.players.length}명</strong>
        </article>

        <article className="summary-card">
          <p className="step-label">BAG</p>
          <h2>남은 타일</h2>
          <dl className="bag-summary">
            <div>
              <dt>자음</dt>
              <dd>{game.bagCounts.consonant}개</dd>
            </div>
            <div>
              <dt>모음</dt>
              <dd>{game.bagCounts.vowel}개</dd>
            </div>
          </dl>
        </article>

        <article className="summary-card rack-summary">
          <p className="step-label">MY RACK</p>
          <h2>내 타일</h2>
          <strong className="summary-value">{self.rack.length}개</strong>
        </article>
      </section>

      <section className="playing-participants" aria-label="참가자 상태">
        {room.players.map((player) => (
          <div
            className={`playing-player${
              player.playerId === game.turn.activePlayerId ? " active" : ""
            }`}
            key={player.playerId}
          >
            <strong>{player.nickname}</strong>
            <span>
              {player.playerId === self.playerId ? "나 · " : ""}
              {player.isHost ? "방장 · " : ""}
              {player.connectionStatus === "CONNECTED"
                ? "접속 중"
                : "오프라인"}
            </span>
            <small>
              랙 {player.rackCount}개 · 첫 등록{" "}
              {player.initialMeldCompleted ? "완료" : "대기"}
            </small>
          </div>
        ))}
      </section>

      <TurnDraftEditor snapshot={props.snapshot} controller={props.turnDraft} />

      <p className="live-region" aria-live="polite">
        {props.turnDraft.noticeMessage ??
          props.turnDraft.editErrorMessage ??
          props.connectionLabel}
      </p>
    </main>
  );
}
