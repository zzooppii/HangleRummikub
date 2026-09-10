import * as v from "valibot";
import { PlayerIdSchema } from "../../identifiers.js";

export const WOLF_ROLES = ["DOPPELGANGER", "WEREWOLF", "MINION", "MASON", "SEER", "ROBBER", "TROUBLEMAKER", "DRUNK", "INSOMNIAC", "VILLAGER", "HUNTER", "TANNER"] as const;
export const WolfRoleSchema = v.picklist(WOLF_ROLES);
export type WolfRole = v.InferOutput<typeof WolfRoleSchema>;
export const WOLF_ROLE_LIMITS: Readonly<Record<WolfRole, number>> = { DOPPELGANGER: 1, WEREWOLF: 2, MINION: 1, MASON: 2, SEER: 1, ROBBER: 1, TROUBLEMAKER: 1, DRUNK: 1, INSOMNIAC: 1, VILLAGER: 3, HUNTER: 1, TANNER: 1 };
export const WolfDeckSchema = v.pipe(v.array(WolfRoleSchema), v.minLength(6), v.maxLength(13),
  v.check(roles => WOLF_ROLES.every(role => roles.filter(r => r === role).length <= WOLF_ROLE_LIMITS[role])),
  v.check(roles => !roles.includes("MASON") || roles.filter(r => r === "MASON").length === 2),
  v.check(roles => !roles.includes("INSOMNIAC") || roles.includes("ROBBER") || roles.includes("TROUBLEMAKER")));
export const WolfSettingsSchema = v.strictObject({ roles: v.nullable(WolfDeckSchema), discussionSeconds: v.picklist([120, 180, 300]) });
export type WolfSettings = v.InferOutput<typeof WolfSettingsSchema>;
export function defaultWolfDeck(players: number): WolfRole[] {
  if (players <= 5) {
    const beginner: WolfRole[] = ["WEREWOLF", "WEREWOLF", "ROBBER", "TROUBLEMAKER", "DRUNK", "VILLAGER", "VILLAGER", "VILLAGER"];
    return beginner.slice(0, Math.max(6, players + 3));
  }
  const roles: WolfRole[] = ["WEREWOLF", "WEREWOLF", "SEER", "ROBBER", "TROUBLEMAKER", "VILLAGER", "DOPPELGANGER", "INSOMNIAC", "DRUNK", "MINION", "HUNTER", "TANNER", "VILLAGER"];
  return roles.slice(0, Math.max(6, Math.min(13, players + 3)));
}
export const WOLF_NIGHT_ORDER = ["DOPPELGANGER", "WEREWOLF", "MINION", "MASON", "SEER", "ROBBER", "TROUBLEMAKER", "DRUNK", "INSOMNIAC", "DOPPEL_INSOMNIAC"] as const;
export const WolfStageSchema = v.picklist(["REVEAL", ...WOLF_NIGHT_ORDER, "DISCUSSION", "VOTE", "FINISHED"]);
export type WolfStage = v.InferOutput<typeof WolfStageSchema>;
const Center = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2));
export const WolfActionSchema = v.variant("type", [
  v.strictObject({ type: v.literal("PASS") }),
  v.strictObject({ type: v.literal("PLAYERS"), playerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(2), v.check(ids => new Set(ids).size === ids.length)) }),
  v.strictObject({ type: v.literal("CENTER"), indices: v.pipe(v.array(Center), v.minLength(1), v.maxLength(2), v.check(ids => new Set(ids).size === ids.length)) }),
]);
export type WolfAction = v.InferOutput<typeof WolfActionSchema>;
export const WolfTextSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));
