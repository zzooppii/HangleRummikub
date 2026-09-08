import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NumberTilePlayingScreen } from "../features/number-tile/NumberTilePlayingScreen.js";
import { numberBoardFixture, numberBoardProps } from "./number-board-test-fixture.js";
import { placeNumberTileDraftTileInNewMeld, undoNumberTileTurnDraft } from "../features/number-tile/number-tile-turn-draft.js";

const css = readFileSync(new URL("../../src/features/number-tile/number-tile-board.css", import.meta.url), "utf8");
const editor = readFileSync(new URL("../../src/features/number-tile/NumberTileTurnDraftEditor.tsx", import.meta.url), "utf8");
const render = (melds = 3, rack = 14, length = 3, active = true) => renderToStaticMarkup(createElement(NumberTilePlayingScreen, numberBoardProps(numberBoardFixture(melds, rack, length, active))));

test("Number board renders a playmat and compact groups, tray and dock rather than large editor cards", () => {
  const html = render();
  assert.match(html, /number-play-surface editable/);
  assert.match(html, /number-meld-pack/);
  assert.equal((html.match(/class="number-meld-group /g) ?? []).length, 3);
  assert.doesNotMatch(html, /number-meld-card[ "\n]|class="number-editor"|number-editor-guide|CURRENT TURN/);
  assert.match(html, /number-player-strip/);
  assert.match(html, /number-action-dock/);
  assert.ok(html.indexOf('class="number-rack') < html.indexOf('class="number-action-dock'));
  assert.match(html, /aria-label="공용 타일 보드" data-number-drop-new-meld/);
});

test("Number large Table and long RUN keep ordered physical groups and readable tile labels", () => {
  for (const count of [3, 6, 10, 15]) {
    const html = render(count);
    assert.equal((html.match(/data-number-drop-meld-index=/g) ?? []).length, count);
    for (let i = 0; i < count; i++) assert.match(html, new RegExp(`조합 ${i + 1}, 타일 3개`));
  }
  for (const length of [3, 6, 10, 13]) {
    const html = render(1, 14, length);
    assert.match(html, new RegExp(`조합 1, 타일 ${length}개`));
    assert.match(html, /빨강 1, 조합 1/);
  }
  assert.match(css, /\.number-meld-pack \{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.number-meld-tiles \{[^}]*flex-wrap:wrap/);
});

test("Number 14/19/24/30 tile trays keep sorting and wrap without horizontal scrolling", () => {
  for (const count of [14, 19, 24, 30]) {
    const html = render(3, count);
    assert.equal((html.match(/, 내 랙\. 누르면/g) ?? []).length, count);
    assert.match(html, /aria-label="내 랙 정렬"/);
    assert.match(html, /aria-pressed="true">기본/);
  }
  assert.match(css, /\.number-rack-tiles \{[^}]*repeat\(auto-fill/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)|position:\s*sticky/);
});

test("multiple three/four-tile GROUPs remain separate accessible compact physical groups", () => {
  for (const length of [3, 4]) {
    const snapshot = numberBoardFixture(10, 14, length, true, true);
    const html = renderToStaticMarkup(createElement(NumberTilePlayingScreen, numberBoardProps(snapshot)));
    assert.equal((html.match(/class="number-meld-group /g) ?? []).length, 10);
    assert.equal((html.match(/✓ 같은 숫자 조합/g) ?? []).length, 10);
    assert.doesNotMatch(html, /number-meld-card[ "\n]|assignedColor|조커 숫자 선택/);
  }
});

test("Number board whitespace routes to one atomic new-meld action, not coordinates", () => {
  assert.match(editor, /className=\{`number-play-surface[\s\S]*?data-number-drop-new-meld/);
  assert.ok(editor.indexOf('element.closest("[data-number-drop-meld-index]")') < editor.indexOf('element.closest("[data-number-drop-new-meld]")'));
  assert.match(editor, /target.kind === "NEW_MELD"[\s\S]*placeTileInNewMeld\(candidate.tileId\)/);
  const props = numberBoardProps(numberBoardFixture(0));
  const draft = props.turnDraft.draft;
  assert.ok(draft);
  const tile = draft.availableRackTiles[0]!;
  const edited = placeNumberTileDraftTileInNewMeld(draft, tile.tileId);
  assert.equal(edited.ok, true);
  if (!edited.ok) throw new Error("Expected local whitespace drop.");
  assert.equal(edited.draft.history.length, 1);
  assert.equal(edited.draft.table.melds[0]?.tiles[0]?.tileId, tile.tileId);
  const undo = undoNumberTileTurnDraft(edited.draft);
  assert.equal(undo.ok, true);
  if (undo.ok) assert.deepEqual(undo.draft.table, draft.table);
});

test("Number board retains empty guidance, opponent lock, stable timer semantics and privacy", () => {
  const html = render(0, 14, 3, false);
  assert.match(html, /내 타일을 놓아 첫 조합을 만들어보세요/);
  assert.match(html, /첫 등록은 내 타일만 사용해 합계 30점 이상/);
  assert.match(html, /민준님의 차례입니다/);
  assert.match(html, /role="timer"[^>]*aria-live="off"/);
  assert.doesNotMatch(html, /data-drag-enabled="true"/);
  assert.equal((html.match(/, 내 랙\. 누르면/g) ?? []).length, 14);
  assert.doesNotMatch(html, /opponent.*tileId|storageRevision|sessionToken/);
});

test("Number-only board styles preserve mobile targets, focus, nonsticky large rack and reduced motion", () => {
  assert.match(css, /@media \(max-width:600px\)/);
  assert.match(css, /width:44px; min-width:44px; min-height:56px/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /\.number-meld-group:focus-within \.number-meld-helper/);
  assert.match(editor, /조커는 조합당 1개까지 사용할 수 있습니다/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /transition:none !important; animation:none !important/);
  assert.doesNotMatch(css, /url\(|@font-face|canvas|physics/);
  assert.match(editor, /aria-pressed=\{active\}/);
  assert.match(editor, /event.pointerType !== "mouse"/);
  assert.match(editor, /releasePointerCapture/);
  assert.match(editor, /공개 테이블의 타일은 내 랙으로 가져올 수 없습니다/);
});
