import type { NumberTilePlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateServerClockOffset,
  calculateTurnCountdown,
} from "../../lib/turn-countdown.js";
import { NumberTileTurnDraftEditor } from "./NumberTileTurnDraftEditor.js";
import {
  formatNumberTileCountdown,
  numberTileTurnSoundStorageKey,
  playNumberTileSound,
  readLastAnnouncedNumberTileTurn,
  readNumberTileSoundEnabled,
  shouldAnnounceNumberTileTurn,
  writeLastAnnouncedNumberTileTurn,
  writeNumberTileSoundEnabled,
  type NumberTileActionFeedback,
} from "./number-tile-sound.js";
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
  actionFeedback: NumberTileActionFeedback | null;
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
  const isMyTurn = game.turn.activePlayerId === self.playerId;
  const [soundEnabled, setSoundEnabled] = useState(() =>
    readNumberTileSoundEnabled(window.localStorage)
  );
  const turnSoundTrackerRef = useRef<{
    scope: string;
    lastAnnouncedTurnId: typeof game.turn.turnId | null;
  }>({ scope: "", lastAnnouncedTurnId: null });
  const turnSoundKey = numberTileTurnSoundStorageKey(room.roomId, self.playerId);

  useEffect(() => {
    const tracker = turnSoundTrackerRef.current;
    if (tracker.scope !== turnSoundKey) {
      tracker.scope = turnSoundKey;
      tracker.lastAnnouncedTurnId = readLastAnnouncedNumberTileTurn(
        window.sessionStorage,
        turnSoundKey,
      );
    }
    if (
      !shouldAnnounceNumberTileTurn(
        tracker.lastAnnouncedTurnId,
        game.turn.turnId,
        game.turn.activePlayerId,
        self.playerId,
      )
    ) {
      return;
    }

    tracker.lastAnnouncedTurnId = game.turn.turnId;
    writeLastAnnouncedNumberTileTurn(
      window.sessionStorage,
      turnSoundKey,
      game.turn.turnId,
    );
    if (soundEnabled) {
      playNumberTileSound("TURN_START");
    }
  }, [
    game.turn.activePlayerId,
    game.turn.turnId,
    self.playerId,
    soundEnabled,
    turnSoundKey,
  ]);

  function toggleSound(): void {
    setSoundEnabled((current) => {
      const next = !current;
      writeNumberTileSoundEnabled(window.localStorage, next);
      return next;
    });
  }

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

      <section
        className={`number-turn-banner${isMyTurn ? " is-self" : ""}${
          countdown.remainingSeconds <= 10 ? " warning" : ""
        }`}
        aria-label="현재 숫자 타일 게임 상태"
      >
        <div className="number-turn-copy">
          <p className="step-label">CURRENT TURN</p>
          <h2>
            {isMyTurn
              ? "내 차례입니다"
              : `${activePlayer?.nickname ?? "다른 참가자"}님의 차례입니다`}
          </h2>
          <p>
            {isMyTurn
              ? game.remainingPoolCount > 0
                ? "타일을 조합하거나 1개 가져오세요."
                : "조합을 제출하거나 패스하세요."
              : "테이블을 살펴보며 다음 차례를 준비하세요."}
          </p>
        </div>
        <div className="number-turn-controls">
          <time
            className={`number-countdown${countdown.expired ? " expired" : ""}`}
            role="timer"
            aria-label={countdown.expired
              ? "턴 제한 시간 종료 처리 중"
              : `남은 시간 ${countdown.remainingSeconds}초`}
            aria-live="off"
          >
            {countdown.expired
              ? "00:00"
              : formatNumberTileCountdown(countdown.remainingSeconds)}
          </time>
          <button
            className="text-button number-sound-toggle"
            type="button"
            aria-pressed={soundEnabled}
            onClick={toggleSound}
          >
            {soundEnabled ? "사운드 켜짐" : "사운드 꺼짐"}
          </button>
        </div>
        <p className="number-game-stats">
          남은 풀 <strong>{game.remainingPoolCount}</strong>
          <span aria-hidden="true"> · </span>
          내 타일 <strong>{game.privateState.rack.length}</strong>
          <span aria-hidden="true"> · </span>
          공개 조합 <strong>{game.table.melds.length}</strong>
        </p>
      </section>

      {props.actionFeedback !== null ? (
        <p className="number-action-feedback" role="status">
          {props.actionFeedback.message}
        </p>
      ) : null}

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
              <span className="number-player-identity">
                <strong>{player.nickname}</strong>
                <small>
                  {player.playerId === self.playerId ? "나 · " : ""}
                  {player.isHost ? "방장 · " : ""}
                  {player.connectionStatus === "CONNECTED" ? "접속 중" : "오프라인"}
                  {playerState?.forfeited ? " · 기권" : ""}
                </small>
              </span>
              <span className="number-player-stats">
                랙 {playerState?.rackCount ?? 0} · 첫 등록 {playerState?.initialMeldCompleted ? "완료" : "대기"}
              </span>
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
