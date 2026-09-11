import type { PlayerId } from "@hangul-rummikub/shared";
import { publicCarcassonne } from "../domain/game.js";
import type { CarcassonneStoredGame } from "./adapter.js";
export function projectCarcassonne(
  game: CarcassonneStoredGame,
  viewer: PlayerId,
) {
  if (!game.state.players.some((p) => p.playerId === viewer))
    throw new Error("Carcassonne viewer missing.");
  return publicCarcassonne(game.state);
}
