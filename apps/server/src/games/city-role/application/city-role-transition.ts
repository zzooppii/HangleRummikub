import { RoomRevisionSchema, ServerTimeSchema, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { nextGameRevision } from "../../../domain/game-revision.js";
import type { CityRoleRoomRecord, RoomWriteCandidate } from "../../../model/persistence.js";
import type { CityRoleStoredGame } from "../compatibility/city-role-game-state-adapter.js";
import type { CityGameState } from "../domain/game-state.js";
import { CITY_ACTION_SECONDS, CITY_SELECTION_SECONDS } from "../domain/role.js";

export function transitionCityRoom(room: CityRoleRoomRecord, state: CityGameState, at: ServerTime, entropyCounter: number): RoomWriteCandidate & { gameType: "CITY_ROLE"; game: CityRoleStoredGame } {
  const previous = room.game;
  if (!previous) throw new Error("CITY transition requires an existing game.");
  const finished = state.window === null;
  const sameWindow = !finished && previous.state.window?.actionId === state.window.actionId;
  const windowStartedAt = finished ? null : sameWindow ? previous.windowStartedAt : at;
  const deadlineAt = finished ? null : sameWindow ? previous.deadlineAt : parse(ServerTimeSchema, at + (state.window.kind === "ROLE_SELECTION" ? (state.expansion?.settings.selectionSeconds ?? CITY_SELECTION_SECONDS) : CITY_ACTION_SECONDS) * 1000);
  const game: CityRoleStoredGame = Object.freeze({ ...previous, state, entropyCounter,
    gameRevision: nextGameRevision(previous.gameRevision), windowStartedAt, deadlineAt,
    finishedAt: finished ? at : null });
  return Object.freeze({ ...room, game, updatedAt: at, phase: finished ? "FINISHED" : "PLAYING",
    roomRevision: finished ? parse(RoomRevisionSchema, room.roomRevision + 1) : room.roomRevision });
}
