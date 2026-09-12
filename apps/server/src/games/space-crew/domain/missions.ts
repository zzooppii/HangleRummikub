import * as v from "valibot";
import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import type { RandomSource } from "../../../ports/system.js";
import { SPACE_CREW_COLORS } from "./cards.js";
import { SpaceCrewTaskFaceSchema, SpaceCrewTaskTokenSchema, type SpaceCrewTaskFace } from "./tasks.js";

const MissionNumberSchema = v.picklist([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
const SetupSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("NONE") }),
  v.strictObject({
    kind: v.literal("SELECT_NO_TRICKS_PLAYER"),
    answers: v.tuple([v.literal("GOOD"), v.literal("BAD")]),
    allowCommander: v.literal(true),
  }),
]);
const DefinitionSchema = v.strictObject({
  missionNumber: MissionNumberSchema,
  taskCount: v.picklist([0, 1, 2, 3, 4]),
  tokens: v.pipe(v.array(SpaceCrewTaskTokenSchema), v.maxLength(3)),
  taskMode: v.literal("CHOOSE"),
  communicationRule: v.variant("kind", [
    v.strictObject({ kind: v.literal("NORMAL") }),
    v.strictObject({ kind: v.literal("DEAD_ZONE") }),
  ]),
  setup: SetupSchema,
  endPolicy: v.picklist(["OBJECTIVES", "EXHAUSTION"]),
  objective: v.variant("kind", [
    v.strictObject({ kind: v.literal("TASKS") }),
    v.strictObject({ kind: v.literal("COLOR_VALUE_WINS"), value: v.literal(1), count: v.literal(1) }),
    v.strictObject({ kind: v.literal("NOMINEE_NO_TRICKS") }),
  ]),
});
type ParsedDefinition = v.InferOutput<typeof DefinitionSchema>;
export type SpaceCrewMissionNumber = v.InferOutput<typeof MissionNumberSchema>;
export type SpaceCrewMissionDefinition = Readonly<Omit<ParsedDefinition, "tokens" | "setup"> & {
  tokens: readonly Readonly<ParsedDefinition["tokens"][number]>[];
  setup: Readonly<{ kind: "NONE" }> | Readonly<{
    kind: "SELECT_NO_TRICKS_PLAYER"; answers: readonly ["GOOD", "BAD"]; allowCommander: true;
  }>;
}>;

const normal = { kind: "NORMAL" } as const;
const noSetup = { kind: "NONE" } as const;
const tasks = { kind: "TASKS" } as const;

// Audited Korean printed logbook pp. 4–7; see SPACE_CREW_MISSION_AUDIT.md.
// Only the first gated group is executable. No fallback defines missions 11–50.
const DEFINITIONS: readonly ParsedDefinition[] = [
  { missionNumber: 1, taskCount: 1, tokens: [], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 2, taskCount: 2, tokens: [], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 3, taskCount: 2, tokens: [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 4, taskCount: 3, tokens: [], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 5, taskCount: 0, tokens: [], taskMode: "CHOOSE", communicationRule: normal,
    setup: { kind: "SELECT_NO_TRICKS_PLAYER", answers: ["GOOD", "BAD"], allowCommander: true }, endPolicy: "EXHAUSTION", objective: { kind: "NOMINEE_NO_TRICKS" } },
  { missionNumber: 6, taskCount: 3, tokens: [{ kind: "RELATIVE", position: 1 }, { kind: "RELATIVE", position: 2 }], taskMode: "CHOOSE", communicationRule: { kind: "DEAD_ZONE" }, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 7, taskCount: 3, tokens: [{ kind: "LAST" }], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 8, taskCount: 3, tokens: [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }, { kind: "ABSOLUTE", position: 3 }], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
  { missionNumber: 9, taskCount: 0, tokens: [], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: { kind: "COLOR_VALUE_WINS", value: 1, count: 1 } },
  { missionNumber: 10, taskCount: 4, tokens: [], taskMode: "CHOOSE", communicationRule: normal, setup: noSetup, endPolicy: "OBJECTIVES", objective: tasks },
];

/** Canonical server configuration is selected by number, never supplied by a client. */
export function getSpaceCrewMission(missionNumber: unknown): SpaceCrewMissionDefinition {
  const number = v.parse(MissionNumberSchema, missionNumber);
  const definition = v.parse(DefinitionSchema, DEFINITIONS.find(item => item.missionNumber === number));
  const setup = definition.setup.kind === "NONE" ? Object.freeze(definition.setup)
    : Object.freeze({ ...definition.setup, answers: Object.freeze(definition.setup.answers) });
  return Object.freeze({ ...definition, setup,
    tokens: Object.freeze(definition.tokens.map(token => Object.freeze(token))),
    communicationRule: Object.freeze(definition.communicationRule), objective: Object.freeze(definition.objective),
  });
}

const TaskDeckSchema = v.pipe(v.array(SpaceCrewTaskFaceSchema), v.length(36));

/** Task IDs are independently generated public identifiers, not playing-card IDs. */
export function parseSpaceCrewTaskDeck(input: unknown): readonly SpaceCrewTaskFace[] {
  const deck = v.parse(TaskDeckSchema, input);
  if (new Set(deck.map(task => task.id)).size !== 36 || new Set(deck.map(task => `${task.suit}:${task.value}`)).size !== 36) {
    throw new Error("Invalid Space Crew task deck.");
  }
  return Object.freeze(deck.map(task => Object.freeze(task)));
}

export function createSpaceCrewTaskDeck(generateId: () => string): readonly SpaceCrewTaskFace[] {
  const deck: SpaceCrewTaskFace[] = [];
  for (const suit of SPACE_CREW_COLORS) {
    for (const value of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) deck.push({ id: generateId(), suit, value });
  }
  return parseSpaceCrewTaskDeck(deck);
}

export function shuffleSpaceCrewTaskDeck(deck: readonly SpaceCrewTaskFace[], randomSource: RandomSource): readonly SpaceCrewTaskFace[] {
  return shuffleFrozen(parseSpaceCrewTaskDeck(deck), randomSource);
}
