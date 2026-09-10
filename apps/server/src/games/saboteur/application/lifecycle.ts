import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelSaboteur } from "../domain/game.js";
import { transitionSaboteur } from "./service.js";
export function createSaboteurLifecycle() {
    return {
        applyPlayingLeave(input: {
            room: RoomRecord;
            actorPlayerId: PlayerId;
            occurredAt: ServerTime;
        }): PlayingLeaveActionResult {
            const { room } = input;
            if (room.gameType !== 'SABOTEUR' || room.phase !== 'PLAYING' || !room.game)
                throw new Error('Saboteur playing room required.');
            const state = cancelSaboteur(room.game.state, input.occurredAt);
            return { candidate: transitionSaboteur(room, state, input.occurredAt), advisory: 'NONE', finishedGameId: room.game.gameId, nextTurnIdentity: null };
        },
    };
}
