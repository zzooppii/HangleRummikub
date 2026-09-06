import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const numberDomainRoot = resolve(sourceRoot, "games/number-tile/domain");

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

function resolveTypeScriptImport(
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

test("Number Tile domain은 Hangul과 platform runtime layer를 import하지 않는다", () => {
  const forbiddenBareImports = new Set([
    "express",
    "react",
    "socket.io",
    "socket.io-client",
  ]);
  const allowedSystemPort = resolve(sourceRoot, "ports/system.ts");
  const violations: string[] = [];

  for (const path of collectTypeScriptFiles(numberDomainRoot)) {
    for (const specifier of importSpecifiers(path)) {
      if (forbiddenBareImports.has(specifier)) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
        continue;
      }
      if (
        !specifier.startsWith(".") &&
        specifier !== "@hangul-rummikub/shared" &&
        specifier !== "valibot"
      ) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
        continue;
      }

      const target = resolveTypeScriptImport(path, specifier);
      if (target === null) {
        continue;
      }
      const portableTarget = portablePath(target);
      if (
        !portableTarget.startsWith(`${portablePath(numberDomainRoot)}/`) &&
        portableTarget !== portablePath(allowedSystemPort)
      ) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("Number Tile domain은 runtime time/random/timer와 stable meld identity를 만들지 않는다", () => {
  const violations = collectTypeScriptFiles(numberDomainRoot).flatMap(
    (path) => {
      const source = readFileSync(path, "utf8");
      return [
        ["Date.now", source.includes("Date.now")],
        ["Math.random", source.includes("Math.random")],
        ["setTimeout", source.includes("setTimeout")],
        ["setInterval", source.includes("setInterval")],
        ["meldId", /\bmeldId\b/u.test(source)],
      ]
        .filter((entry) => entry[1])
        .map((entry) => `${sourceRelative(path)} -> ${entry[0]}`);
    },
  );

  assert.deepEqual(violations, []);
});

test("P7B runtime은 검증된 Number owner/seam에서만 Number Tile domain을 직접 import한다", () => {
  const numberDomainPrefix = portablePath(numberDomainRoot);
  const allowedOwnerPrefixes = [
    "games/number-tile/application/",
    "games/number-tile/compatibility/",
  ] as const;
  const allowedExactSeams = new Set([
    "application/player-lifecycle-router.ts",
    "application/turn-transition.ts",
    "model/persistence.ts",
  ]);
  const directImports = collectTypeScriptFiles(sourceRoot)
    .filter((path) => !path.endsWith(".test.ts"))
    .filter((path) => !portablePath(path).startsWith(numberDomainPrefix))
    .flatMap((path) =>
      importSpecifiers(path)
        .map((specifier) => ({
          specifier,
          target: resolveTypeScriptImport(path, specifier),
        }))
        .filter(
          ({ target }) =>
            target !== null &&
            portablePath(target).startsWith(numberDomainPrefix),
        )
        .map(({ specifier }) => ({
          importer: sourceRelative(path),
          edge: `${sourceRelative(path)} -> ${specifier}`,
        })),
    );

  const violations = directImports
    .filter(
      ({ importer }) =>
        !allowedExactSeams.has(importer) &&
        !allowedOwnerPrefixes.some((prefix) => importer.startsWith(prefix)),
    )
    .map(({ edge }) => edge);
  assert.deepEqual(violations, []);

  // These are the only verified cross-module owners. In particular,
  // transport, infrastructure, and Hangul code must go through their narrow
  // routing/storage seams instead of learning the Number domain shape.
  assert.deepEqual(
    [...new Set(
      directImports
        .map(({ importer }) => importer)
        .filter((importer) => allowedExactSeams.has(importer)),
    )].sort(),
    [...allowedExactSeams].sort(),
  );
});
