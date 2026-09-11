import type { PlayerId } from "@hangul-rummikub/shared";
import { publicAzul } from "../domain/game.js";
import type { AzulStoredGame } from "./adapter.js";
export function projectAzul(game: AzulStoredGame, viewer: PlayerId) {
  if (!game.state.players.some(p => p.playerId === viewer)) throw new Error("Azul viewer missing.");
  return publicAzul(game.state);
}
