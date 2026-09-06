import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

function sourceFiles(directory: URL): readonly URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      return sourceFiles(new URL(`${entry.name}/`, directory));
    }
    return /\.tsx?$/u.test(entry.name) ? [child] : [];
  });
}

const numberDirectory = new URL("../../src/features/number-tile/", import.meta.url);
const numberSource = sourceFiles(numberDirectory)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const appSource = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
const realtimeSource = readFileSync(
  new URL("../../src/lib/realtime-client.ts", import.meta.url),
  "utf8",
);
const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
const repositoryRoot = resolve(sourceRoot, "../../..");
const hangulWebRoot = resolve(sourceRoot, "features/game");
const numberWebRoot = resolve(sourceRoot, "features/number-tile");
const sharedHangulRoot = resolve(
  repositoryRoot,
  "packages/shared/src/games/hangul-tile",
);
const sharedNumberRoot = resolve(
  repositoryRoot,
  "packages/shared/src/games/number-tile",
);

function portablePath(path: string): string {
  return path.split(sep).join("/");
}

function collectProductionTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return collectProductionTypeScriptFiles(path);
    }
    return entry.isFile() &&
      /\.tsx?$/u.test(entry.name) &&
      !/\.test\.tsx?$/u.test(entry.name)
      ? [path]
      : [];
  });
}

function importSpecifiers(path: string): readonly string[] {
  const parsed = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
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

function resolvedRelativeImportBase(
  importer: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith(".")) {
    return null;
  }
  return resolve(
    dirname(importer),
    specifier.endsWith(".js") ? specifier.slice(0, -3) : specifier,
  );
}

function crossNamespaceImports(
  fromRoot: string,
  toRoot: string,
): readonly string[] {
  const targetPrefix = `${portablePath(toRoot)}/`;
  return collectProductionTypeScriptFiles(fromRoot).flatMap((path) =>
    importSpecifiers(path)
      .filter((specifier) => {
        const target = resolvedRelativeImportBase(path, specifier);
        return (
          target !== null &&
          (portablePath(target) === portablePath(toRoot) ||
            portablePath(target).startsWith(targetPrefix))
        );
      })
      .map(
        (specifier) =>
          `${portablePath(relative(repositoryRoot, path))} -> ${specifier}`,
      ),
  );
}

test("Number Web module은 Hangul draft/Board와 generic game UI abstraction에 의존하지 않는다", () => {
  assert.doesNotMatch(
    numberSource,
    /features\/game|legacy-hangul|games\/hangul-tile|\.\.\/.*turn-draft|WordGroup|ProposedBoard|Generic(Tile|Rack|Board|Game)/iu,
  );
  assert.doesNotMatch(numberSource, /GameModule|GameController|GameBoard/u);
});

test("Hangul과 Number Web gameplay feature는 서로를 import하지 않는다", () => {
  assert.deepEqual(
    [
      ...crossNamespaceImports(hangulWebRoot, numberWebRoot),
      ...crossNamespaceImports(numberWebRoot, hangulWebRoot),
    ],
    [],
  );

  const hangulSource = collectProductionTypeScriptFiles(hangulWebRoot)
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.doesNotMatch(hangulSource, /NumberTile|NUMBER_TILE|number-tile/u);
});

test("shared Hangul과 Number game contract namespace는 서로를 import하지 않는다", () => {
  assert.deepEqual(
    [
      ...crossNamespaceImports(sharedHangulRoot, sharedNumberRoot),
      ...crossNamespaceImports(sharedNumberRoot, sharedHangulRoot),
    ],
    [],
  );
});

test("Number renderer는 canonical V2 room view branch에서만 선택된다", () => {
  assert.match(appSource, /roomView\.kind === "NUMBER_TILE_PLAYING"/u);
  assert.match(appSource, /roomView\.kind === "NUMBER_TILE_FINISHED"/u);
  assert.doesNotMatch(appSource, /selectedGameType[\s\S]*NumberTilePlayingScreen/u);
});

test("Number wire surface에는 start/advisory/generic command가 추가되지 않는다", () => {
  assert.match(realtimeSource, /"number:submit"/u);
  assert.match(realtimeSource, /"number:draw"/u);
  assert.match(realtimeSource, /"number:pass"/u);
  assert.doesNotMatch(realtimeSource, /"number:start"|"number:turn-started"|"number:finished"|"game:command"/u);
});

test("Number UI는 확정된 세 finish reason만 표시하고 overall deadline을 만들지 않는다", () => {
  assert.match(numberSource, /"RACK_EMPTY"/u);
  assert.match(numberSource, /"STALEMATE"/u);
  assert.match(numberSource, /"LAST_PLAYER_STANDING"/u);
  assert.doesNotMatch(numberSource, /TIME_LIMIT|ALL_PLAYERS_FORFEITED|gameDeadlineAt/u);
});
