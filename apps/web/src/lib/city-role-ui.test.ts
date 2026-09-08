import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "valibot";
import {
  CITY_ROLE_IDS, CityPublicBuildingSchema, CityRolePlayingPlatformSnapshotV2Schema,
  CityRoleFinishedPlatformSnapshotV2Schema, RequestIdSchema,
  type CityRoleId,
} from "@hangul-rummikub/shared";
import { CityRolePlayingScreen, type CityRolePlayingScreenProps } from "../features/city-role/CityRolePlayingScreen.js";
import { CityRoleFinishedScreen, type CityRoleFinishedScreenProps } from "../features/city-role/CityRoleFinishedScreen.js";
import {
  CITY_CATEGORY_LABELS, CITY_ROLE_HELP, cityBuildLimit, cityBuildPreview, cityCardLabel,
  cityCurrentHint, cityDestroyPreview, cityFinishReasonLabel, cityRoleLabel, cityTargetRoleOptions,
} from "../features/city-role/city-role-ui.js";
import { citySelectionFixture, cityActionFixture, cityFinishedFixture } from "./city-role-test-fixtures.js";

function playingProps(snapshot = citySelectionFixture()): CityRolePlayingScreenProps {
  return { snapshot, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null,
    sessionReplaced: false, actionPending: false, retryPending: false, actionFeedback: null,
    selectionResetGeneration: 0, roomLeavePending: false, canAct: true,
    onAction() {}, onRetry() {}, onLeaveRoom() {}, onGoHome() {},
  };
}
function renderPlaying(snapshot = citySelectionFixture(), extra: Partial<CityRolePlayingScreenProps> = {}) {
  return renderToStaticMarkup(createElement(CityRolePlayingScreen, { ...playingProps(snapshot), ...extra }));
}
function finishedProps(): CityRoleFinishedScreenProps {
  return { snapshot: cityFinishedFixture(), connectionLabel: "연결됨", connectionTone: "connected",
    errorMessage: null, sessionReplaced: false, actionFeedback: null, actionPending: false, retryPending: false,
    roomLeavePending: false, onRetry() {}, onLeaveRoom() {}, onGoHome() {},
  };
}
function actionForRole(roleId: CityRoleId) {
  const snapshot = cityActionFixture();
  assert.equal(snapshot.game.phase, "ROLE_ACTION");
  if (snapshot.game.phase !== "ROLE_ACTION") throw new Error("Expected action fixture.");
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game,
    window: { ...snapshot.game.window, activeRoleId: roleId },
    revealedRoles: [{ roundNumber: 1, roleId, playerId: snapshot.self.playerId, kind: "NORMAL" }],
    privateState: { ...snapshot.game.privateState, selectedRoleIds: [roleId, roleId === "CR-06" ? "CR-07" : "CR-06"] },
  } });
}
function ownCard(snapshot = cityActionFixture()) {
  const card = snapshot.game.privateState.hand[0];
  assert.ok(card);
  return card;
}
function ownPlayer(snapshot = cityActionFixture()) {
  const player = snapshot.game.playerStates.find(row => row.playerId === snapshot.self.playerId);
  assert.ok(player);
  return player;
}
function targetFixture() {
  const snapshot = actionForRole("CR-08");
  const card = parse(CityPublicBuildingSchema, { cardId: "public-target-card", templateId: "CB-TRA-04", name: "상인회랑", category: "TRADE", cost: 3, victoryPoints: 3 });
  const updated = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game,
    playerStates: snapshot.game.playerStates.map((player, index) => index === 1 ? { ...player, builtBuildings: [card], scorePreview: 3 } : player),
  } });
  const target = updated.game.playerStates[1];
  assert.ok(target);
  return { snapshot: updated, target, card };
}

test("CITY role cards show eight original names, resolution order, and five readable category labels", () => {
  assert.equal(Object.keys(CITY_ROLE_HELP).length, 8);
  for (const [index, roleId] of CITY_ROLE_IDS.entries()) assert.match(cityRoleLabel(roleId), new RegExp(`^${index + 1} · `));
  assert.equal(CITY_ROLE_HELP["CR-01"].name, "가림꾼");
  assert.equal(CITY_ROLE_HELP["CR-08"].name, "해체꾼");
  assert.deepEqual(Object.values(CITY_CATEGORY_LABELS), ["시정", "문화", "교역", "수비", "명소"]);
  assert.match(cityCardLabel(ownCard()), /비표보관소, 시정, 비용 금화 1, 건물 점수 1점/u);
});

test("CITY 2/3-player selection shows two roles and remaining count; 4/5/6-player selection shows one", () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const html = renderPlaying(citySelectionFixture(count));
    assert.match(html, new RegExp(`내 역할 0/${count <= 3 ? 2 : 1}`));
    assert.match(html, new RegExp(`내 선택 ${count <= 3 ? 2 : 1}개 남음`));
    assert.match(html, /내 역할을 고를 차례입니다/u);
    assert.match(html, /00:45/u);
  }
});

test("CITY one selected role does not finish two-role selection and only available cards are offered", () => {
  const initial = citySelectionFixture();
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...initial, game: { ...initial.game,
    privateState: { ...initial.game.privateState, selectedRoleIds: ["CR-08"], availableRoleIds: ["CR-04", "CR-05"] }, publicRemovedRoleIds: ["CR-01"],
  } });
  const html = renderPlaying(snapshot);
  assert.match(html, /내 역할 1\/2/u);
  assert.match(html, /내 선택 1개 남음/u);
  assert.match(html, /8 · 해체꾼/u);
  assert.equal((html.match(/이 역할 선택/gu) ?? []).length, 2);
  assert.match(html, /공개 제외 역할: 1 · 가림꾼/u);
});

test("CITY observer selection never renders available roles or exact opponent hands", () => {
  const snapshot = citySelectionFixture();
  const other = snapshot.game.playerStates[1];
  assert.ok(other);
  const visible = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, self: { playerId: other.playerId }, game: { ...snapshot.game,
    playerStates: snapshot.game.playerStates.map(player => player.playerId === other.playerId ? { ...player, handCount: 0 } : player),
    privateState: { hand: [], selectedRoleIds: [], marks: [] },
  } });
  const html = renderPlaying(visible);
  assert.doesNotMatch(html, /이 역할 선택|비표보관소|city-own-card/u);
  assert.match(html, /내 선택 차례가 되면/u);
  assert.match(html, /금화 2 · 손패 1장/u);
});

test("P16 six-player completed secret choice explains waiting, not a second selection", () => {
  const initial = citySelectionFixture(6);
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...initial, game: { ...initial.game,
    window: { ...initial.game.window, activePlayerId: "P1" },
    privateState: { hand: initial.game.privateState.hand, selectedRoleIds: ["CR-08"], marks: [] },
  } });
  const html = renderPlaying(snapshot, { canAct: false });
  assert.match(html, /이번 라운드의 역할 선택을 마쳤습니다/u);
  assert.match(html, /내 선택 0개 남음/u);
  assert.doesNotMatch(html, /내 선택 차례가 되면|이 역할 선택/u);
});

test("P16 two-role player still waiting for the second pick is not marked selection-complete", () => {
  const initial = citySelectionFixture(3);
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...initial, game: { ...initial.game,
    window: { ...initial.game.window, activePlayerId: "P1" },
    privateState: { hand: initial.game.privateState.hand, selectedRoleIds: ["CR-08"], marks: [] },
  } });
  const html = renderPlaying(snapshot, { canAct: false });
  assert.match(html, /내 선택 1개 남음/u);
  assert.match(html, /내 선택 차례가 되면/u);
  assert.doesNotMatch(html, /이번 라운드의 역할 선택을 마쳤습니다/u);
});

test("CITY action layout exposes current role, actor, 90-second display, gold, city and private hand", () => {
  const html = renderPlaying(cityActionFixture());
  assert.match(html, /내 차례입니다/u);
  assert.match(html, /3 · 교환꾼/u);
  assert.match(html, /01:30/u);
  assert.match(html, /내 금화/u);
  assert.match(html, /도시 0\/8/u);
  assert.match(html, /내 건물 카드 · 1장/u);
  assert.match(html, /기본 획득 완료/u);
  assert.match(html, /건설 0\/1/u);
  assert.doesNotMatch(html, /Rack|랙|storageRevision|entropySeed|sessionToken/u);
});

test("CITY ten-second warning and expired display preserve the canonical deadline", () => {
  const snapshot = cityActionFixture();
  const urgent = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, serverTime: snapshot.game.window.deadlineAt - 9000 });
  const html = renderPlaying(urgent);
  assert.match(html, /city-turn-hud is-mine is-urgent/u);
  assert.match(html, /00:09/u);
  assert.equal(urgent.game.window.deadlineAt, snapshot.game.window.deadlineAt);
  const expired = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, serverTime: snapshot.game.window.deadlineAt });
  assert.match(renderPlaying(expired), /00:00/u);
  assert.match(renderPlaying(expired), /서버에서 시간 종료 결과를 확인/u);
  assert.match(renderPlaying(expired), /disabled=""[^>]*>역할 차례 마치기/u);
});

test("CITY basic acquisition before completion offers two concrete mutually exclusive actions", () => {
  const snapshot = cityActionFixture();
  if (snapshot.game.phase !== "ROLE_ACTION") throw new Error("Expected action fixture.");
  const visible = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game,
    privateState: { ...snapshot.game.privateState, action: { acquisition: "NOT_TAKEN", abilityUsed: false, buildingsBuilt: 0 } },
  } });
  const html = renderPlaying(visible);
  assert.match(html, /금화 2 받기/u);
  assert.match(html, /건물 카드 보기/u);
  assert.match(html, /disabled=""[^>]*>역할 차례 마치기/u);
  assert.equal(cityBuildPreview(visible.game, visible.self.playerId, ownCard(visible)).allowed, false);
});

test("CITY pending draw renders owner-only choices and blocks abilities/build/end without extending time", () => {
  const snapshot = cityActionFixture(true);
  const html = renderPlaying(snapshot);
  assert.match(html, /카드 1장을 선택하세요/u);
  assert.equal((html.match(/이 카드 가져오기/gu) ?? []).length, 2);
  assert.match(html, /선택 중에도 행동 시간은 계속 흐릅니다/u);
  assert.match(html, /01:30/u);
  assert.match(html, /disabled=""[^>]*>역할 차례 마치기/u);
  assert.equal(cityBuildPreview(snapshot.game, snapshot.self.playerId, ownCard(snapshot)).allowed, false);
  assert.match(cityCurrentHint(snapshot.game, snapshot.self.playerId), /카드 1장/u);
});

test("CITY pending private choices are stable under same-state refresh and presence-only projection", () => {
  const snapshot = cityActionFixture(true);
  const before = renderPlaying(snapshot);
  const reconnected = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot,
    versions: { ...snapshot.versions, presenceVersion: 1 },
    room: { ...snapshot.room, players: snapshot.room.players.map((player, index) => index === 1 ? { ...player, connectionStatus: "OFFLINE" } : player) },
  });
  assert.deepEqual(reconnected.game.privateState, snapshot.game.privateState);
  assert.deepEqual(reconnected.game.window, snapshot.game.window);
  assert.equal((renderPlaying(reconnected).match(/이 카드 가져오기/gu) ?? []).length, 2);
  assert.equal((before.match(/이 카드 가져오기/gu) ?? []).length, 2);
});

test("CITY CR01/CR02 target choices use higher role identities without hidden-state filters", () => {
  assert.deepEqual(cityTargetRoleOptions("CR-01"), CITY_ROLE_IDS.slice(1));
  assert.deepEqual(cityTargetRoleOptions("CR-02"), CITY_ROLE_IDS.slice(2));
  assert.deepEqual(cityTargetRoleOptions("CR-08"), []);
  for (const roleId of ["CR-01", "CR-02"] as const) {
    const html = renderPlaying(actionForRole(roleId));
    assert.match(html, /비밀 역할 지목/u);
    assert.match(html, /표적은 나에게만 보입니다/u);
    assert.match(html, /8 · 해체꾼/u);
    assert.match(html, /선택한 역할 지목/u);
  }
});

test("CITY CR03 exposes separate whole-hand and own-card exchange with zero-card guard", () => {
  const html = renderPlaying(actionForRole("CR-03"));
  assert.match(html, /손패 전체 교환/u);
  assert.match(html, /내 카드 교체/u);
  assert.match(html, /도시1 · 손패 4장/u);
  const source = readFileSync(new URL("../../src/features/city-role/CityRolePlayingScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /disabled=\{disabled \|\| replacementIds\.length === 0\}/u);
  assert.match(source, /if \(disabled \|\| replacementIds\.length === 0\) return/u);
  assert.match(source, /cardIds: \[\.\.\.replacementIds\]/u);
});

test("CITY mandatory CR04/05/06/07 entry effects are informational, not client mutations", () => {
  for (const roleId of ["CR-04", "CR-05", "CR-06", "CR-07"] as const) {
    const html = renderPlaying(actionForRole(roleId));
    assert.match(html, /자동 효과/u);
    assert.match(html, /시작 효과는 서버가 반영했습니다/u);
    assert.match(html, new RegExp(CITY_ROLE_HELP[roleId].name));
  }
  assert.match(renderPlaying(actionForRole("CR-07")), /건설 0\/3/u);
  assert.equal(cityBuildLimit("CR-07"), 3);
  assert.equal(cityBuildLimit("CR-04"), 1);
});

test("CITY CR08 presents public building cost-minus-one destruction targets", () => {
  const { snapshot, target, card } = targetFixture();
  assert.deepEqual(cityDestroyPreview(snapshot.game, snapshot.self.playerId, target, card), { allowed: true, cost: 2, message: "파괴 비용 금화 2" });
  const html = renderPlaying(snapshot);
  assert.match(html, /해체꾼 · 건물 파괴/u);
  assert.match(html, /상인회랑/u);
  assert.match(html, /파괴 비용 금화 2/u);
});

test("CITY destruction rejects own/frozen/completed/protected cities and insufficient gold", () => {
  const { snapshot, target, card } = targetFixture();
  const game = snapshot.game;
  assert.equal(cityDestroyPreview(game, snapshot.self.playerId, { ...target, playerId: snapshot.self.playerId }, card).allowed, false);
  assert.match(cityDestroyPreview(game, snapshot.self.playerId, { ...target, forfeited: true }, card).message, /기권/u);
  assert.match(cityDestroyPreview(game, snapshot.self.playerId, { ...target, builtBuildings: Array.from({ length: 8 }, () => card) }, card).message, /8개/u);
  assert.match(cityDestroyPreview({ ...game, protectedPlayerIds: [target.playerId] }, snapshot.self.playerId, target, card).message, /보호/u);
  const poor = { ...game, playerStates: game.playerStates.map(player => player.playerId === snapshot.self.playerId ? { ...player, gold: 0 } : player) };
  assert.match(cityDestroyPreview(poor, snapshot.self.playerId, target, card).message, /금화 2 부족/u);
});

test("CITY build preview requires actual own physical card, affordability and unique template", () => {
  const snapshot = cityActionFixture(), game = snapshot.game, card = ownCard(snapshot);
  const before = JSON.stringify(snapshot);
  assert.equal(cityBuildPreview(game, snapshot.self.playerId, card).allowed, true);
  assert.match(cityBuildPreview(game, snapshot.self.playerId, { ...card, cardId: parse(CityPublicBuildingSchema, { ...card, cardId: "foreign" }).cardId }).message, /내 손패/u);
  const poor = { ...game, playerStates: game.playerStates.map(player => player.playerId === snapshot.self.playerId ? { ...player, gold: 0 } : player) };
  assert.equal(cityBuildPreview(poor, snapshot.self.playerId, card).missingGold, 1);
  const duplicate = { ...game, playerStates: game.playerStates.map(player => player.playerId === snapshot.self.playerId ? { ...player, builtBuildings: [card] } : player) };
  assert.match(cityBuildPreview(duplicate, snapshot.self.playerId, card).message, /두 번/u);
  assert.equal(JSON.stringify(snapshot), before);
});

test("CITY build limit, pending choice, selection phase and forfeit keep build disabled", () => {
  const snapshot = cityActionFixture();
  if (snapshot.game.phase !== "ROLE_ACTION" || snapshot.game.privateState.action === undefined) throw new Error("Expected action.");
  const exhausted = { ...snapshot.game, privateState: { ...snapshot.game.privateState, action: { ...snapshot.game.privateState.action, buildingsBuilt: 1 } } };
  assert.match(cityBuildPreview(exhausted, snapshot.self.playerId, ownCard(snapshot)).message, /한도/u);
  const architect = actionForRole("CR-07");
  if (architect.game.phase !== "ROLE_ACTION" || architect.game.privateState.action === undefined) throw new Error("Expected action.");
  assert.equal(cityBuildPreview({ ...architect.game, privateState: { ...architect.game.privateState, action: { ...architect.game.privateState.action, buildingsBuilt: 2 } } }, architect.self.playerId, ownCard(architect)).allowed, true);
  const selection = citySelectionFixture();
  assert.equal(cityBuildPreview(selection.game, selection.self.playerId, ownCard(selection)).allowed, false);
  const frozen = { ...snapshot.game, playerStates: snapshot.game.playerStates.map(player => ({ ...player, forfeited: true })) };
  assert.equal(cityBuildPreview(frozen, snapshot.self.playerId, ownCard(snapshot)).allowed, false);
});

test("CITY same-template physical hand copies remain distinct without hidden opponent identities", () => {
  const snapshot = cityActionFixture();
  const duplicate = parse(CityPublicBuildingSchema, { ...ownCard(snapshot), cardId: "my-second-copy" });
  const updated = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game,
    privateState: { ...snapshot.game.privateState, hand: [...snapshot.game.privateState.hand, duplicate] },
    playerStates: snapshot.game.playerStates.map(player => player.playerId === snapshot.self.playerId ? { ...player, handCount: 2 } : player),
  } });
  assert.equal(updated.game.privateState.hand.length, 2);
  assert.match(renderPlaying(updated), /내 건물 카드 · 2장/u);
  assert.equal((renderPlaying(updated).match(/비표보관소<\/strong>/gu) ?? []).length, 2);
  assert.notEqual(updated.game.privateState.hand[0]?.cardId, updated.game.privateState.hand[1]?.cardId);
});

test("CITY opponent action hides active player's private controls, targets and pending cards", () => {
  const snapshot = cityActionFixture(true);
  const other = snapshot.game.playerStates[1];
  assert.ok(other);
  const visible = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, self: { playerId: other.playerId }, game: { ...snapshot.game,
    playerStates: snapshot.game.playerStates.map(player => player.playerId === other.playerId ? { ...player, handCount: 0 } : player),
    privateState: { hand: [], selectedRoleIds: ["CR-04", "CR-08"], marks: [] },
  } });
  const html = renderPlaying(visible, { canAct: false });
  assert.match(html, /도시0님의 차례입니다/u);
  assert.doesNotMatch(html, /이 카드 가져오기|손패 교환하기|역할 차례 마치기|선택한 역할 지목/u);
});

test("CITY action receipt retry stays reachable after the active actor changes", () => {
  const html = renderPlaying(cityActionFixture(), { canAct: false, retryPending: true });
  assert.match(html, /<button[^>]*>행동 결과 다시 확인<\/button>/u);
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>행동 결과 다시 확인/u);
  assert.match(html, /disabled=""[^>]*>방 나가기/u);
});

test("CITY offline/replaced/pending screens disable gameplay and do not invent canonical success", () => {
  for (const extra of [{ canAct: false }, { sessionReplaced: true }, { actionPending: true }, { retryPending: true }]) {
    const html = renderPlaying(citySelectionFixture(), extra);
    assert.match(html, /class="city-role-card"[^>]*disabled=""/u);
    assert.doesNotMatch(html, /city-action-feedback/u);
  }
  assert.match(renderPlaying(cityActionFixture(), { sessionReplaced: true }), /다른 창에서 연결되었습니다/u);
});

test("CITY accepted feedback displays server-confirmed message; rejection has no success message", () => {
  const feedback = { requestId: parse(RequestIdSchema, "city-ui-ack"), kind: "city:build" as const, message: "건물을 건설했습니다." };
  assert.match(renderPlaying(cityActionFixture(), { actionFeedback: feedback }), /건물을 건설했습니다/u);
  const rejected = renderPlaying(cityActionFixture(), { errorMessage: "해당 행동은 지금 할 수 없습니다." });
  assert.match(rejected, /role="alert"/u);
  assert.doesNotMatch(rejected, /건물을 건설했습니다/u);
});

test("CITY final-round latch and public-only role history remain explicit", () => {
  const snapshot = cityActionFixture();
  const marked = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game,
    firstCompletion: { playerId: snapshot.self.playerId, roundNumber: 1 },
  } });
  const html = renderPlaying(marked);
  assert.match(html, /마지막 라운드 진행 중/u);
  assert.match(html, /공개된 역할: 3 · 교환꾼/u);
  assert.equal((html.match(/공개된 역할:/gu) ?? []).length, 1);
});

test("CITY contextual guidance distinguishes selection, acquisition, pending, action, observer and forfeit", () => {
  const selection = citySelectionFixture(), action = cityActionFixture(), pending = cityActionFixture(true);
  assert.match(cityCurrentHint(selection.game, selection.self.playerId), /역할을 하나/u);
  assert.match(cityCurrentHint(pending.game, pending.self.playerId), /카드 1장/u);
  assert.match(cityCurrentHint(action.game, action.self.playerId), /원한다면 건설/u);
  const other = action.game.playerStates[1];
  assert.ok(other);
  assert.match(cityCurrentHint(action.game, other.playerId), /다른 참가자/u);
  assert.match(cityCurrentHint({ ...action.game, playerStates: [ { ...ownPlayer(action), forfeited: true }, other ] }, action.self.playerId), /기권/u);
});

test("CITY finished screen shows authoritative rank, component score, public city and private self-only details", () => {
  const props = finishedProps();
  const html = renderToStaticMarkup(createElement(CityRoleFinishedScreen, props));
  assert.match(html, /마지막 남은 참가자/u);
  assert.match(html, /1위 · 우승/u);
  assert.match(html, /완성 보너스/u);
  assert.match(html, /다양성 보너스/u);
  assert.match(html, /다른 참가자의 손패와 비밀 역할은 게임이 끝나도 공개하지 않습니다/u);
  assert.match(html, /기권/u);
  assert.doesNotMatch(html, /역할 차례 마치기|이 카드 가져오기/u);
});

test("CITY finished terminal pending choice remains private and has no post-terminal choice action", () => {
  const props = finishedProps();
  const pendingCard = parse(CityPublicBuildingSchema, { ...ownCard(), cardId: "frozen-pending-card" });
  const snapshot = parse(CityRoleFinishedPlatformSnapshotV2Schema, { ...props.snapshot, game: { ...props.snapshot.game,
    privateState: { ...props.snapshot.game.privateState, pendingCards: [pendingCard] },
  } });
  const html = renderToStaticMarkup(createElement(CityRoleFinishedScreen, { ...props, snapshot }));
  assert.match(html, /종료 시 선택 대기 중이던 카드/u);
  assert.doesNotMatch(html, /이 카드 가져오기/u);
});

test("CITY shared-winner Finished preserves competition ranks and server bonus components", () => {
  const props = finishedProps(), base = props.snapshot;
  const cityTemplates = [
    ["CB-CIV-01", "비표보관소", "CIVIC", 1], ["CB-CIV-02", "공론마당", "CIVIC", 2],
    ["CB-CIV-03", "길안내소", "CIVIC", 2], ["CB-CIV-04", "협의뜰", "CIVIC", 3],
    ["CB-CIV-05", "우편회랑", "CIVIC", 4], ["CB-CIV-06", "수평의사당", "CIVIC", 6],
    ["CB-CUL-01", "종이공방", "CULTURE", 1], ["CB-CUL-02", "낭독쉼터", "CULTURE", 1],
  ] as const;
  const players = base.game.playerStates.map((player, index) => {
    const buildings = cityTemplates.map(([templateId, name, category, cost], cardIndex) => parse(CityPublicBuildingSchema, {
      cardId: `result-city-${index}-${cardIndex}`, templateId, name, category, cost, victoryPoints: cost,
      ...(index === 1 && cardIndex === 7 ? { templateId: "CB-CUL-03", name: "노래뜰", cost: 3, victoryPoints: 3 } : {}),
    }));
    return { ...player, forfeited: false, handCount: 0, builtBuildings: buildings, scorePreview: buildings.reduce((sum, card) => sum + card.victoryPoints, 0) };
  });
  const snapshot = parse(CityRoleFinishedPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    playerStates: players, firstCompletion: { playerId: base.self.playerId, roundNumber: 1 },
    privateState: { hand: [], selectedRoleIds: [], marks: [] },
    result: { reason: "CITY_COMPLETION_ROUND_END", finishedAt: 5000, winnerPlayerIds: players.map(player => player.playerId),
      rankings: players.map((player, index) => ({ playerId: player.playerId, rank: 1, score: 24, buildingVP: player.scorePreview,
        completionBonus: index === 0 ? 4 : 2, diversityBonus: 0, buildingCount: 8, forfeited: false, winner: true })),
    },
  } });
  const html = renderToStaticMarkup(createElement(CityRoleFinishedScreen, { ...props, snapshot }));
  assert.match(html, /공동 우승/u);
  assert.equal((html.match(/1위 · 우승/gu) ?? []).length, 2);
  assert.match(html, /<dd>\+4<\/dd>/u);
  assert.match(html, /<dd>\+2<\/dd>/u);
});

test("CITY lost terminal ACK exposes retry in Finished and prevents leaving before receipt resolution", () => {
  const html = renderToStaticMarkup(createElement(CityRoleFinishedScreen, { ...finishedProps(), retryPending: true }));
  assert.match(html, /이전 행동 결과 다시 확인/u);
  assert.doesNotMatch(html, /disabled=""[^>]*>이전 행동 결과 다시 확인/u);
  assert.match(html, /disabled=""[^>]*>방 나가기/u);
  const offline = renderToStaticMarkup(createElement(CityRoleFinishedScreen, { ...finishedProps(), retryPending: true, connectionTone: "offline" }));
  assert.match(offline, /disabled=""[^>]*>이전 행동 결과 다시 확인/u);
});

test("CITY finished reasons include no eligible players without an invented winner", () => {
  assert.equal(cityFinishReasonLabel("CITY_COMPLETION_ROUND_END"), "도시 완성 · 마지막 라운드 종료");
  assert.equal(cityFinishReasonLabel("NO_ELIGIBLE_PLAYERS"), "모든 참가자의 게임 종료");
  const props = finishedProps(), base = props.snapshot;
  const snapshot = parse(CityRoleFinishedPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    playerStates: base.game.playerStates.map(player => ({ ...player, forfeited: true, gold: 0, handCount: 0 })),
    privateState: { hand: [], selectedRoleIds: [], marks: [] },
    result: { ...base.game.result, reason: "NO_ELIGIBLE_PLAYERS", winnerPlayerIds: [], rankings: base.game.result.rankings.map(row => ({ ...row, rank: 1, forfeited: true, winner: false })) },
  } });
  assert.match(renderToStaticMarkup(createElement(CityRoleFinishedScreen, { ...props, snapshot })), /우승자 없이 종료/u);
});

test("CITY scoped responsive CSS keeps tap targets, wrapping hand/cities and persistent mobile timer", () => {
  const css = readFileSync(new URL("../../src/features/city-role/city-role.css", import.meta.url), "utf8");
  assert.match(css, /min-height: 44px/u);
  assert.match(css, /touch-action: manipulation/u);
  assert.match(css, /@media \(max-width: 767px\)/u);
  assert.match(css, /@media \(max-width: 359px\)/u);
  assert.match(css, /position: sticky; top: env\(safe-area-inset-top/u);
  assert.match(css, /minmax\(0, 1fr\)/u);
  assert.match(css, /focus-visible/u);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)|min-width:\s*[3-9][0-9]{2}px/u);
  assert.doesNotMatch(css, /\.gem-|\.number-|\.hangul-/u);
});

test("CITY transient selections reset on canonical identity, not presence, and issue only concrete actions", () => {
  const source = readFileSync(new URL("../../src/features/city-role/CityRolePlayingScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /\[game.gameId, game.gameRevision, game.window.actionId, props.selectionResetGeneration, props.sessionReplaced\]/u);
  assert.match(source, /<CityRoleAbility key=\{uiIdentity\}/u);
  for (const kind of ["selectRole", "takeIncome", "drawBuildingCards", "chooseBuildingCard", "useRoleAbility", "build", "endTurn"]) assert.ok(source.includes(`kind: "city:${kind}"`));
  assert.doesNotMatch(source, /game:command|apps\/server|localStorage.*(?:hand|gold|roleId)|setGame\(/u);
});
