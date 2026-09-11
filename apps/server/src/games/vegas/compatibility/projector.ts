import type { PlayerId } from "@hangul-rummikub/shared";
import { publicVegas } from "../domain/game.js";
import type { VegasStoredGame } from "./adapter.js";
export function projectVegas(game: VegasStoredGame, viewer: PlayerId) {
    if (!game.state.players.some(p => p.playerId === viewer))
        throw new Error("Vegas viewer missing.");
    return publicVegas(game.state, viewer);
}
