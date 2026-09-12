import * as v from 'valibot';
import { PlayerIdSchema, RoomIdSchema, SpaceCrewStartCommandSchema, SpaceCrewClientCommandSchema, type ErrorDto } from '@hangul-rummikub/shared';
import type { SessionStorageLike } from './session-storage.js';
export const SPACE_CREW_OUTBOX_PREFIX = 'hangul-rummikub.space-crew-outbox.v1:';
export const SpaceCrewPendingCommandSchema = v.union([SpaceCrewStartCommandSchema, SpaceCrewClientCommandSchema]);
export type SpaceCrewPendingCommand = v.InferOutput<typeof SpaceCrewPendingCommandSchema>;
const RecordSchema = v.strictObject({ roomId: RoomIdSchema, playerId: PlayerIdSchema, command: SpaceCrewPendingCommandSchema });
export type SpaceCrewOutboxScope = Pick<v.InferOutput<typeof RecordSchema>, 'roomId' | 'playerId'>;
export class SpaceCrewCommandRejected extends Error {}
export function spaceCrewRejectionIsDefinitive(code: ErrorDto['code']): boolean {
  return code !== 'INTERNAL_ERROR' && code !== 'UNAUTHENTICATED';
}
/** A tab stores only its submitted envelope. No inferred action is ever queued. */
export class SpaceCrewOutbox {
  constructor(private readonly storage: SessionStorageLike) {}
  private key(scope: SpaceCrewOutboxScope): string { return `${SPACE_CREW_OUTBOX_PREFIX}${scope.roomId}:${scope.playerId}`; }
  read(scope: SpaceCrewOutboxScope): SpaceCrewPendingCommand | null {
    try {
      const raw = this.storage.getItem(this.key(scope));
      if (raw === null) return null;
      const record = v.parse(RecordSchema, JSON.parse(raw));
      if (record.roomId !== scope.roomId || record.playerId !== scope.playerId) throw new Error();
      return record.command;
    } catch { throw new Error('이 탭의 이전 요청을 확인할 수 없습니다. 저장 공간을 확인해주세요.'); }
  }
  save(scope: SpaceCrewOutboxScope, command: SpaceCrewPendingCommand): void {
    try {
      const record = v.parse(RecordSchema, { ...scope, command });
      const pending = this.read(scope);
      if (pending !== null && JSON.stringify(pending) !== JSON.stringify(record.command)) throw new Error();
      this.storage.setItem(this.key(scope), JSON.stringify(record));
      if (JSON.stringify(this.read(scope)) !== JSON.stringify(record.command)) throw new Error();
    } catch { throw new Error('요청을 안전하게 저장할 수 없습니다. 저장 공간을 확인해주세요.'); }
  }
  clear(scope: SpaceCrewOutboxScope, requestId: string): void {
    try {
      const pending = this.read(scope);
      if (pending?.requestId !== requestId) return;
      this.storage.removeItem(this.key(scope));
      if (this.storage.getItem(this.key(scope)) !== null) throw new Error();
    } catch { throw new Error('이전 요청 저장을 정리할 수 없습니다. 저장 공간을 확인해주세요.'); }
  }
}
