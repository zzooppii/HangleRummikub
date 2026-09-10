export const CITY_RULES_VERSION = "city-rules-v1";
export const CITY_ROLESET_VERSION = "city-roles-v1";
export const CITY_SELECTION_SECONDS = 45;
export const CITY_ACTION_SECONDS = 90;

export const CITY_ROLE_IDS = Object.freeze([
  "CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06", "CR-07", "CR-08",
] as const);
export const CITY_ALL_ROLE_IDS = [...CITY_ROLE_IDS, "CR-09"] as const;
export type CityRoleId = (typeof CITY_ALL_ROLE_IDS)[number];

export type CityRole = Readonly<{
  roleId: CityRoleId;
  name: string;
  resolutionOrder: number;
}>;

export const CITY_ROLES: readonly CityRole[] = Object.freeze([
  Object.freeze({ roleId: "CR-01", name: "가림꾼", resolutionOrder: 1 }),
  Object.freeze({ roleId: "CR-02", name: "징수꾼", resolutionOrder: 2 }),
  Object.freeze({ roleId: "CR-03", name: "교환꾼", resolutionOrder: 3 }),
  Object.freeze({ roleId: "CR-04", name: "길잡이", resolutionOrder: 4 }),
  Object.freeze({ roleId: "CR-05", name: "수호꾼", resolutionOrder: 5 }),
  Object.freeze({ roleId: "CR-06", name: "장터지기", resolutionOrder: 6 }),
  Object.freeze({ roleId: "CR-07", name: "설계꾼", resolutionOrder: 7 }),
  Object.freeze({ roleId: "CR-08", name: "해체꾼", resolutionOrder: 8 }),
]);

export function isCityRoleId(value: unknown): value is CityRoleId {
  return typeof value === "string" && CITY_ROLE_IDS.some((roleId) => roleId === value);
}

export function cityRoleOrder(roleId: CityRoleId): number {
  if (roleId === "CR-09") return 9;
  const role = CITY_ROLES.find((candidate) => candidate.roleId === roleId);
  if (role === undefined) throw new Error("CITY role is not in the approved roster.");
  return role.resolutionOrder;
}
