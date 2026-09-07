import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import {
  validateGemCollectCommand,
  validateGemPurchaseCommand,
  validateGemReserveCommand,
  validateGemYieldCommand,
  type GameRevision,
  type GemCollectSelectionDto,
  type GemPurchaseSourceDto,
  type RequestId,
  type TurnId,
} from "@hangul-rummikub/shared";
import {
  createGemCollectCommand,
  createGemPurchaseCommand,
  createGemReserveCommand,
  createGemYieldCommand,
  gemCardActionFeedback,
  gemCardCommandKind,
  gemSnapshotSupersedesCommand,
  shouldResetGemSelectionAfterFailure,
} from "../features/gem-card/gem-card-actions.js";
import { runAsyncSingleFlight } from "./async-single-flight.js";
import { gemPlayingFixture } from "./gem-card-test-fixtures.js";
import { createRealtimeClient, RealtimeClientError } from "./realtime-client.js";

const revision = 2 as GameRevision;
const turnId = "gem-action-turn" as TurnId;
const requestId = "gem-action-request" as RequestId;
const createId = () => requestId;

test("GEM Collect command preserves exact basic/PRISM intent and detaches a frozen retry payload", () => {
  const selections: GemCollectSelectionDto[] = [
    { kind: "BASIC", resources: ["DAWN"] },
    { kind: "BASIC", resources: ["TIDE", "EMBER"] },
    { kind: "PRISM" },
  ];
  for (const selection of selections) {
    const command = createGemCollectCommand(selection, revision, turnId, createId);
    assert.deepEqual(command, { kind: "gem:collect", protocolVersion: 1,
      requestId, expectedGameRevision: revision, turnId, payload: { selection } });
    assert.equal(validateGemCollectCommand(command).ok, true);
    assert.notEqual(command.payload.selection, selection);
    assert.equal(Object.isFrozen(command), true);
    assert.equal(Object.isFrozen(command.payload.selection), true);
    if (selection.kind === "BASIC") {
      const before = structuredClone(command);
      selection.resources.push("ECHO");
      assert.deepEqual(command, before);
      assert.equal(command.payload.selection.kind, "BASIC");
      if (command.payload.selection.kind === "BASIC")
        assert.equal(Object.isFrozen(command.payload.selection.resources), true);
    }
  }
});

test("GEM market/reserved purchase and reserve commands contain only stable source identity, never payment", () => {
  const sources: GemPurchaseSourceDto[] = [
    { kind: "MARKET", tier: 2, slotIndex: 1 },
    { kind: "RESERVED", cardId: "GC-T1-01" as Extract<GemPurchaseSourceDto, { kind: "RESERVED" }>["cardId"] },
  ];
  for (const source of sources) {
    const purchase = createGemPurchaseCommand(source, revision, turnId, createId);
    assert.equal(validateGemPurchaseCommand(purchase).ok, true);
    assert.deepEqual(purchase.payload, { source });
    assert.notEqual(purchase.payload.source, source);
    assert.deepEqual(Object.keys(purchase.payload), ["source"]);
    assert.equal(purchase.expectedGameRevision, revision);
    assert.equal(purchase.turnId, turnId);
    assert.equal(purchase.requestId, requestId);
    assert.equal(Object.isFrozen(purchase.payload.source), true);
  }
  const source = { tier: 3, slotIndex: 2 } as const;
  const reserve = createGemReserveCommand(source, revision, turnId, createId);
  assert.equal(validateGemReserveCommand(reserve).ok, true);
  assert.deepEqual(reserve.payload, { source });
  assert.notEqual(reserve.payload.source, source);
  assert.equal(Object.isFrozen(reserve.payload.source), true);
});

test("GEM Yield is the exact explicit empty gem:yield command, not a generic Pass", () => {
  const command = createGemYieldCommand(revision, turnId, createId);
  assert.deepEqual(command, { kind: "gem:yield", protocolVersion: 1,
    requestId, expectedGameRevision: revision, turnId, payload: {} });
  assert.equal(validateGemYieldCommand(command).ok, true);
  assert.equal(gemCardCommandKind(command), "YIELD");
});

test("GEM uses one proven flight across all four actions and releases it after a rejection", async () => {
  const flightRef = { current: null as Promise<void> | null };
  const calls: string[] = [];
  let release = () => {};
  const first = runAsyncSingleFlight(flightRef, async () => {
    calls.push("COLLECT");
    await new Promise<void>((resolve) => { release = resolve; });
  });
  for (const action of ["PURCHASE", "RESERVE", "YIELD"]) {
    assert.equal(runAsyncSingleFlight(flightRef, async () => { calls.push(action); }), first);
  }
  assert.deepEqual(calls, ["COLLECT"]);
  release();
  await first;
  assert.equal(flightRef.current, null);
  const failure = new Error("rejected");
  await assert.rejects(runAsyncSingleFlight(flightRef, async () => { throw failure; }), failure);
  assert.equal(flightRef.current, null);
  await runAsyncSingleFlight(flightRef, async () => { calls.push("PURCHASE"); });
  assert.deepEqual(calls, ["COLLECT", "PURCHASE"]);
});

test("GEM ack-loss retry keeps the same immutable request after the local selection changes", async () => {
  const selection: GemCollectSelectionDto = { kind: "BASIC", resources: ["DAWN", "TIDE"] };
  const pending = createGemCollectCommand(selection, revision, turnId, createId);
  const sent: typeof pending[] = [];
  const flightRef = { current: null as Promise<void> | null };
  await assert.rejects(runAsyncSingleFlight(flightRef, async () => {
    sent.push(pending);
    throw new RealtimeClientError("ACKNOWLEDGEMENT_TIMEOUT");
  }), { code: "ACKNOWLEDGEMENT_TIMEOUT" });
  selection.resources.splice(0, 2, "ECHO");
  await runAsyncSingleFlight(flightRef, async () => { sent.push(pending); });
  assert.equal(sent[0], sent[1]);
  assert.deepEqual(sent[1]?.payload.selection, { kind: "BASIC", resources: ["DAWN", "TIDE"] });
  assert.equal(sent[1]?.requestId, requestId);
});

test("GEM gameplay rejection preserves selection; stale card/revision/turn/phase resets and syncs", () => {
  for (const code of ["RESOURCE_LIMIT_EXCEEDED", "RESOURCE_SUPPLY_EMPTY", "INSUFFICIENT_RESOURCES", "RESERVE_LIMIT_REACHED", "YIELD_NOT_ALLOWED"] as const)
    assert.equal(shouldResetGemSelectionAfterFailure(code, revision, revision), false);
  for (const code of ["STALE_GAME_REVISION", "NOT_YOUR_TURN", "TURN_EXPIRED", "CARD_NOT_AVAILABLE", "INVALID_PHASE", "UNAUTHENTICATED"] as const)
    assert.equal(shouldResetGemSelectionAfterFailure(code, revision, revision), true);
  assert.equal(shouldResetGemSelectionAfterFailure("RESOURCE_SUPPLY_EMPTY", 3 as GameRevision, revision), true);
});

test("GEM presence-only/reconnect preserves pending identity; new revision/turn/finish supersedes it", () => {
  const snapshot = gemPlayingFixture();
  const command = createGemYieldCommand(snapshot.game.gameRevision, snapshot.game.turn.turnId, createId);
  assert.equal(gemSnapshotSupersedesCommand(command, snapshot), false);
  assert.equal(gemSnapshotSupersedesCommand(command, { ...snapshot,
    versions: { ...snapshot.versions, presenceVersion: 2 } } as typeof snapshot), false);
  assert.equal(gemSnapshotSupersedesCommand(command, { ...snapshot, game: {
    ...snapshot.game, gameRevision: 1 as GameRevision,
  } }), true);
  assert.equal(gemSnapshotSupersedesCommand(command, { ...snapshot, game: {
    ...snapshot.game, turn: { ...snapshot.game.turn, turnId: "gem-next" as TurnId },
  } }), true);
  assert.equal(gemSnapshotSupersedesCommand(command, null), true);
});

test("GEM canonical action feedback occurs once per request identity including accepted replay", () => {
  const announced = new Set<RequestId>();
  const commands = [
    createGemCollectCommand({ kind: "PRISM" }, revision, turnId, () => "collect" as RequestId),
    createGemPurchaseCommand({ kind: "MARKET", tier: 1, slotIndex: 0 }, revision, turnId, () => "purchase" as RequestId),
    createGemReserveCommand({ tier: 2, slotIndex: 1 }, revision, turnId, () => "reserve" as RequestId),
    createGemYieldCommand(revision, turnId, () => "yield" as RequestId),
  ];
  assert.deepEqual(commands.map(command => gemCardActionFeedback(command, announced)?.kind),
    ["COLLECT", "PURCHASE", "RESERVE", "YIELD"]);
  assert.deepEqual(commands.map(command => gemCardActionFeedback(command, announced)), [null, null, null, null]);
});

test("Realtime GEM methods reject extra/malformed payloads before connection and validate all four events", async () => {
  const client = createRealtimeClient({ url: "http://127.0.0.1:1", autoConnect: false });
  try {
    const collect = createGemCollectCommand({ kind: "PRISM" }, revision, turnId, createId);
    await assert.rejects(client.collectGemResources({ ...collect,
      payload: { selection: { kind: "BASIC", resources: ["DAWN", "DAWN"] } },
    }), { code: "INVALID_COMMAND" });
    const purchase = createGemPurchaseCommand({ kind: "MARKET", tier: 1, slotIndex: 0 }, revision, turnId, createId);
    const forged = { ...purchase, payload: { ...purchase.payload, payment: { PRISM: 0 } } };
    await assert.rejects(client.purchaseGemCard(forged), { code: "INVALID_COMMAND" });
    for (const promise of [
      client.collectGemResources(collect),
      client.purchaseGemCard(purchase),
      client.reserveGemCard(createGemReserveCommand({ tier: 2, slotIndex: 1 }, revision, turnId, createId)),
      client.yieldGemTurn(createGemYieldCommand(revision, turnId, createId)),
    ]) await assert.rejects(promise, { code: "NOT_CONNECTED" });
  } finally {
    client.destroy();
  }
});

const controllerSource = readFileSync(new URL("../../src/app/use-lobby-app.ts", import.meta.url), "utf8");
const realtimeSource = readFileSync(new URL("../../src/lib/realtime-client.ts", import.meta.url), "utf8");
function functionBody(source: string, name: string): string {
  const parsed = ts.createSourceFile("gem-controller.ts", source, ts.ScriptTarget.Latest, true);
  let body: string | null = null;
  function visit(node: ts.Node): void {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.name?.getText(parsed) === name) body = node.getText(parsed);
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.notEqual(body, null, `Missing ${name}`);
  return body ?? "";
}

test("GEM transport routes exact four validators/ack checks and preserves shared request correlation", () => {
  for (const [name, type, event] of [
    ["collectGemResources", "Collect", "collect"], ["purchaseGemCard", "Purchase", "purchase"],
    ["reserveGemCard", "Reserve", "reserve"], ["yieldGemTurn", "Yield", "yield"],
  ]) {
    const body = functionBody(realtimeSource, name!);
    assert.ok(body.includes(`validateGem${type}Command(command)`));
    assert.ok(body.includes(`validateGem${type}WireAck`));
    assert.ok(body.includes(`this.#socket.emit("gem:${event}", validatedCommand.value, acknowledge)`));
    assert.match(body, /validatedCommand\.value\.requestId/u);
    assert.match(body, /hasConsistentSnapshotAcknowledgement/u);
    assert.match(body, /#acceptAcknowledgementSnapshotVersion/u);
  }
  assert.match(realtimeSource, /hasMatchingAcknowledgementRequestId\(\s*expectedRequestId,/u);
});

test("GEM controller has canonical-only feedback, exact pending retry, session cleanup and active-player gating", () => {
  const execute = functionBody(controllerSource, "executeGemCommand");
  assert.match(execute, /runAsyncSingleFlight\(gameplayMutationFlightRef,/u);
  assert.match(execute, /applyWireSnapshot\(acknowledgement\.data\.snapshot, session\)/u);
  assert.match(execute, /application === "CURRENT"[\s\S]*createGemActionFeedback/u);
  assert.match(execute, /if \(!hasCurrentContext\(\)\) return/u);
  assert.match(execute, /!isRetryableCommandFailure\(error\)[\s\S]*pendingGemCommandRef\.current = null/u);
  assert.match(functionBody(controllerSource, "retryGemAction"), /executeGemCommand\(pending\)/u);
  assert.match(functionBody(controllerSource, "recoverAfterTransportConnection"), /await resumeCurrentSession\(\)[\s\S]*executeGemCommand\(pendingGemCommand\)/u);
  const gating = functionBody(controllerSource, "gemActionSnapshot");
  assert.match(gating, /game\.turn\.activePlayerId !== current\.self\.playerId/u);
  assert.match(gating, /!player\.forfeited/u);
  assert.match(gating, /sessionReplacedRef\.current/u);
  for (const name of ["markSnapshotIncompatible", "clearCurrentRoomClientState", "finalizeEntry", "goHome"])
    assert.match(functionBody(controllerSource, name), /discardGemEditor\(\)/u);
  assert.match(controllerSource, /subscribeSessionReplaced\([\s\S]*?discardGemEditor\(\)/u);
  assert.match(functionBody(controllerSource, "currentLegacyHangulSnapshot"), /PLATFORM_V2_GEM_CARD/u);
});
