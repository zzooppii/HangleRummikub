import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(
  new URL("../../src/styles.css", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("../../src/features/game/TurnDraftEditor.tsx", import.meta.url),
  "utf8",
);
const homeSource = readFileSync(
  new URL("../../src/features/lobby/HomeScreen.tsx", import.meta.url),
  "utf8",
);
const finishedSource = readFileSync(
  new URL("../../src/features/game/FinishedScreen.tsx", import.meta.url),
  "utf8",
);

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u").exec(styles);
  assert.notEqual(match, null, `Missing CSS rule for ${selector}`);
  return match?.[1] ?? "";
}

test("최대 길이 nickname과 결과 metadata는 narrow flex/grid에서 wrap 가능하다", () => {
  assert.match(ruleFor(".summary-value"), /overflow-wrap:\s*anywhere/u);
  assert.match(ruleFor(".playing-player > strong"), /overflow-wrap:\s*anywhere/u);
  assert.match(ruleFor(".result-player"), /min-width:\s*0/u);
  assert.match(ruleFor(".result-player"), /overflow-wrap:\s*anywhere/u);
});

test("320px mobile layout과 핵심 touch target 제약이 명시되어 있다", () => {
  assert.match(styles, /html\s*\{[^}]*min-width:\s*320px/su);
  assert.match(styles, /@media \(max-width:\s*480px\)/u);
  assert.match(ruleFor("button"), /min-height:\s*48px/u);
  assert.match(ruleFor(".text-button"), /min-height:\s*44px/u);
  assert.match(ruleFor(".game-tile"), /min-height:\s*52px/u);
  assert.match(ruleFor(".symbol-picker button"), /min-height:\s*46px/u);
});

test("TurnDraft에는 drag 외에 native button 기반 tap/keyboard placement 경로가 있다", () => {
  assert.match(editorSource, /className="game-tile"|className=\{className\}/u);
  assert.match(editorSource, /className="empty-slot-button"/u);
  assert.match(editorSource, /onClick=\{\(\) => props\.onPlace\(target\)\}/u);
  assert.match(editorSource, /type="button"/u);
  assert.doesNotMatch(editorSource, /role="button"/u);
});

test("keyboard focus는 제거되지 않고 명시적인 focus-visible 표시가 있다", () => {
  assert.match(styles, /button:focus-visible[\s\S]*outline:\s*3px solid/u);
  assert.doesNotMatch(styles, /outline:\s*none/u);
});

test("form help와 동적 confirmation은 control에서 접근 가능한 설명으로 연결된다", () => {
  assert.match(homeSource, /aria-describedby="nickname-help"/u);
  assert.match(homeSource, /className="field-help" id="nickname-help"/u);
  assert.match(homeSource, /limitNicknameInput\(event\.target\.value\)/u);
  assert.match(
    homeSource,
    /maxLength=\{NICKNAME_MAX_CODE_POINTS \* 2\}/u,
  );
  assert.match(editorSource, /id="draw-confirmation-message" role="status"/u);
  assert.match(editorSource, /aria-describedby="draw-confirmation-message"/u);
  assert.doesNotMatch(
    editorSource,
    /className="draw-confirmation" role="status"/u,
  );
});

test("dirty draw confirmation은 keyboard focus를 확인 동작으로 옮기고 취소 시 복원한다", () => {
  assert.match(editorSource, /drawConfirmationButtonRef\.current\?\.focus\(\)/u);
  assert.match(editorSource, /drawTriggerRefs\[cancelledBagKind\]\.current\?\.focus\(\)/u);
  assert.match(editorSource, /ref=\{drawConfirmationButtonRef\}/u);
});

test("Finished 화면도 reconnect와 room lifecycle 상태를 live region으로 알린다", () => {
  assert.match(
    finishedSource,
    /className="live-region" aria-live="polite"/u,
  );
  assert.match(finishedSource, /\{props\.connectionLabel\}/u);
});
