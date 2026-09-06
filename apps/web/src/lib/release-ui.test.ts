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
const appSource = readFileSync(
  new URL("../../src/App.tsx", import.meta.url),
  "utf8",
);
const appControllerSource = readFileSync(
  new URL("../../src/app/use-lobby-app.ts", import.meta.url),
  "utf8",
);
const realtimeClientSource = readFileSync(
  new URL("../../src/lib/realtime-client.ts", import.meta.url),
  "utf8",
);
const numberEditorSource = readFileSync(
  new URL(
    "../../src/features/number-tile/NumberTileTurnDraftEditor.tsx",
    import.meta.url,
  ),
  "utf8",
);
const numberPlayingSource = readFileSync(
  new URL(
    "../../src/features/number-tile/NumberTilePlayingScreen.tsx",
    import.meta.url,
  ),
  "utf8",
);
const numberDraftControllerSource = readFileSync(
  new URL(
    "../../src/features/number-tile/use-number-tile-turn-draft.ts",
    import.meta.url,
  ),
  "utf8",
);
const incompatibleSnapshotSource = readFileSync(
  new URL(
    "../../src/features/platform/IncompatibleSnapshotScreen.tsx",
    import.meta.url,
  ),
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

test("320px mobile layout은 document overflow를 강제하지 않고 핵심 touch target을 유지한다", () => {
  assert.match(styles, /html\s*\{[^}]*min-width:\s*0/su);
  assert.match(styles, /body\s*\{[^}]*min-width:\s*0/su);
  assert.match(styles, /@media \(max-width:\s*480px\)/u);
  assert.match(ruleFor("button"), /min-height:\s*48px/u);
  assert.match(ruleFor(".game-option"), /width:\s*100%/u);
  assert.match(ruleFor(".game-option"), /min-width:\s*0/u);
  assert.match(
    styles,
    /\.game-option-heading strong,\s*\.game-option-description\s*\{[^}]*overflow-wrap:\s*anywhere/su,
  );
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
  assert.match(homeSource, /className="game-selection"[\s\S]*role="group"/u);
  assert.match(homeSource, /className=\{`game-option[\s\S]*type="button"/u);
  assert.match(homeSource, /aria-pressed=\{isSelected\}/u);
  assert.match(
    homeSource,
    /onClick=\{\(\) => setSelectedGameType\(game\.gameType\)\}/u,
  );
  assert.match(homeSource, /props\.onCreateRoom\(selectedGameType\)/u);
  assert.doesNotMatch(homeSource, /onCreateRoom\("HANGUL_TILE"\)/u);
});

test("form help와 동적 confirmation은 control에서 접근 가능한 설명으로 연결된다", () => {
  assert.match(homeSource, /aria-describedby="nickname-help"/u);
  assert.match(homeSource, /className="field-help" id="nickname-help"/u);
  assert.match(
    homeSource,
    /role="group"\s+aria-labelledby="game-selection-label"/u,
  );
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

test("P5B legacy pending create는 현재 기본 gameType과 같은 요청으로 그대로 재시도한다", () => {
  assert.match(
    appControllerSource,
    /\(pending\.payload\.gameType \?\? DEFAULT_SELECTED_GAME_TYPE\) === gameType/u,
  );
  assert.match(
    appControllerSource,
    /await executePendingOperation\(pending\);\s*return;/u,
  );
});

test("P7C current Web은 snapshot V2와 구현된 Hangul/Number capability만 광고한다", () => {
  assert.match(
    realtimeClientSource,
    /supportedSnapshotVersions:\s*\[\.\.\.WEB_SUPPORTED_SNAPSHOT_VERSIONS\]/u,
  );
  assert.match(
    realtimeClientSource,
    /supportedGameTypes:\s*\[\.\.\.WEB_SUPPORTED_GAME_TYPES\]/u,
  );
  assert.match(realtimeClientSource, /"number:submit"/u);
  assert.match(realtimeClientSource, /"number:draw"/u);
  assert.match(realtimeClientSource, /"number:pass"/u);
  assert.doesNotMatch(realtimeClientSource, /"number:start"/u);
});

test("Number editor는 keyboard/touch controls와 색상 외 marker를 제공한다", () => {
  assert.match(numberEditorSource, /type="button"/u);
  assert.match(numberEditorSource, /aria-pressed=\{props\.selected\}/u);
  assert.match(numberEditorSource, /className="number-tile-marker"/u);
  assert.match(numberEditorSource, /RED:\s*"R"/u);
  assert.match(numberEditorSource, /BLUE:\s*"B"/u);
  assert.match(numberEditorSource, /BLACK:\s*"K"/u);
  assert.match(numberEditorSource, /ORANGE:\s*"O"/u);
  assert.match(numberEditorSource, /confirmationButtonRef\.current\?\.focus\(\)/u);
  assert.match(numberEditorSource, /drawButtonRef\.current/u);
  assert.match(numberEditorSource, /passButtonRef\.current/u);
  assert.match(numberEditorSource, /"assignedNumber" in props\.tile/u);
  assert.match(numberEditorSource, /props\.tile\.assignedColor/u);
});

test("Number 화면은 display-only 90초 countdown과 authoritative snapshot을 사용한다", () => {
  assert.match(numberPlayingSource, /calculateTurnCountdown/u);
  assert.match(numberPlayingSource, /game\.turn\.deadlineAt/u);
  assert.match(numberPlayingSource, /remainingPoolCount/u);
  assert.match(numberPlayingSource, /game\.privateState\.rack/u);
  assert.doesNotMatch(numberPlayingSource, /TIME_LIMIT|ALL_PLAYERS_FORFEITED/u);
});

test("Number gameplay controls are enabled only for the canonical active player", () => {
  assert.match(
    appSource,
    /const isActivePlayer =\s*props\.snapshot\.game\.turn\.activePlayerId === props\.snapshot\.self\.playerId/u,
  );
  assert.match(
    appSource,
    /canSubmit=\{[\s\S]*commandCapable &&[\s\S]*isActivePlayer &&[\s\S]*!props\.actionPending &&[\s\S]*props\.commandRetryKind === "SUBMIT"[\s\S]*\}/u,
  );
  assert.match(
    appSource,
    /canAct=\{[\s\S]*commandCapable &&[\s\S]*isActivePlayer &&[\s\S]*!props\.submitPending &&[\s\S]*props\.commandRetryKind !== "SUBMIT"[\s\S]*\}/u,
  );
  assert.match(numberEditorSource, /disabled=\{!canDraw\}/u);
  assert.match(numberEditorSource, /disabled=\{!canPass\}/u);
});

test("Number draft is preserved but editor input is locked while authority commands are pending", () => {
  assert.match(
    appSource,
    /const commandCapable =[\s\S]*!props\.operationPending[\s\S]*const editorEnabled =[\s\S]*isActivePlayer[\s\S]*!props\.submitPending[\s\S]*!props\.actionPending[\s\S]*props\.commandRetryKind === null/u,
  );
  assert.match(
    numberDraftControllerSource,
    /canEdit: canEditNumberTileTurnDraft\([\s\S]*currentCommandSession/u,
  );
  assert.match(
    numberEditorSource,
    /!props\.controller\.canEdit && confirmation !== null[\s\S]*setConfirmation\(null\)/u,
  );
  assert.match(numberEditorSource, /fieldset className="joker-assignment" disabled=\{!props\.controller\.canEdit\}/u);
  assert.match(
    appSource,
    /props\.commandRetryKind === null \|\| props\.commandRetryKind === "SUBMIT"/u,
  );
  assert.match(
    numberEditorSource,
    /if \(props\.commandRetryKind === action\)[\s\S]*props\.onDraw\(\)[\s\S]*props\.onPass\(\)[\s\S]*return/u,
  );
  assert.match(
    numberEditorSource,
    /props\.commandRetryKind === null \|\| props\.commandRetryKind === "DRAW"/u,
  );
  assert.match(appControllerSource, /refreshNumberCommandRetryKind\(\)/u);
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

test("unsupported/future/malformed V2는 Lobby나 Hangul renderer 대신 명시적 incompatible 화면으로 차단한다", () => {
  assert.match(
    appControllerSource,
    /decoded\.kind === "INCOMPATIBLE"[\s\S]*markSnapshotIncompatible\(decoded\.reason\)/u,
  );
  assert.match(
    appSource,
    /app\.snapshotIncompatibility !== null[\s\S]*<IncompatibleSnapshotScreen/u,
  );
  assert.match(
    appSource,
    /roomView\.kind === "INCOMPATIBLE"[\s\S]*<IncompatibleSnapshotScreen/u,
  );
  assert.match(incompatibleSnapshotSource, /role="alert"/u);
  assert.match(
    incompatibleSnapshotSource,
    /이 게임 또는 데이터 버전을 현재 클라이언트에서 지원하지/u,
  );
  assert.doesNotMatch(
    incompatibleSnapshotSource,
    /window\.location|window\.history|useEffect/u,
  );
  assert.match(
    appControllerSource,
    /negotiationWasRejected[\s\S]*!negotiationWasRejected[\s\S]*clientRef\.current\.connect\(\)/u,
  );
  assert.match(
    realtimeClientSource,
    /reason: "NEGOTIATION_REJECTED"[\s\S]*#socket\.disconnect\(\)[\s\S]*#setConnectionState\("DISCONNECTED"\)/u,
  );
});
