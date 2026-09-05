import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const socketIoSource = readFileSync(
  new URL("../../src/transport/socket-io.ts", import.meta.url),
  "utf8",
);
const sourceFile = ts.createSourceFile(
  "socket-io.ts",
  socketIoSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);

function handlerFor(
  eventName: string,
): ts.ArrowFunction | ts.FunctionExpression {
  const handlers: (ts.ArrowFunction | ts.FunctionExpression)[] = [];

  function visit(node: ts.Node): void {
    const eventArgument = ts.isCallExpression(node)
      ? node.arguments[0]
      : undefined;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(sourceFile) === "socket" &&
      node.expression.name.text === "on" &&
      eventArgument !== undefined &&
      ts.isStringLiteralLike(eventArgument) &&
      eventArgument.text === eventName
    ) {
      const callback = node.arguments[1];
      if (
        callback !== undefined &&
        (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
      ) {
        handlers.push(callback);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  assert.equal(handlers.length, 1, `expected one Socket.IO handler: ${eventName}`);
  const handler = handlers[0];
  if (handler === undefined) {
    throw new Error(`Missing Socket.IO handler: ${eventName}`);
  }
  return handler;
}

function callsInside(eventName: string): ReadonlySet<string> {
  const calls = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      calls.add(node.expression.getText(sourceFile).replaceAll(/\s/gu, ""));
    }
    ts.forEachChild(node, visit);
  }

  visit(handlerFor(eventName));
  return calls;
}

function initializesReceivedAtFromRuntimeClock(eventName: string): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "receivedAt" &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression
        .getText(sourceFile)
        .replaceAll(/\s/gu, "") === "runtime.clock.now"
    ) {
      found = true;
    }
    ts.forEachChild(node, visit);
  }

  visit(handlerFor(eventName));
  return found;
}

function passesReceivedAtToRouter(
  eventName: string,
  routerCall: string,
): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sourceFile).replaceAll(/\s/gu, "") ===
        routerCall
    ) {
      const input = node.arguments[0];
      if (input !== undefined && ts.isObjectLiteralExpression(input)) {
        found = input.properties.some(
          (property) =>
            (ts.isShorthandPropertyAssignment(property) &&
              property.name.text === "receivedAt") ||
            (ts.isPropertyAssignment(property) &&
              property.name.getText(sourceFile) === "receivedAt" &&
              property.initializer.getText(sourceFile) === "receivedAt"),
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(handlerFor(eventName));
  return found;
}

test("platform Socket.IO event는 기존 service path를, Legacy Hangul v1 command는 routing seam을 사용한다", () => {
  const platformRouting = [
    ["session:bootstrap", "runtime.roomSessionService.bootstrapSession"],
    ["room:create", "runtime.roomSessionService.createRoom"],
    ["room:join", "runtime.roomSessionService.joinRoom"],
    ["session:resume", "runtime.sessionResumeService.resumeSession"],
    ["state:sync", "loadSnapshot"],
    ["room:leave", "runtime.roomLeaveService.leave"],
  ] as const;

  for (const [eventName, call] of platformRouting) {
    assert.equal(
      callsInside(eventName).has(call),
      true,
      `${eventName} must directly route through ${call}`,
    );
  }

  const legacyGameRouting = [
    [
      "game:start",
      "runtime.legacyHangulV1CommandRouter.start",
      "runtime.gameStartService.start",
    ],
    [
      "turn:submit",
      "runtime.legacyHangulV1CommandRouter.submit",
      "runtime.turnSubmitService.submit",
    ],
    [
      "turn:draw",
      "runtime.legacyHangulV1CommandRouter.draw",
      "runtime.turnDrawService.draw",
    ],
    [
      "turn:pass",
      "runtime.legacyHangulV1CommandRouter.pass",
      "runtime.turnPassService.pass",
    ],
  ] as const;

  for (const [eventName, routerCall, oldDirectCall] of legacyGameRouting) {
    const calls = callsInside(eventName);
    assert.equal(
      calls.has(routerCall),
      true,
      `${eventName} must route through ${routerCall}`,
    );
    assert.equal(
      calls.has(oldDirectCall),
      false,
      `${eventName} must not bypass the routing seam via ${oldDirectCall}`,
    );
  }

  const disconnectCalls = callsInside("disconnect");
  assert.equal(
    disconnectCalls.has("runtime.connectionRegistry.disconnect"),
    true,
  );
  assert.equal(
    disconnectCalls.has(
      "runtime.roomPresencePolicyService.onCurrentDisconnect",
    ),
    true,
  );
});

test("turn command receivedAt은 transport entry의 runtime clock 값과 동일한 local identifier로 router에 전달된다", () => {
  const routing = [
    ["turn:submit", "runtime.legacyHangulV1CommandRouter.submit"],
    ["turn:draw", "runtime.legacyHangulV1CommandRouter.draw"],
    ["turn:pass", "runtime.legacyHangulV1CommandRouter.pass"],
  ] as const;

  for (const [eventName, routerCall] of routing) {
    assert.equal(initializesReceivedAtFromRuntimeClock(eventName), true);
    assert.equal(passesReceivedAtToRouter(eventName, routerCall), true);
  }
});
