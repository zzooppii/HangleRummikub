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

test("shared realtime state:snapshot contract는 기존 StateSnapshot V1에 고정된다", () => {
  const realtimeSource = readFileSync(
    resolve(sharedSourceRoot, "realtime.ts"),
    "utf8",
  );

  assert.match(
    realtimeSource,
    /StateSnapshotDeliveryDataSchema\s*=\s*v\.strictObject\(\{\s*snapshot:\s*StateSnapshotSchema,/u,
  );
  assert.match(
    realtimeSource,
    /"state:snapshot":\s*\(event:\s*StateSnapshotEvent\)\s*=>\s*void/u,
  );
  assert.doesNotMatch(realtimeSource, /PlatformSnapshotV2/u);
  assert.doesNotMatch(realtimeSource, /snapshotVersion/u);
});

test("production Socket.IO/composition은 latent V2 mapper를 참조하지 않는다", () => {
  const mapperPath = resolve(
    serverSourceRoot,
    "application/platform-snapshot-v2-mapper.ts",
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
  const socketIoSource = readFileSync(
    resolve(serverSourceRoot, "transport/socket-io.ts"),
    "utf8",
  );
  const snapshotEmitCount =
    socketIoSource.match(/\.emit\("state:snapshot"/gu)?.length ?? 0;
  const legacySnapshotEmitCount =
    socketIoSource.match(
      /\.emit\("state:snapshot",\s*snapshotEvent\(snapshot\)\)/gu,
    )?.length ?? 0;

  assert.deepEqual(importers, []);
  assert.match(socketIoSource, /type StateSnapshot[,\n]/u);
  assert.equal(snapshotEmitCount, 2);
  assert.equal(legacySnapshotEmitCount, snapshotEmitCount);
  assert.doesNotMatch(socketIoSource, /PlatformSnapshotV2/u);
  assert.doesNotMatch(socketIoSource, /snapshotVersion/u);
});

test("Web production source는 V1 validator와 Legacy Hangul renderer만 사용한다", () => {
  const violations = collectProductionTypeScriptFiles(webSourceRoot)
    .filter((path) => {
      const source = readFileSync(path, "utf8");
      return (
        source.includes("PlatformSnapshotV2") ||
        source.includes("platform-snapshot-v2") ||
        source.includes("snapshotVersion")
      );
    })
    .map((path) => portableRelative(webSourceRoot, path));
  const realtimeClientSource = readFileSync(
    resolve(webSourceRoot, "lib/realtime-client.ts"),
    "utf8",
  );
  const appSource = readFileSync(
    resolve(webSourceRoot, "App.tsx"),
    "utf8",
  );

  assert.deepEqual(violations, []);
  assert.match(
    realtimeClientSource,
    /validateStateSnapshotEvent\(input\)/u,
  );
  assert.match(
    appSource,
    /resolveLegacyHangulRoomView\(app\.snapshot\)/u,
  );
});
