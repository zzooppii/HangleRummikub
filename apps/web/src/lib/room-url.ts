import {
  type RoomCode,
  validateRoomCode,
} from "@hangul-rummikub/shared";

export type AppRoute =
  | { kind: "HOME" }
  | { kind: "ROOM"; roomCode: RoomCode }
  | { kind: "INVALID_ROOM_INVITATION" }
  | { kind: "NOT_FOUND" };

export function parseAppPathname(pathname: string): AppRoute {
  if (pathname === "/") {
    return { kind: "HOME" };
  }

  const pathSegments = pathname.split("/");

  if (
    pathSegments.length === 3 &&
    pathSegments[0] === "" &&
    pathSegments[1] === "room"
  ) {
    const roomCodeResult = validateRoomCode(pathSegments[2]);

    if (!roomCodeResult.ok) {
      return { kind: "INVALID_ROOM_INVITATION" };
    }

    return { kind: "ROOM", roomCode: roomCodeResult.value };
  }

  return { kind: "NOT_FOUND" };
}

export function createRoomPath(roomCode: RoomCode): string {
  return `/room/${roomCode}`;
}

export function createInvitationUrl(
  origin: string,
  roomCode: RoomCode,
): string {
  const originUrl = new URL(origin);

  return new URL(createRoomPath(roomCode), originUrl.origin).href;
}
