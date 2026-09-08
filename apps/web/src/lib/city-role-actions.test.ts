import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { CityActionWireAckSchema, RequestIdSchema, validateCityClientCommand } from "@hangul-rummikub/shared";
import { createCityCommand, cityReceiptMatches, cityActionFeedback, cityErrorMessage, type CityActionIntent } from "../features/city-role/city-role-actions.js";
import { cityActionFixture, citySelectionFixture } from "./city-role-test-fixtures.js";

const id = () => parse(RequestIdSchema, "city-web-request");

test("CITY Web seven closed commands preserve current game/action/revision and only intent payload", () => {
  const snapshot = cityActionFixture(), cardId = snapshot.game.privateState.hand[0]!.cardId;
  const intents: CityActionIntent[] = [
    { kind: "city:selectRole", payload: { roleId: "CR-01" } }, { kind: "city:takeIncome", payload: {} },
    { kind: "city:drawBuildingCards", payload: {} }, { kind: "city:chooseBuildingCard", payload: { cardId } },
    { kind: "city:useRoleAbility", payload: { ability: "REPLACE_OWN_CARDS", cardIds: [cardId] } },
    { kind: "city:build", payload: { cardId } }, { kind: "city:endTurn", payload: {} },
  ];
  for (const intent of intents) {
    const command = createCityCommand(intent, snapshot, id);
    assert.equal(validateCityClientCommand(command).ok, true);
    assert.equal(command.gameId, snapshot.game.gameId);
    assert.equal(command.actionId, snapshot.game.window.actionId);
    assert.equal(command.expectedGameRevision, snapshot.game.gameRevision);
    assert.equal(command.requestId, id());
    assert.deepEqual(Object.keys(command).sort(), ["actionId", "expectedGameRevision", "gameId", "kind", "payload", "protocolVersion", "requestId"]);
    assert.equal(Object.isFrozen(command), true);
  }
});

test("CITY retry command detaches replacement physical IDs and keeps request identity", () => {
  const snapshot = cityActionFixture(), cardIds = snapshot.game.privateState.hand.map(card => card.cardId);
  const before = structuredClone(snapshot);
  const command = createCityCommand({ kind: "city:useRoleAbility", payload: { ability: "REPLACE_OWN_CARDS", cardIds } }, snapshot, id);
  cardIds.length = 0;
  assert.equal(command.kind, "city:useRoleAbility");
  if (command.kind !== "city:useRoleAbility" || command.payload.ability !== "REPLACE_OWN_CARDS") throw new Error("Unexpected intent");
  assert.deepEqual(command.payload.cardIds, before.game.privateState.hand.map(card => card.cardId));
  assert.equal(Object.isFrozen(command.payload.cardIds), true);
  assert.deepEqual(snapshot, before);
});

test("CITY E03 empty exchange cannot create a Web command", () => {
  assert.throws(() => createCityCommand({ kind: "city:useRoleAbility", payload: { ability: "REPLACE_OWN_CARDS", cardIds: [] } }, cityActionFixture(), id));
});

test("CITY selection and action windows use their own actual identity, never player role as turn", () => {
  const selection = citySelectionFixture(2), action = cityActionFixture();
  const first = createCityCommand({ kind: "city:selectRole", payload: { roleId: "CR-01" } }, selection, id);
  const second = createCityCommand({ kind: "city:takeIncome", payload: {} }, action, id);
  assert.notEqual(first.actionId, second.actionId);
  assert.equal(first.actionId, selection.game.window.actionId);
  assert.equal(second.actionId, action.game.window.actionId);
});

function receipt(gameId = "city-web-game", committedGameRevision = 1, current = 1) {
  return parse(CityActionWireAckSchema, { scope: "ROOM", requestId: id(), ok: true, serverTime: 1000,
    versions: { roomRevision: 0, presenceVersion: 0, gameRevision: current }, data: { gameId, committedGameRevision } });
}
test("CITY minimal receipt validates exact game and committed revision while accepting newer live shell", () => {
  const command = createCityCommand({ kind: "city:takeIncome", payload: {} }, cityActionFixture(), id);
  assert.equal(cityReceiptMatches(command, receipt()), true);
  assert.equal(cityReceiptMatches(command, receipt("city-web-game", 1, 7)), true);
  assert.equal(cityReceiptMatches(command, receipt("other-game")), false);
  assert.equal(cityReceiptMatches(command, receipt("city-web-game", 2)), false);
  assert.equal(cityReceiptMatches(command, receipt("city-web-game", 1, 0)), false);
});

test("CITY success feedback is request-exact once and caller owns its lifetime", () => {
  const seen = new Set<ReturnType<typeof id>>(), command = createCityCommand({ kind: "city:build", payload: { cardId: cityActionFixture().game.privateState.hand[0]!.cardId } }, cityActionFixture(), id);
  assert.equal(cityActionFeedback(command, seen)?.message, "건물을 건설했습니다.");
  assert.equal(cityActionFeedback(command, seen), null);
  assert.equal(seen.size, 1);
  assert.ok(cityActionFeedback(command, new Set()));
});

test("CITY private draw command does not place cards optimistically in the hand", () => {
  const snapshot = cityActionFixture(), before = structuredClone(snapshot);
  const command = createCityCommand({ kind: "city:drawBuildingCards", payload: {} }, snapshot, id);
  assert.deepEqual(command.payload, {});
  assert.deepEqual(snapshot, before);
});

test("CITY rejection wording does not imply GEM purchase/reserve or expose private card ownership", () => {
  assert.equal(cityErrorMessage("CARD_NOT_AVAILABLE").includes("구매"), false);
  assert.equal(cityErrorMessage("CARD_NOT_AVAILABLE").includes("상대"), false);
  assert.match(cityErrorMessage("RULE_VIOLATION"), /획득·선택·건설/);
  assert.match(cityErrorMessage("NOT_YOUR_TURN"), /내 차례/);
});
