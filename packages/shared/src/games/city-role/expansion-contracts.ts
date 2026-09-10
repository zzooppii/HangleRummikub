import * as v from 'valibot';
import { CITY_EXPANDED_ROLES, CITY_SPECIAL_BUILDINGS, CITY_SELECTION_TIME_OPTIONS } from './expansion-catalog.js';

const Id = v.pipe(v.string(), v.nonEmpty(), v.maxLength(128));
const N = v.pipe(v.number(), v.integer(), v.safeInteger(), v.minValue(0));
const Ids = v.pipe(v.array(Id), v.maxLength(68), v.check(ids => new Set(ids).size === ids.length));
export const CityExpansionSettingsSchema = v.pipe(v.strictObject({
  selectionSeconds: v.optional(v.picklist(CITY_SELECTION_TIME_OPTIONS)),
  enabled: v.boolean(), roles: v.pipe(v.array(v.picklist(CITY_EXPANDED_ROLES.map(r => r.id))), v.minLength(8), v.maxLength(9)),
}), v.check(s => s.roles.every((id, i) => CITY_EXPANDED_ROLES.find(r => r.id === id)?.rank === i + 1)));
export const CityExpansionActionSchema = v.strictObject({
  command: v.picklist(['INCOME', 'ROLE', 'SPECIAL', 'BUILD', 'DECIDE']),
  effect: v.optional(v.picklist(CITY_SPECIAL_BUILDINGS.map(b => b.effect))),
  targetPlayerId: v.optional(Id), cardId: v.optional(Id), ownCardId: v.optional(Id),
  cardIds: v.optional(Ids), roleIds: v.optional(v.pipe(Ids, v.maxLength(3))),
  category: v.optional(v.picklist(['CIVIC','CULTURE','TRADE','GUARD','LANDMARK'])),
  choice: v.optional(v.picklist(['YES','NO','GOLD','CARDS','KEEP','BUILD'])),
  goldCount: v.optional(v.pipe(N, v.maxValue(68))),
});
export type CityExpansionAction = v.InferOutput<typeof CityExpansionActionSchema>;
