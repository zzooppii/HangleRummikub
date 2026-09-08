import type { RoomId } from "@hangul-rummikub/shared";
import type { RoomRepository } from "../../../ports/room-repository.js";
import { cityFailure, type CitySelectRoleInput, type CityActionInput, type CityCardInput, type CityAbilityInput, type CityMutationResult } from "./city-role-command-service.js";

export interface CityRoleCommandRouting {
  selectRole(input: CitySelectRoleInput): Promise<CityMutationResult>;
  takeIncome(input: CityActionInput): Promise<CityMutationResult>;
  drawBuildingCards(input: CityActionInput): Promise<CityMutationResult>;
  chooseBuildingCard(input: CityCardInput): Promise<CityMutationResult>;
  useRoleAbility(input: CityAbilityInput): Promise<CityMutationResult>;
  build(input: CityCardInput): Promise<CityMutationResult>;
  endTurn(input: CityActionInput): Promise<CityMutationResult>;
}
export type CityRoleCommandCapability = CityRoleCommandRouting & Readonly<{ gameType: "CITY_ROLE" }>;
export class CityRoleCommandRouter implements CityRoleCommandRouting {
  readonly #rooms: Pick<RoomRepository, "findById">;
  readonly #capability: CityRoleCommandCapability;
  constructor(deps: { roomRepository: Pick<RoomRepository, "findById">; capability: CityRoleCommandCapability }) {
    const capability = deps.capability;
    if (capability.gameType !== "CITY_ROLE" || [capability.selectRole, capability.takeIncome, capability.drawBuildingCards,
      capability.chooseBuildingCard, capability.useRoleAbility, capability.build, capability.endTurn].some(method => typeof method !== "function")) throw new Error("Missing CITY command capability.");
    this.#rooms = deps.roomRepository;
    this.#capability = Object.freeze({ gameType: "CITY_ROLE",
      selectRole: capability.selectRole.bind(capability), takeIncome: capability.takeIncome.bind(capability),
      drawBuildingCards: capability.drawBuildingCards.bind(capability), chooseBuildingCard: capability.chooseBuildingCard.bind(capability),
      useRoleAbility: capability.useRoleAbility.bind(capability), build: capability.build.bind(capability), endTurn: capability.endTurn.bind(capability) });
    Object.freeze(this);
  }
  async #error(roomId: RoomId): Promise<CityMutationResult | null> {
    try { const room = await this.#rooms.findById(roomId); return room === null ? cityFailure("ROOM_NOT_FOUND") : room.gameType !== "CITY_ROLE" ? cityFailure("INTERNAL_ERROR") : null; }
    catch { return cityFailure("INTERNAL_ERROR"); }
  }
  async selectRole(input: CitySelectRoleInput) { return await this.#error(input.roomId) ?? this.#capability.selectRole(input); }
  async takeIncome(input: CityActionInput) { return await this.#error(input.roomId) ?? this.#capability.takeIncome(input); }
  async drawBuildingCards(input: CityActionInput) { return await this.#error(input.roomId) ?? this.#capability.drawBuildingCards(input); }
  async chooseBuildingCard(input: CityCardInput) { return await this.#error(input.roomId) ?? this.#capability.chooseBuildingCard(input); }
  async useRoleAbility(input: CityAbilityInput) { return await this.#error(input.roomId) ?? this.#capability.useRoleAbility(input); }
  async build(input: CityCardInput) { return await this.#error(input.roomId) ?? this.#capability.build(input); }
  async endTurn(input: CityActionInput) { return await this.#error(input.roomId) ?? this.#capability.endTurn(input); }
}
