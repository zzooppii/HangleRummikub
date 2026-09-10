import { createHash } from "node:crypto";
import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import type { IdGenerator, RandomSource } from "../../../ports/system.js";
import type { BuildingCardId } from "../domain/identity.js";
import { parseCityActionId } from "../domain/identity.js";
import type { CityEntropy } from "../domain/rule-engine.js";
import { CITY_ROLE_IDS, type CityRoleId } from "../domain/role.js";

/** CITY-only private random checkpoint. Mutate this detached attempt, never live state. */
export class CityRoleEntropySource implements RandomSource {
  readonly seed: string;
  #counter: number;
  constructor(seed: string, counter: number) {
    if (typeof seed !== "string" || !/^[0-9a-f]{64}$/u.test(seed) || !Number.isSafeInteger(counter) || counter < 0) throw new Error("Invalid CITY entropy checkpoint.");
    this.seed = seed;
    this.#counter = counter;
  }
  get counter(): number { return this.#counter; }
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) throw new Error("Invalid CITY random range.");
    const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
    for (;;) {
      if (this.#counter >= Number.MAX_SAFE_INTEGER) throw new Error("CITY entropy counter exhausted.");
      const bytes = createHash("sha256").update("city-role-entropy-v1:").update(this.seed).update(":").update(String(this.#counter++)).digest();
      const value = bytes.readUInt32BE(0);
      if (value < limit) return value % maxExclusive;
    }
  }
}

export function createCityEntropySeed(source: RandomSource): string {
  return Array.from({ length: 8 }, () => {
    const value = source.nextInt(0x1_0000_0000);
    if (!Number.isSafeInteger(value) || value < 0 || value >= 0x1_0000_0000) throw new Error("Invalid CITY seed source.");
    return value.toString(16).padStart(8, "0");
  }).join("");
}

/** Lazy, cached application inputs: unused entropy does not consume the checkpoint. */
export function cityDomainEntropy(ids: Pick<IdGenerator, "generateTurnId">, random: CityRoleEntropySource, discard: readonly BuildingCardId[], roleIds: readonly CityRoleId[] = CITY_ROLE_IDS): CityEntropy {
  let actionId: CityEntropy["nextActionId"];
  let roles: CityEntropy["nextRoleOrder"];
  let cards: CityEntropy["discardOrder"];
  return Object.freeze({
    shuffleCards: (items: readonly BuildingCardId[]) => shuffleFrozen(items, random),
    randomIndex: (length: number) => random.nextInt(length),
    get nextActionId() { return actionId ??= parseCityActionId(ids.generateTurnId()); },
    get nextRoleOrder() { return roles ??= shuffleFrozen(roleIds, random); },
    get discardOrder() { return cards ??= shuffleFrozen(discard, random); },
  });
}
