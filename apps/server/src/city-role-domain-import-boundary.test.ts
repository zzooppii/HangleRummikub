import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const repositoryRoot = resolve(sourceRoot, "../../..");
const domainRoot = resolve(sourceRoot, "games/city-role/domain");
const portable = (path: string): string => path.split(sep).join("/");
const insideDomain = (path: string): boolean => portable(path).startsWith(`${portable(domainRoot)}/`);

function files(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function imports(source: ts.SourceFile): readonly string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) found.push(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) found.push(node.argument.literal.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const argument = node.arguments[0];
      if (argument !== undefined && ts.isStringLiteralLike(argument)) found.push(argument.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function importTarget(path: string, specifier: string): string | null {
  return specifier.startsWith(".") ? resolve(dirname(path), specifier.replace(/\.js$/, ".ts")) : null;
}

test("CITY pure domain imports only its own concrete modules and existing validation dependency", () => {
  const violations: string[] = [];
  for (const path of files(domainRoot)) {
    for (const specifier of imports(parse(path))) {
      const target = importTarget(path, specifier);
      if (target !== null ? !insideDomain(target) : specifier !== "valibot") violations.push(`${portable(relative(sourceRoot, path))} -> ${specifier}`);
    }
  }
  assert.deepEqual(violations, []);
});

test("CITY domain AST has no Clock/RNG/transport/persistence authority or generic game framework", () => {
  const forbidden = new Set([
    "Date", "setTimeout", "setInterval", "setImmediate", "performance", "crypto", "fetch", "process",
    "Room", "RoomRepository", "RoomUnitOfWork", "Socket", "SocketIO", "Clock", "RealClock", "Scheduler", "React",
    "GameRevision", "RequestId", "TurnDraft", "Tile", "Rack", "Joker", "GenericGameState", "GenericGameCommand",
    "GenericRole", "GenericAbility", "GameModule", "GameLifecycle", "GenericCard", "GenericResult", "GenericRuleEngine",
  ]);
  const violations: string[] = [];
  for (const path of files(domainRoot)) {
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && forbidden.has(node.text)) violations.push(`${relative(sourceRoot, path)}: ${node.text}`);
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "random") violations.push(`${relative(sourceRoot, path)}: Math.random`);
      if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.argumentExpression !== undefined && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "random") violations.push(`${relative(sourceRoot, path)}: Math[random]`);
      ts.forEachChild(node, visit);
    };
    visit(parse(path));
  }
  assert.deepEqual(violations, []);
});

test("P15B CITY domain consumers are restricted to its approved concrete application/compatibility layers", () => {
  const violations: string[] = [];
  const roots = [sourceRoot, resolve(repositoryRoot, "apps/web/src"), resolve(repositoryRoot, "packages/shared/src")];
  for (const path of roots.flatMap(files).filter((path) => !insideDomain(path))) {
    const source = parse(path);
    for (const specifier of imports(source)) {
      const target = importTarget(path, specifier);
      const importsDomain = target !== null && insideDomain(target);
      const approvedConsumer = ["games/city-role/application/", "games/city-role/compatibility/"].some((prefix) => portable(relative(sourceRoot, path)).startsWith(prefix));
      if (importsDomain && !approvedConsumer) violations.push(`${relative(repositoryRoot, path)} -> ${specifier}`);
    }
  }
  assert.deepEqual(violations, []);
});
