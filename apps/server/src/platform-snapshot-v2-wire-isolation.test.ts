import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const serverSourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const repositoryRoot = resolve(serverSourceRoot, "../../..");
const sharedSourceRoot = resolve(repositoryRoot, "packages/shared/src");
const webSourceRoot = resolve(repositoryRoot, "apps/web/src");

function collectProductionTypeScriptFiles(
  directory: string,
): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionTypeScriptFiles(path);
    }
    return entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".test.tsx")
      ? [path]
      : [];
  });
}

function portableRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function functionSource(source: string, functionName: string): string {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist`);

  const remainder = source.slice(start + marker.length);
  const nextFunction = /\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/u.exec(
    remainder,
  );
  const end = nextFunction === null
    ? source.length
    : start + marker.length + nextFunction.index;
  return source.slice(start, end);
}

function lastFunctionSource(source: string, functionName: string): string {
  const marker = `function ${functionName}(`;
  const start = source.lastIndexOf(marker);
  assert.notEqual(start, -1, `${functionName} implementation must exist`);

  const remainder = source.slice(start + marker.length);
  const nextFunction = /\n(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(/u.exec(
    remainder,
  );
  const end = nextFunction === null
    ? source.length
    : start + marker.length + nextFunction.index;
  return source.slice(start, end);
}

test("legacy StateSnapshot V1은 exact schema로 남고 별도 wire union이 같은 state:snapshot 이름을 사용한다", () => {
  const projectionsSource = readFileSync(
    resolve(sharedSourceRoot, "projections.ts"),
    "utf8",
  );
  const realtimeSource = readFileSync(
    resolve(sharedSourceRoot, "realtime.ts"),
    "utf8",
  );
  const socketIoSource = readFileSync(
    resolve(serverSourceRoot, "transport/socket-io.ts"),
    "utf8",
  );
  const realtimeClientSource = readFileSync(
    resolve(webSourceRoot, "lib/realtime-client.ts"),
    "utf8",
  );

  assert.match(
    projectionsSource,
    /StateSnapshotSchema\s*=\s*v\.union\(\[\s*LobbyStateSnapshotSchema,\s*PlayingStateSnapshotSchema,\s*FinishedStateSnapshotSchema,\s*\]\)/u,
  );
  assert.doesNotMatch(projectionsSource, /PlatformSnapshotV2|snapshotVersion/u);
  assert.match(
    realtimeSource,
    /StateSnapshotDeliveryDataSchema\s*=\s*v\.strictObject\(\{\s*snapshot:\s*StateSnapshotSchema,/u,
  );
  assert.match(
    realtimeSource,
    /"state:snapshot":\s*\(event:\s*StateSnapshotEvent\)\s*=>\s*void/u,
  );
  assert.match(
    realtimeSource,
    /StateSnapshotWirePayloadSchema\s*=\s*v\.union\(\[\s*StateSnapshotSchema,\s*PlatformSnapshotV2Schema,\s*\]\)/u,
  );
  assert.match(
    realtimeSource,
    /"state:snapshot":\s*\(event:\s*StateSnapshotWireEvent\)\s*=>\s*void/u,
  );

  const snapshotEventSources = [
    realtimeSource,
    socketIoSource,
    realtimeClientSource,
  ].join("\n");
  assert.doesNotMatch(
    snapshotEventSources,
    /state:snapshot(?::|-)(?:v?2|platform)/iu,
    "V2 must negotiate the existing event instead of adding a parallel event",
  );
});

test("Hangul mapper와 unified V2 projector의 production ownership은 exact하다", () => {
  const mapperPath = resolve(
    serverSourceRoot,
    "application/platform-snapshot-v2-mapper.ts",
  );
  const projectorPath = resolve(
    serverSourceRoot,
    "application/platform-snapshot-v2-projector.ts",
  );
  const selectorPath = resolve(
    serverSourceRoot,
    "transport/snapshot-wire-selector.ts",
  );
  const importers = collectProductionTypeScriptFiles(serverSourceRoot)
    .filter((path) => path !== mapperPath)
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        source.includes("platform-snapshot-v2-mapper") ||
        source.includes("mapLegacyStateSnapshotV1ToPlatformSnapshotV2")
      );
    })
    .map((path) => portableRelative(serverSourceRoot, path));
  const projectorImporters = collectProductionTypeScriptFiles(serverSourceRoot)
    .filter((path) => path !== projectorPath)
    .filter((path) =>
      readFileSync(path, "utf8").includes("platform-snapshot-v2-projector")
    )
    .map((path) => portableRelative(serverSourceRoot, path));
  const selectorSource = readFileSync(selectorPath, "utf8");
  const projectorSource = readFileSync(projectorPath, "utf8");
  const socketIoSource = readFileSync(
    resolve(serverSourceRoot, "transport/socket-io.ts"),
    "utf8",
  );

  assert.deepEqual(importers, [
    "application/platform-snapshot-v2-projector.ts",
    "transport/snapshot-wire-selector.ts",
  ]);
  assert.deepEqual(projectorImporters, ["composition-root.ts"]);
  assert.match(
    selectorSource,
    /mapLegacyStateSnapshotV1ToPlatformSnapshotV2\(\{/u,
  );
  assert.match(selectorSource, /v\.parse\(GameTypeSchema,/u);
  assert.match(selectorSource, /input\.selectedVersion\s*===\s*1/u);
  assert.match(
    projectorSource,
    /if\s*\(input\.room\.gameType\s*===\s*"HANGUL_TILE"\)[\s\S]*?mapLegacyStateSnapshotV1ToPlatformSnapshotV2\(\{/u,
  );
  assert.match(
    projectorSource,
    /this\.#numberTileGameProjector\(\{[\s\S]*?selfPlayerId:\s*input\.selfPlayerId/u,
  );
  assert.match(
    socketIoSource,
    /import\s+\{\s*selectSnapshotWirePayload\s*\}\s+from\s+"\.\/snapshot-wire-selector\.js"/u,
  );
  assert.doesNotMatch(socketIoSource, /platform-snapshot-v2-mapper/u);
  assert.match(
    socketIoSource,
    /const wireSnapshot = await runtime\.platformSnapshotV2Projector\.project\(\{/u,
  );
});

test("모든 snapshot success ack와 delivery path는 socket별 negotiated projection을 통과한다", () => {
  const socketIoSource = readFileSync(
    resolve(serverSourceRoot, "transport/socket-io.ts"),
    "utf8",
  );
  const handlerExpectations = [
    ["registerCreateRoomHandler", "loadSnapshotForSocket(", "snapshotSuccessAck("],
    ["registerJoinRoomHandler", "loadSnapshotForSocket(", "snapshotSuccessAck("],
    ["registerResumeHandler", "loadSnapshotForSocket(", "snapshotSuccessAck("],
    ["registerStateSyncHandler", "loadSnapshotForSocket(", "snapshotSuccessAck("],
    ["registerGameStartHandler", "loadSnapshotForSocket(", "gameStartSuccessAck("],
    ["registerTurnSubmitHandler", "selectSnapshotForSocket(", "turnSubmitSuccessAck("],
    ["registerTurnDrawHandler", "selectSnapshotForSocket(", "turnDrawSuccessAck("],
    ["registerTurnPassHandler", "selectSnapshotForSocket(", "turnPassSuccessAck("],
    ["registerNumberSubmitHandler", "loadSnapshotForSocket(", "numberSubmitSuccessAck("],
    ["registerNumberDrawHandler", "loadSnapshotForSocket(", "numberDrawSuccessAck("],
    ["registerNumberPassHandler", "loadSnapshotForSocket(", "numberPassSuccessAck("],
  ] as const;

  for (const [handlerName, projectionCall, successAckCall] of handlerExpectations) {
    const handler = functionSource(socketIoSource, handlerName);
    const projectionIndex = handler.indexOf(projectionCall);
    const ackIndex = handler.indexOf(successAckCall);
    assert.notEqual(
      projectionIndex,
      -1,
      `${handlerName} must load or select its negotiated wire projection`,
    );
    assert.notEqual(ackIndex, -1, `${handlerName} must build its success ack`);
    assert.ok(
      projectionIndex < ackIndex,
      `${handlerName} must project before success acknowledgement delivery`,
    );
  }

  const selectorHelper = lastFunctionSource(
    socketIoSource,
    "selectSnapshotForSocket",
  );
  assert.match(
    selectorHelper,
    /selectedVersion:\s*socket\.data\.selectedSnapshotVersion/u,
  );
  assert.match(selectorHelper, /canonicalGameType:\s*room\.gameType/u);

  const negotiatedProjector = functionSource(
    socketIoSource,
    "projectSnapshotForSocket",
  );
  assert.match(
    negotiatedProjector,
    /isRoomAdmissionCompatible\(\s*room\.gameType,\s*socketAdmissionCapabilities\(socket\)/u,
  );
  assert.match(
    negotiatedProjector,
    /if\s*\(room\.gameType\s*===\s*"HANGUL_TILE"\)[\s\S]*?selectSnapshotForSocket\(/u,
  );
  assert.match(
    negotiatedProjector,
    /runtime\.platformSnapshotV2Projector\.project\(\{/u,
  );
  const snapshotLoader = functionSource(socketIoSource, "loadSnapshotForSocket");
  assert.match(snapshotLoader, /projectSnapshotForSocket\(/u);

  const fanOut = functionSource(socketIoSource, "fanOutRoomSnapshots");
  assert.match(fanOut, /projectSnapshotForSocket\(/u);
  assert.match(
    fanOut,
    /connectedSocket\.emit\(\s*"state:snapshot",\s*snapshotEvent\(loaded\.metadata,\s*loaded\.wireSnapshot\)/u,
  );
  const stateSync = functionSource(socketIoSource, "registerStateSyncHandler");
  assert.match(
    stateSync,
    /socket\.emit\(\s*"state:snapshot",\s*snapshotEvent\(loaded\.metadata,\s*loaded\.wireSnapshot\)/u,
  );
  assert.equal(
    socketIoSource.match(/\.emit\(\s*"state:snapshot"/gu)?.length ?? 0,
    2,
    "all snapshot events must remain in the two characterized selector-backed delivery paths",
  );
});

test("snapshot/game capability는 connection/admission metadata이며 canonical state에 저장되지 않는다", () => {
  const selectedVersionOwners = collectProductionTypeScriptFiles(serverSourceRoot)
    .filter((path) => readFileSync(path, "utf8").includes("selectedSnapshotVersion"))
    .map((path) => portableRelative(serverSourceRoot, path))
    .sort();
  const snapshotCapabilityOwners = collectProductionTypeScriptFiles(
    serverSourceRoot,
  )
    .filter((path) => readFileSync(path, "utf8").includes("supportedSnapshotVersions"))
    .map((path) => portableRelative(serverSourceRoot, path))
    .sort();
  const gameCapabilityOwners = collectProductionTypeScriptFiles(serverSourceRoot)
    .filter((path) => readFileSync(path, "utf8").includes("supportedGameTypes"))
    .map((path) => portableRelative(serverSourceRoot, path))
    .sort();
  const admissionPolicySource = readFileSync(
    resolve(serverSourceRoot, "application/room-admission-policy.ts"),
    "utf8",
  );
  const socketIoSource = readFileSync(
    resolve(serverSourceRoot, "transport/socket-io.ts"),
    "utf8",
  );
  const canonicalStateRoots = [
    "games",
    "infrastructure",
    "model",
    "ports",
  ];
  const canonicalCapabilityLeaks = canonicalStateRoots.flatMap((directory) =>
    collectProductionTypeScriptFiles(resolve(serverSourceRoot, directory))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return source.includes("selectedSnapshotVersion") ||
          source.includes("supportedSnapshotVersions") ||
          source.includes("supportedGameTypes");
      })
      .map((path) => portableRelative(serverSourceRoot, path))
  );

  assert.deepEqual(selectedVersionOwners, [
    "application/room-admission-policy.ts",
    "transport/socket-io.ts",
  ]);
  assert.deepEqual(snapshotCapabilityOwners, [
    "transport/snapshot-version-negotiation.ts",
  ]);
  assert.deepEqual(gameCapabilityOwners, [
    "application/room-admission-policy.ts",
    "transport/game-type-capability.ts",
    "transport/socket-io.ts",
  ]);
  assert.deepEqual(canonicalCapabilityLeaks, []);
  assert.match(
    admissionPolicySource,
    /RoomAdmissionCapabilities\s*=\s*Readonly<\{\s*selectedSnapshotVersion:\s*SnapshotWireVersion;\s*supportedGameTypes:\s*readonly GameType\[\];\s*\}>/u,
  );
  assert.match(
    admissionPolicySource,
    /deliberately not persisted as Room, Player, or Session authority/u,
  );
  assert.match(
    socketIoSource,
    /RealtimeSocketData\s*=\s*\{\s*selectedSnapshotVersion:\s*SnapshotWireVersion;\s*supportedGameTypes:\s*readonly GameType\[\];\s*\}/u,
  );
  assert.match(
    socketIoSource,
    /socket\.data\.selectedSnapshotVersion\s*=\s*negotiation\.selectedVersion/u,
  );
  assert.match(
    socketIoSource,
    /socket\.data\.supportedGameTypes\s*=\s*gameCapability\.supportedGameTypes/u,
  );
  const socketCapabilities = functionSource(
    socketIoSource,
    "socketAdmissionCapabilities",
  );
  assert.match(
    socketCapabilities,
    /selectedSnapshotVersion:\s*socket\.data\.selectedSnapshotVersion/u,
  );
  assert.match(
    socketCapabilities,
    /supportedGameTypes:\s*socket\.data\.supportedGameTypes/u,
  );
});

test("Web은 [2, 1]을 광고하고 dual decoder와 explicit incompatible route를 사용한다", () => {
  const realtimeClientSource = readFileSync(
    resolve(webSourceRoot, "lib/realtime-client.ts"),
    "utf8",
  );
  const decoderSource = readFileSync(
    resolve(webSourceRoot, "lib/snapshot-wire-decoder.ts"),
    "utf8",
  );
  const roomViewSource = readFileSync(
    resolve(webSourceRoot, "lib/room-snapshot-view.ts"),
    "utf8",
  );
  const lobbyAppSource = readFileSync(
    resolve(webSourceRoot, "app/use-lobby-app.ts"),
    "utf8",
  );
  const appSource = readFileSync(
    resolve(webSourceRoot, "App.tsx"),
    "utf8",
  );

  assert.match(
    decoderSource,
    /WEB_SUPPORTED_SNAPSHOT_VERSIONS\s*=\s*Object\.freeze\(\[2,\s*1\]\s+as\s+const\)/u,
  );
  assert.match(
    realtimeClientSource,
    /supportedSnapshotVersions:\s*\[\.\.\.WEB_SUPPORTED_SNAPSHOT_VERSIONS\]/u,
  );
  assert.match(decoderSource, /validatePlatformSnapshotV2\(input\)/u);
  assert.match(decoderSource, /validateStateSnapshot\(input\)/u);
  assert.match(decoderSource, /export function decodeWebSnapshot\(/u);
  assert.match(lobbyAppSource, /decodeWebSnapshot\(incomingSnapshot\)/u);
  assert.match(lobbyAppSource, /markSnapshotIncompatible\(decoded\.reason\)/u);
  assert.match(roomViewSource, /export function resolveRoomSnapshotView\(/u);
  assert.match(roomViewSource, /kind:\s*"INCOMPATIBLE"/u);
  assert.match(
    appSource,
    /if\s*\(app\.snapshotIncompatibility\s*!==\s*null\)[\s\S]*?<IncompatibleSnapshotScreen/u,
  );
  assert.match(
    appSource,
    /resolveRoomSnapshotView\(app\.compatibleSnapshot\)/u,
  );
});
