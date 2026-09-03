import type { RoomCode } from "@hangul-rummikub/shared";
import type { FormEvent } from "react";

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
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onGoHome: () => void;
}>;

export function HomeScreen(props: HomeScreenProps) {
  const isBusy = props.busyLabel !== null;
  const joinRoomCode = props.invitationRoomCode ?? props.roomCodeInput;

  function submitCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onCreateRoom();
  }

  function submitJoin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onJoinRoom();
  }

  return (
    <main className="app-shell home-shell">
      <header className="hero-panel">
        <div>
          <p className="eyebrow">실시간 한글 보드게임</p>
          <h1>한글 루미큐브</h1>
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
              maxLength={24}
              value={props.nickname}
              disabled={isBusy}
              onChange={(event) => props.onNicknameChange(event.target.value)}
              placeholder="예: 혁상"
            />
            <p className="field-help">
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
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isBusy}
                  >
                    {props.busyLabel ?? "방 만들기"}
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
