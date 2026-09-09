import { RelayDoodle } from "../draw-relay/RelayHelp.js";
import {
  NICKNAME_MAX_CODE_POINTS,
  type GameType,
  type RoomCode,
} from "@hangul-rummikub/shared";
import { useState, type FormEvent } from "react";

import { limitNicknameInput } from "../../lib/nickname-input.js";
import { MISSING_RESUME_CREDENTIAL, type SavedGameEntry } from "../../lib/saved-game.js";
import {
  DEFAULT_SELECTED_GAME_TYPE,
  GAME_CATALOG,
} from "../game-catalog/game-catalog.js";

export type HomeScreenProps = Readonly<{
  nickname: string;
  roomCodeInput: string;
  invitationRoomCode: RoomCode | null;
  routeErrorMessage: string | null;
  busyLabel: string | null;
  connectionLabel: string;
  connectionTone: "connected" | "pending" | "offline" | "replaced";
  errorMessage: string | null;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: (gameType: GameType) => void;
  onJoinRoom: () => void;
  onGoHome: () => void;
  savedGame?: SavedGameEntry | null;
  resumePending?: boolean;
  onReconnect?: () => void;
}>;

export function HomeScreen(props: HomeScreenProps) {
  const [selectedGameType, setSelectedGameType] = useState<GameType>(
    DEFAULT_SELECTED_GAME_TYPE,
  );
  const isBusy = props.busyLabel !== null;
  const joinRoomCode = props.invitationRoomCode ?? props.roomCodeInput;

  function submitCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onCreateRoom(selectedGameType);
  }

  function submitJoin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onJoinRoom();
  }

  return (
    <main className="app-shell home-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">실시간 멀티플레이 보드게임</p>
          <h1>함께 즐기는 보드게임</h1>
          <p className="hero-copy">
            닉네임만 정하고 방을 만들거나, 친구가 보낸 초대 코드로
            바로 참가하세요.
          </p>
        </div>
        <span className={`connection-chip ${props.connectionTone}`}>
          <span className="status-dot" aria-hidden="true" />
          {props.connectionLabel}
        </span>
      </header>

      {props.savedGame ? (
        <section className="entry-card saved-game-entry" aria-labelledby="saved-game-heading">
          <h2 id="saved-game-heading">진행 중인 게임</h2>
          <p>{GAME_CATALOG.find(game => game.gameType === props.savedGame?.gameType)?.displayName ?? "저장된 게임"}</p>
          <strong>ROOM {props.savedGame.roomCode}</strong>
          <p className="field-help">이 브라우저에 저장된 정보로 기존 자리에 접속합니다. 종료된 방은 복구할 수 없습니다.</p>
          <button className="primary-button" type="button" disabled={props.resumePending} onClick={props.onReconnect}>
            {props.resumePending ? "연결 복원 중..." : "다시 접속하기"}
          </button>
        </section>
      ) : props.invitationRoomCode !== null ? (
        <p className="notice" role="status">{MISSING_RESUME_CREDENTIAL} 닉네임만으로 기존 자리에 접속할 수 없습니다. 새 참가는 대기실에서만 가능합니다.</p>
      ) : null}

      <section className="entry-card" aria-labelledby="entry-heading">
        <div className="section-heading">
          <p className="step-label">LOBBY</p>
          <h2 id="entry-heading">
            {props.invitationRoomCode === null
              ? "플레이 방법을 선택하세요"
              : "초대받은 방에 참가하세요"}
          </h2>
        </div>

        {props.routeErrorMessage !== null ? (
          <div className="notice error-notice" role="alert">
            <strong>주소를 확인해주세요.</strong>
            <span>{props.routeErrorMessage}</span>
            <button
              className="text-button"
              type="button"
              onClick={props.onGoHome}
            >
              홈으로 돌아가기
            </button>
          </div>
        ) : (
          <>
            <label className="field-label" htmlFor="nickname">
              닉네임
            </label>
            <input
              id="nickname"
              className="text-input"
              name="nickname"
              type="text"
              autoComplete="off"
              maxLength={NICKNAME_MAX_CODE_POINTS * 2}
              aria-describedby="nickname-help"
              value={props.nickname}
              disabled={isBusy}
              onChange={(event) =>
                props.onNicknameChange(limitNicknameInput(event.target.value))
              }
              placeholder="예: 혁상"
            />
            <p className="field-help" id="nickname-help">
              한글·영문·숫자·밑줄을 사용해 1~12자로 입력하세요.
            </p>

            {props.errorMessage !== null ? (
              <p className="notice error-notice" role="alert">
                {props.errorMessage}
              </p>
            ) : null}

            {props.invitationRoomCode === null ? (
              <div className="entry-grid">
                <form
                  className="action-panel create-panel"
                  aria-busy={isBusy}
                  onSubmit={submitCreate}
                >
                  <div>
                    <span className="action-number">01</span>
                    <h3>새 방 만들기</h3>
                    <p>내가 방장이 되어 초대 코드를 발급합니다.</p>
                  </div>
                  <div
                    className="game-selection"
                    role="group"
                    aria-labelledby="game-selection-label"
                  >
                    <p
                      className="game-selection-label"
                      id="game-selection-label"
                    >
                      플레이할 게임 선택
                    </p>
                    <div className="game-option-list">
                      {GAME_CATALOG.map((game) => {
                        const isSelected = game.gameType === selectedGameType;

                        return (
                          <button
                            key={game.gameType}
                            className={`game-option${
                              isSelected ? " selected" : ""
                            }`}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={isBusy}
                            onClick={() => setSelectedGameType(game.gameType)}
                          >
                            {game.gameType === "DRAW_RELAY" ? <RelayDoodle/> : null}
                            <span className="game-option-heading">
                              <strong>{game.displayName}</strong>
                              {isSelected ? (
                                <span
                                  className="game-option-status"
                                  aria-hidden="true"
                                >
                                  선택됨
                                </span>
                              ) : null}
                            </span>
                            <span className="game-option-description">
                              {game.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isBusy}
                  >
                    {props.busyLabel ?? "선택한 게임으로 방 만들기"}
                  </button>
                </form>

                <form
                  className="action-panel"
                  aria-busy={isBusy}
                  onSubmit={submitJoin}
                >
                  <div>
                    <span className="action-number">02</span>
                    <h3>코드로 참가</h3>
                    <p>친구에게 받은 6자리 코드를 입력하세요.</p>
                  </div>
                  <label className="field-label" htmlFor="room-code">
                    방 코드
                  </label>
                  <input
                    id="room-code"
                    className="text-input room-code-input"
                    name="roomCode"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={16}
                    value={props.roomCodeInput}
                    disabled={isBusy}
                    onChange={(event) =>
                      props.onRoomCodeChange(event.target.value)
                    }
                    placeholder="ABC234"
                  />
                  <button
                    className="secondary-button"
                    type="submit"
                    disabled={isBusy}
                  >
                    {props.busyLabel ?? "방 참가하기"}
                  </button>
                </form>
              </div>
            ) : (
              <form
                className="invitation-panel"
                aria-busy={isBusy}
                onSubmit={submitJoin}
              >
                <div>
                  <span className="action-number">초대 코드</span>
                  <strong className="invited-room-code">{joinRoomCode}</strong>
                </div>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={isBusy}
                >
                  {props.busyLabel ?? "이 방에 참가하기"}
                </button>
              </form>
            )}
          </>
        )}
      </section>

      <p className="live-region" aria-live="polite">
        {props.busyLabel ?? props.connectionLabel}
      </p>
    </main>
  );
}
