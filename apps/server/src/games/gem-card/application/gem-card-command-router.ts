import type { RoomId } from "@hangul-rummikub/shared";
import type { RoomRepository } from "../../../ports/room-repository.js";
import { gemFailure, type GemCollectInput, type GemPurchaseInput, type GemReserveInput, type GemYieldInput, type GemMutationResult } from "./gem-card-command-service.js";
export interface GemCardCommandRouting {
  collect(input: GemCollectInput): Promise<GemMutationResult>;
  purchase(input: GemPurchaseInput): Promise<GemMutationResult>;
  reserve(input: GemReserveInput): Promise<GemMutationResult>;
  yield(input: GemYieldInput): Promise<GemMutationResult>;
}
export type GemCardCommandCapability = GemCardCommandRouting & Readonly<{
  gameType: "GEM_CARD";
}>;
export class GemCardCommandRouter implements GemCardCommandRouting {
  readonly #rooms: Pick<RoomRepository, "findById">;
  readonly #capability: GemCardCommandCapability;
  constructor(deps: {
    roomRepository: Pick<RoomRepository, "findById">;
    capability: GemCardCommandCapability;
  }) {
    const c = deps.capability;
    if (c.gameType !== "GEM_CARD" || typeof c.collect !== "function" || typeof c.purchase !== "function" || typeof c.reserve !== "function" || typeof c.yield !== "function")
      throw new Error("Missing GEM command capability.");
    this.#rooms = deps.roomRepository;
    this.#capability = Object.freeze({ gameType: "GEM_CARD", collect: c.collect.bind(c), purchase: c.purchase.bind(c), reserve: c.reserve.bind(c), yield: c.yield.bind(c) });
    Object.freeze(this);
  }
  async #error(roomId: RoomId): Promise<GemMutationResult | null> {
    try {
      const room = await this.#rooms.findById(roomId);
      return room === null ? gemFailure("ROOM_NOT_FOUND") : room.gameType !== "GEM_CARD" ? gemFailure("INTERNAL_ERROR") : null;
    }
    catch {
      return gemFailure("INTERNAL_ERROR");
    }
  }
  async collect(input: GemCollectInput) { return await this.#error(input.roomId) ?? this.#capability.collect(input); }
  async purchase(input: GemPurchaseInput) { return await this.#error(input.roomId) ?? this.#capability.purchase(input); }
  async reserve(input: GemReserveInput) { return await this.#error(input.roomId) ?? this.#capability.reserve(input); }
  async yield(input: GemYieldInput) { return await this.#error(input.roomId) ?? this.#capability.yield(input); }
}
