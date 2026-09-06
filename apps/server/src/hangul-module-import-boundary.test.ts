import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const hangulModuleRoot = resolve(sourceRoot, "games/hangul-tile");

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function sourceRelative(path: string): string {
  return portablePath(relative(sourceRoot, path));
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function importSpecifiers(path: string): readonly string[] {
  const source = readFileSync(path, "utf8");
  const parsed = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]!)
    ) {
      specifiers.push(node.arguments[0]!.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(parsed);
  return specifiers;
}

function resolvedTypeScriptImport(
  importer: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return resolve(
    dirname(importer),
    specifier.endsWith(".js")
      ? `${specifier.slice(0, -3)}.ts`
      : specifier,
  );
}

const allTypeScriptFiles = collectTypeScriptFiles(sourceRoot);
const productionFiles = allTypeScriptFiles.filter(
  (path) => !path.endsWith(".test.ts"),
);

test("legacy Hangul production implementation은 새 module namespace에만 존재한다", () => {
  for (const oldDirectory of ["domain/game", "domain/hangul"]) {
    const oldProductionFiles = collectTypeScriptFiles(
      resolve(sourceRoot, oldDirectory),
    ).filter((path) => !path.endsWith(".test.ts"));
    assert.deepEqual(oldProductionFiles, []);
  }

  const topLevelLegacySources = readdirSync(resolve(sourceRoot, "games"), {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith("legacy-hangul-") &&
        entry.name.endsWith(".ts"),
    )
    .map((entry) => entry.name);
  assert.deepEqual(topLevelLegacySources, []);

  const staleSpecifiers = allTypeScriptFiles.flatMap((path) =>
    importSpecifiers(path)
      .filter(
        (specifier) =>
          specifier.includes("/domain/game/") ||
          specifier.includes("/domain/hangul/") ||
          specifier.includes("/games/legacy-hangul-"),
      )
      .map((specifier) => `${sourceRelative(path)} -> ${specifier}`),
  );
  assert.deepEqual(staleSpecifiers, []);
});

test("Hangul domain은 platform orchestration이나 runtime adapter를 import하지 않는다", () => {
  const domainRoot = resolve(hangulModuleRoot, "domain");
  const forbiddenBareImports = new Set([
    "express",
    "react",
    "socket.io",
    "socket.io-client",
  ]);
  const forbiddenPathSegments = [
    "/application/",
    "/infrastructure/",
    "/model/",
    "/transport/",
  ];
  const violations: string[] = [];

  for (const path of collectTypeScriptFiles(domainRoot)) {
    for (const specifier of importSpecifiers(path)) {
      if (
        specifier.startsWith("node:") ||
        forbiddenBareImports.has(specifier)
      ) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
        continue;
      }

      const target = resolvedTypeScriptImport(path, specifier);
      if (target === null) {
        continue;
      }
      const portableTarget = portablePath(target);
      if (
        forbiddenPathSegments.some((segment) =>
          portableTarget.includes(segment),
        ) ||
        portableTarget.endsWith("/composition-root.ts") ||
        portableTarget.endsWith("/server.ts")
      ) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("module 밖의 direct Hangul imports는 검증된 mixed/composition allowlist를 넘지 않는다", () => {
  const allowedImporters = new Set([
    "application/game-deadline-service.ts",
    "application/game-finish-transition.ts",
    "application/game-start-service.ts",
    "application/lobby-state-snapshot-projector.ts",
    "application/room-leave-service.ts",
    "application/room-presence-policy-service.ts",
    "application/room-session-service.ts",
    "application/turn-draw-service.ts",
    "application/turn-pass-service.ts",
    "application/turn-submit-service.ts",
    "application/turn-timeout-service.ts",
    "application/turn-transition.ts",
    "composition-root.ts",
    "infrastructure/in-memory-persistence.ts",
    "model/persistence.ts",
  ]);
  const unexpectedImporters = productionFiles
    .filter((path) => !path.startsWith(`${hangulModuleRoot}${sep}`))
    .filter((path) =>
      importSpecifiers(path).some((specifier) => {
        const target = resolvedTypeScriptImport(path, specifier);
        return target?.startsWith(`${hangulModuleRoot}${sep}`) ?? false;
      }),
    )
    .map(sourceRelative)
    .filter((path) => !allowedImporters.has(path))
    .sort();

  assert.deepEqual(unexpectedImporters, []);
});
