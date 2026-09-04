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

test("Legacy Hangul v1 Socket.IO event는 현재 application service path에 직접 연결된다", () => {
  const routing = [
    ["session:bootstrap", "runtime.roomSessionService.bootstrapSession"],
    ["room:create", "runtime.roomSessionService.createRoom"],
    ["room:join", "runtime.roomSessionService.joinRoom"],
    ["session:resume", "runtime.sessionResumeService.resumeSession"],
    ["state:sync", "loadSnapshot"],
    ["game:start", "runtime.gameStartService.start"],
    ["turn:submit", "runtime.turnSubmitService.submit"],
    ["turn:draw", "runtime.turnDrawService.draw"],
    ["turn:pass", "runtime.turnPassService.pass"],
    ["room:leave", "runtime.roomLeaveService.leave"],
  ] as const;

  for (const [eventName, call] of routing) {
    assert.equal(
      callsInside(eventName).has(call),
      true,
      `${eventName} must directly route through ${call}`,
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
