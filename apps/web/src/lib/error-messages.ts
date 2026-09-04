import type { ProtocolErrorCode } from "@hangul-rummikub/shared";

const USER_ERROR_MESSAGES = {
  INVALID_PAYLOAD: "요청 형식이 올바르지 않습니다. 다시 시도해주세요.",
  INCOMPATIBLE_PROTOCOL:
    "앱 버전이 서버와 맞지 않습니다. 페이지를 새로고침해주세요.",
  UNAUTHENTICATED: "현재 연결로 요청할 수 없습니다. 다시 연결해주세요.",
  SESSION_NOT_FOUND:
    "이 방의 연결 정보가 더 이상 유효하지 않습니다. 새 방을 만들거나 다시 참가해주세요.",
  ROOM_NOT_FOUND: "방을 찾을 수 없습니다. 방 코드를 다시 확인해주세요.",
  ROOM_FULL: "방이 가득 찼습니다. 다른 방을 이용해주세요.",
  ROOM_NOT_JOINABLE: "현재 참가할 수 없는 방입니다.",
  HOST_ONLY: "방장만 실행할 수 있는 요청입니다.",
  NOT_ENOUGH_PLAYERS: "게임을 시작하려면 참가자가 2명 이상이어야 합니다.",
  PLAYERS_NOT_CONNECTED:
    "모든 참가자가 접속 중일 때 게임을 시작할 수 있습니다.",
  NOT_YOUR_TURN: "현재 내 차례가 아닙니다. 최신 게임 상태를 불러옵니다.",
  TURN_EXPIRED: "이 턴의 제한 시간이 지났습니다. 최신 상태를 불러옵니다.",
  GAME_EXPIRED: "게임 제한 시간이 끝났습니다. 종료 상태를 불러옵니다.",
  BAG_EMPTY: "선택한 타일 주머니가 비어 있습니다.",
  PASS_NOT_ALLOWED: "타일이 남아 있어 아직 턴을 넘길 수 없습니다.",
  INVALID_PHASE: "현재 방 상태에서는 실행할 수 없습니다.",
  STALE_ROOM_REVISION: "방 상태가 변경되었습니다. 최신 상태를 불러옵니다.",
  STALE_GAME_REVISION: "게임 상태가 변경되었습니다. 최신 상태를 불러옵니다.",
  REQUEST_ID_REUSED: "이전 요청과 충돌했습니다. 다시 시도해주세요.",
  NICKNAME_INVALID:
    "닉네임은 한글·영문·숫자·밑줄만 사용해 1~12자로 입력해주세요.",
  NICKNAME_TAKEN: "이미 사용 중인 닉네임입니다.",
  ROOM_CODE_INVALID: "방 코드는 허용된 6자리 문자로 입력해주세요.",
  ROOM_CODE_EXHAUSTED:
    "지금은 새 방 코드를 만들 수 없습니다. 잠시 후 다시 시도해주세요.",
  INVALID_TILE_ACCESS:
    "게임 상태와 타일 정보가 달라졌습니다. 최신 상태를 불러옵니다.",
  INVALID_BOARD: "완성되지 않았거나 허용되지 않는 보드 배치입니다.",
  INVALID_HANGUL_COMPOSITION: "한글 음절 구성을 다시 확인해주세요.",
  WORD_NOT_ALLOWED: "허용된 단어가 아닙니다.",
  RULE_VIOLATION: "현재 게임 규칙에 맞지 않는 배치입니다.",
  TEMPORARILY_UNAVAILABLE:
    "서비스를 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.",
  INTERNAL_ERROR: "문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
} satisfies Record<ProtocolErrorCode, string>;

export function getUserErrorMessage(code: ProtocolErrorCode): string {
  return USER_ERROR_MESSAGES[code];
}
