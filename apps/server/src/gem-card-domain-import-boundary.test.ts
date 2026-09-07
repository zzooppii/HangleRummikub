import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const gemDomainRoot = resolve(sourceRoot, "games/gem-card/domain");

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function sourceRelative(path: string): string {
  return portablePath(relative(sourceRoot, path));
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function parseSource(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function importSpecifiers(path: string): readonly string[] {
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
  visit(parseSource(path));
  return specifiers;
}

function resolveTypeScriptImport(
  importer: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) return null;
  return resolve(
    dirname(importer),
    specifier.endsWith(".js") ? `${specifier.slice(0, -3)}.ts` : specifier,
  );
}

test("GEM Card domain은 자기 module과 browser-safe neutral primitives만 import한다", () => {
  const allowedSharedImports = new Set([
    "GameId",
    "GameIdSchema",
    "GameRevision",
    "GameRevisionSchema",
    "PlayerId",
    "PlayerIdSchema",
    "ServerTime",
    "ServerTimeSchema",
    "TurnId",
    "TurnIdSchema",
  ]);
  const violations: string[] = [];
  for (const path of collectTypeScriptFiles(gemDomainRoot)) {
    for (const specifier of importSpecifiers(path)) {
      if (
        !specifier.startsWith(".") &&
        specifier !== "@hangul-rummikub/shared" &&
        specifier !== "valibot"
      ) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
        continue;
      }
      const target = resolveTypeScriptImport(path, specifier);
      if (
        target !== null &&
        !portablePath(target).startsWith(`${portablePath(gemDomainRoot)}/`)
      ) {
        violations.push(`${sourceRelative(path)} -> ${specifier}`);
      }
    }
    function visitSharedImports(node: ts.Node): void {
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteralLike(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "@hangul-rummikub/shared"
      ) {
        const clause = node.importClause;
        if (
          clause === undefined ||
          clause.name !== undefined ||
          clause.namedBindings === undefined ||
          !ts.isNamedImports(clause.namedBindings)
        ) {
          violations.push(`${sourceRelative(path)} -> non-named shared import`);
        } else {
          for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            if (!allowedSharedImports.has(importedName)) {
              violations.push(
                `${sourceRelative(path)} -> @hangul-rummikub/shared:${importedName}`,
              );
            }
          }
        }
      }
      ts.forEachChild(node, visitSharedImports);
    }
    visitSharedImports(parseSource(path));
  }
  assert.deepEqual(violations, []);
});

test("GEM Card domain은 runtime infrastructure와 Tile/Rack 계열 모델을 만들지 않는다", () => {
  const forbiddenIdentifiers = new Set([
    "Board",
    "ConnectionRegistry",
    "GameModule",
    "GenericCard",
    "GenericGameState",
    "GenericMarket",
    "GenericPlayerGameState",
    "GenericResource",
    "GenericResult",
    "GenericRuleEngine",
    "GenericTurn",
    "Joker",
    "Meld",
    "RoomRepository",
    "RoomUnitOfWork",
    "Tile",
    "TurnDraft",
    "WordGroup",
  ]);
  const violations: string[] = [];
  for (const path of collectTypeScriptFiles(gemDomainRoot)) {
    const source = readFileSync(path, "utf8");
    for (const runtimeName of [
      "Date.now",
      "Math.random",
      "setInterval",
      "setTimeout",
    ]) {
      if (source.includes(runtimeName)) {
        violations.push(`${sourceRelative(path)} -> ${runtimeName}`);
      }
    }
    function visit(node: ts.Node): void {
      if (ts.isIdentifier(node) && forbiddenIdentifiers.has(node.text)) {
        violations.push(`${sourceRelative(path)} -> ${node.text}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(parseSource(path));
  }
  assert.deepEqual(violations, []);
});

test("P11A GEM Card domain은 production runtime에서 import되지 않는다", () => {
  const gemPrefix = portablePath(gemDomainRoot);
  const directImports = collectTypeScriptFiles(sourceRoot)
    .filter((path) => !path.endsWith(".test.ts"))
    .filter((path) => !portablePath(path).startsWith(gemPrefix))
    .flatMap((path) =>
      importSpecifiers(path)
        .map((specifier) => ({
          specifier,
          target: resolveTypeScriptImport(path, specifier),
        }))
        .filter(
          ({ target }) =>
            target !== null && portablePath(target).startsWith(gemPrefix),
        )
        .map(({ specifier }) => `${sourceRelative(path)} -> ${specifier}`),
    );
  assert.deepEqual(directImports, []);
});
