import type { PlayerId } from "@hangul-rummikub/shared";
import { publicBurgundy } from "../domain/game.js";
import type { BurgundyStoredGame } from "./adapter.js";
export function projectBurgundy(game: BurgundyStoredGame, viewer: PlayerId) {
  if (!game.state.players.some((p) => p.playerId === viewer))
    throw new Error("Burgundy viewer missing.");
  return publicBurgundy(game.state, viewer);
}
