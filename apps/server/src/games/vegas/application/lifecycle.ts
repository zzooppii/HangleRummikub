import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelVegas } from "../domain/game.js";
import { transitionVegas } from "./service.js";
export function createVegasLifecycle() {
    return {
        applyPlayingLeave(input: {
            room: RoomRecord;
            actorPlayerId: PlayerId;
            occurredAt: ServerTime;
        }): PlayingLeaveActionResult {
            const { room } = input;
            if (room.gameType !== 'VEGAS' || room.phase !== 'PLAYING' || !room.game)
                throw new Error('Vegas playing room required.');
            const state = cancelVegas(room.game.state, input.occurredAt);
            return { candidate: transitionVegas(room, state, input.occurredAt), advisory: 'NONE', finishedGameId: room.game.gameId, nextTurnIdentity: null };
        },
    };
}
