import type { ReactNode } from "react";
import { PROTOCOL_VERSION } from "@hangul-rummikub/shared";

export function ReconnectBoundary(props: Readonly<{
  visible: boolean;
  pending: boolean;
  onReconnect: () => void;
  children: ReactNode;
  roomControls?: ReactNode;
}>) {
  return (
    <div data-protocol-version={PROTOCOL_VERSION} className={props.visible ? "room-recovery-active" : undefined}>
      {props.roomControls}
      {props.children}
      {props.visible ? (
        <aside className="room-recovery-notice" aria-label="게임 재접속">
          <p role="status">연결이 끊어졌습니다. 재접속 중...</p>
          <small>기존 플레이어 자리로 돌아갑니다. 방에 다시 참가할 필요가 없습니다.</small>
          <button type="button" className="primary-button" disabled={props.pending} onClick={props.onReconnect}>
            {props.pending ? "연결 복원 중..." : "다시 접속하기"}
          </button>
        </aside>
      ) : null}
    </div>
  );
}
