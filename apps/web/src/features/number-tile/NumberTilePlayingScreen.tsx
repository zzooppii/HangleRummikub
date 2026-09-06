import type { NumberTilePlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { useEffect, useMemo, useState } from "react";

import {
  calculateServerClockOffset,
  calculateTurnCountdown,
} from "../../lib/turn-countdown.js";
import { NumberTileTurnDraftEditor } from "./NumberTileTurnDraftEditor.js";
import type { NumberTileTurnDraft } from "./number-tile-turn-draft.js";
import type { NumberTileTurnDraftController } from "./use-number-tile-turn-draft.js";

export type NumberTilePlayingScreenProps = Readonly<{
  snapshot: NumberTilePlayingPlatformSnapshotV2;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  sessionReplaced: boolean;
  turnDraft: NumberTileTurnDraftController;
  submitPending: boolean;
  actionPending: boolean;
  commandRetryKind: "SUBMIT" | "DRAW" | "PASS" | null;
  roomLeavePending: boolean;
  canSubmit: boolean;
  canAct: boolean;
  onSubmit: (draft: NumberTileTurnDraft) => void;
  onDraw: () => void;
  onPass: () => void;
  onLeaveRoom: () => void;
  onGoHome: () => void;
}>;

export function NumberTilePlayingScreen(
  props: NumberTilePlayingScreenProps,
) {
  const { game, room, self } = props.snapshot;
  const serverClockOffset = useMemo(
    () => calculateServerClockOffset(props.snapshot.serverTime, Date.now()),
    [props.snapshot.serverTime, game.turn.turnId],
  );
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    setLocalNow(Date.now());
    const intervalId = window.setInterval(() => setLocalNow(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [serverClockOffset, game.turn.deadlineAt, game.turn.turnId]);
  const countdown = calculateTurnCountdown(
    game.turn.deadlineAt,
    serverClockOffset,
    localNow,
  );
  const activePlayer = room.players.find(
    (player) => player.playerId === game.turn.activePlayerId,
  );

  return (
    <main className="app-shell playing-shell number-playing-shell">
      <header className="lobby-header">
        <div>
          <p className="eyebrow">숫자 타일 게임 · ROOM {room.roomCode}</p>
          <h1>숫자 타일 게임</h1>
        </div>
        <div className="room-header-actions">
          <span className={`connection-chip ${props.connectionTone}`}>
            <span className="status-dot" aria-hidden="true" />
            {props.connectionLabel}
          </span>
          {!props.sessionReplaced ? (
            <button
              className="secondary-button compact-button"
              type="button"
              disabled={props.roomLeavePending}
              aria-busy={props.roomLeavePending}
              onClick={props.onLeaveRoom}
            >
              {props.roomLeavePending ? "나가는 중..." : "게임 나가기"}
            </button>
          ) : null}
        </div>
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

      <section className="game-summary" aria-label="현재 숫자 타일 게임 상태">
        <article className="summary-card turn-summary">
          <p className="step-label">CURRENT TURN</p>
          <h2>현재 차례</h2>
          <strong className="summary-value">
            {activePlayer?.nickname ?? "참가자 확인 중"}
          </strong>
          <span
            className={`turn-countdown${countdown.expired ? " expired" : ""}`}
            role="timer"
            aria-live="off"
          >
            {countdown.expired
              ? "시간 종료 처리 중..."
              : `남은 시간 ${countdown.remainingSeconds}초`}
          </span>
        </article>
        <article className="summary-card">
          <p className="step-label">POOL</p>
          <h2>남은 풀</h2>
          <strong className="summary-value">{game.remainingPoolCount}개</strong>
        </article>
        <article className="summary-card">
          <p className="step-label">TABLE</p>
          <h2>공개 조합</h2>
          <strong className="summary-value">{game.table.melds.length}개</strong>
        </article>
        <article className="summary-card rack-summary">
          <p className="step-label">MY RACK</p>
          <h2>내 타일</h2>
          <strong className="summary-value">{game.privateState.rack.length}개</strong>
        </article>
      </section>

      <section className="playing-participants" aria-label="참가자 상태">
        {room.players.map((player) => {
          const playerState = game.playerStates.find(
            (state) => state.playerId === player.playerId,
          );
          return (
            <div
              className={`playing-player${
                player.playerId === game.turn.activePlayerId &&
                playerState?.forfeited !== true
                  ? " active"
                  : ""
              }`}
              key={player.playerId}
            >
              <strong>{player.nickname}</strong>
              <span>
                {player.playerId === self.playerId ? "나 · " : ""}
                {player.isHost ? "방장 · " : ""}
                {player.connectionStatus === "CONNECTED" ? "접속 중" : "오프라인"}
                {playerState?.forfeited ? " · 기권" : ""}
              </span>
              <small>
                랙 {playerState?.rackCount ?? 0}개 · 첫 등록 {playerState?.initialMeldCompleted ? "완료" : "대기"}
              </small>
            </div>
          );
        })}
      </section>

      <NumberTileTurnDraftEditor
        snapshot={props.snapshot}
        controller={props.turnDraft}
        submitPending={props.submitPending}
        actionPending={props.actionPending}
        commandRetryKind={props.commandRetryKind}
        canSubmit={props.canSubmit}
        canAct={props.canAct}
        onSubmit={props.onSubmit}
        onDraw={props.onDraw}
        onPass={props.onPass}
      />

      <p className="live-region" aria-live="polite">
        {countdown.expired
          ? "턴 제한 시간이 끝나 서버 처리를 기다리고 있습니다."
          : props.turnDraft.noticeMessage ??
            props.turnDraft.editErrorMessage ??
            props.connectionLabel}
      </p>
    </main>
  );
}
