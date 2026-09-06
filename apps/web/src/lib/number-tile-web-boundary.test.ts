import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

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

test("Number Web module은 Hangul draft/Board와 generic game UI abstraction에 의존하지 않는다", () => {
  assert.doesNotMatch(
    numberSource,
    /features\/game|legacy-hangul|games\/hangul-tile|\.\.\/.*turn-draft|WordGroup|ProposedBoard|Generic(Tile|Rack|Board|Game)/iu,
  );
  assert.doesNotMatch(numberSource, /GameModule|GameController|GameBoard/u);
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
