import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CITY_BUILDING_TEMPLATES,
  CITY_CARDSET_VERSION,
  CITY_CATEGORIES,
  createCityCards,
  getCityTemplate,
  validateCityCards,
  type BuildingTemplateId,
  type CityBuildingCard,
} from "./games/city-role/domain/cardset-v1.js";
import {
  parseBuildingCardId,
  parseCityActionId,
  parseCityGameId,
  parseCityPlayerId,
} from "./games/city-role/domain/identity.js";
import {
  CITY_ACTION_SECONDS,
  CITY_ROLE_IDS,
  CITY_ROLES,
  CITY_ROLESET_VERSION,
  CITY_RULES_VERSION,
  CITY_SELECTION_SECONDS,
  cityRoleOrder,
  isCityRoleId,
} from "./games/city-role/domain/role.js";

function suppliedCardIds() {
  return Array.from({ length: 60 }, (_, index) => parseBuildingCardId(`opaque-fixture-${index}`));
}

test("CITY local identifier parsers preserve caller values and reject malformed identities", () => {
  for (const parse of [parseCityPlayerId, parseCityGameId, parseCityActionId, parseBuildingCardId]) {
    assert.equal(parse("caller-supplied-identity"), "caller-supplied-identity");
    assert.equal(parse("x".repeat(128)), "x".repeat(128));
    for (const malformed of ["", "x".repeat(129), 1, null, undefined, {}, []]) {
      assert.throws(() => parse(malformed));
    }
  }
});

test("CITY cardset exactly matches the user-approved 30 Markdown rows and 60 design slots", () => {
  const document = readFileSync(new URL("../../../docs/CITY_ROLE_CARDSET_V1.md", import.meta.url), "utf8");
  const rows = document.split("\n").filter((line) => line.startsWith("| CB-"));
  const expected = rows.map((line) => {
    const [templateId, name, category, cost, victoryPoints, copies, slots] = line
      .split("|").slice(1, -1).map((cell) => cell.trim());
    assert.ok(templateId && name && category && cost && victoryPoints && copies && slots);
    return { templateId, name, category, cost: Number(cost), victoryPoints: Number(victoryPoints), copies: Number(copies) };
  });
  const slots = rows.flatMap((line) => line.match(/CCS-\d{3}/g) ?? []);
  assert.equal(rows.length, 30);
  assert.deepEqual(CITY_BUILDING_TEMPLATES, expected);
  assert.equal(new Set(slots).size, 60);
  assert.deepEqual(slots, Array.from({ length: 60 }, (_, index) => `CCS-${String(index + 1).padStart(3, "0")}`));
});

test("CITY approved cardset statistics remain 5 categories x 12 cards and 180 printed VP", () => {
  assert.deepEqual(CITY_CATEGORIES, ["CIVIC", "CULTURE", "TRADE", "GUARD", "LANDMARK"]);
  assert.equal(CITY_BUILDING_TEMPLATES.length, 30);
  assert.equal(new Set(CITY_BUILDING_TEMPLATES.map((template) => template.templateId)).size, 30);
  assert.equal(new Set(CITY_BUILDING_TEMPLATES.map((template) => template.name)).size, 30);
  for (const category of CITY_CATEGORIES) {
    const templates = CITY_BUILDING_TEMPLATES.filter((template) => template.category === category);
    assert.equal(templates.length, 6);
    assert.equal(templates.reduce((total, template) => total + template.copies, 0), 12);
    assert.equal(templates.reduce((total, template) => total + template.victoryPoints * template.copies, 0), 36);
  }
  const costCounts = Array.from({ length: 6 }, (_, index) => CITY_BUILDING_TEMPLATES
    .filter((template) => template.cost === index + 1)
    .reduce((count, template) => count + template.copies, 0));
  assert.deepEqual(costCounts, [12, 14, 10, 12, 10, 2]);
  assert.equal(CITY_BUILDING_TEMPLATES.reduce((sum, template) => sum + template.victoryPoints * template.copies, 0), 180);
  for (const template of CITY_BUILDING_TEMPLATES) {
    assert.equal(template.cost, template.victoryPoints);
    assert.ok(Number.isInteger(template.cost) && template.cost >= 1 && template.cost <= 6);
    assert.deepEqual(Object.keys(template).sort(), ["category", "copies", "cost", "name", "templateId", "victoryPoints"]);
  }
});

test("CITY approved catalog is deeply immutable and template lookup retains canonical values", () => {
  assert.equal(Object.isFrozen(CITY_CATEGORIES), true);
  assert.equal(Object.isFrozen(CITY_BUILDING_TEMPLATES), true);
  for (const template of CITY_BUILDING_TEMPLATES) {
    assert.equal(Object.isFrozen(template), true);
    assert.equal(getCityTemplate(template.templateId), template);
  }
  assert.throws(() => getCityTemplate("CB-FORGED-01" as BuildingTemplateId));
});

test("CITY physical cards bind exactly supplied identities without using design slot identifiers", () => {
  const cardIds = suppliedCardIds();
  const before = [...cardIds];
  const cards = createCityCards(cardIds);
  assert.equal(cards.length, 60);
  assert.deepEqual(cardIds, before);
  assert.deepEqual(cards.map((card) => card.cardId), before);
  assert.equal(new Set(cards.map((card) => card.cardId)).size, 60);
  for (const [index, card] of cards.entries()) {
    assert.equal(card.templateId, CITY_BUILDING_TEMPLATES[Math.floor(index / 2)]?.templateId);
    assert.equal(card.cardId.startsWith("CCS-"), false);
    assert.deepEqual(Object.keys(card).sort(), ["cardId", "templateId"]);
    assert.equal(Object.isFrozen(card), true);
  }
  assert.equal(Object.isFrozen(cards), true);
  cardIds[0] = parseBuildingCardId("changed-only-in-caller");
  assert.equal(cards[0]?.cardId, before[0]);
});

test("CITY card creation rejects missing, extra, and duplicate supplied physical IDs", () => {
  const cardIds = suppliedCardIds();
  assert.throws(() => createCityCards(cardIds.slice(1)));
  assert.throws(() => createCityCards([...cardIds, parseBuildingCardId("extra-physical-card")]));
  const firstId = cardIds[0];
  assert.ok(firstId);
  assert.throws(() => createCityCards(cardIds.map((cardId, index) => index === 1 ? firstId : cardId)));
});

test("CITY inventory validation is detached, pure, and insensitive to inventory ordering", () => {
  const source = [...createCityCards(suppliedCardIds())].reverse().map((card) => ({ ...card }));
  const before = structuredClone(source);
  const validated = validateCityCards(source);
  assert.deepEqual(source, before);
  assert.deepEqual(validated, source);
  assert.notEqual(validated, source);
  assert.equal(Object.isFrozen(validated), true);
  for (const [index, card] of validated.entries()) {
    assert.notEqual(card, source[index]);
    assert.equal(Object.isFrozen(card), true);
  }
  const first = source[0];
  assert.ok(first);
  first.cardId = parseBuildingCardId("different-after-validation");
  assert.deepEqual(validated, before);
});

test("CITY complete inventory validation rejects missing cards, duplicate IDs, and wrong template counts", () => {
  const cards = createCityCards(suppliedCardIds());
  const first = cards[0];
  assert.ok(first);
  assert.throws(() => validateCityCards(cards.slice(1)));
  assert.throws(() => validateCityCards([...cards, first]));
  assert.throws(() => validateCityCards(cards.map((card, index) => index === 2 ? { ...card, cardId: first.cardId } : card)));
  assert.throws(() => validateCityCards(cards.map((card, index) => index === 2 ? { ...card, templateId: first.templateId } : card)));
});

test("CITY inventory rejects forged template IDs and malformed physical IDs at runtime", () => {
  const cards = createCityCards(suppliedCardIds());
  const first = cards[0];
  assert.ok(first);
  const badTemplate: CityBuildingCard = { ...first, templateId: "CB-FORGED-01" as BuildingTemplateId };
  assert.throws(() => validateCityCards(cards.map((card, index) => index === 0 ? badTemplate : card)));
  const malformed = { ...first };
  Object.defineProperty(malformed, "cardId", { value: "" });
  assert.throws(() => validateCityCards(cards.map((card, index) => index === 0 ? malformed : card)));
});

test("CITY physical card representation never trusts caller-printed cost, score, category, or ability", () => {
  const source = createCityCards(suppliedCardIds()).map((card) => ({
    ...card, cost: 99, victoryPoints: 99, category: "FORGED", ability: "invented",
  }));
  const cards = validateCityCards(source);
  for (const card of cards) {
    assert.deepEqual(Object.keys(card).sort(), ["cardId", "templateId"]);
    const template = getCityTemplate(card.templateId);
    assert.ok(template.cost <= 6);
    assert.equal(template.victoryPoints, template.cost);
  }
  assert.equal(source[0]?.cost, 99);
});

test("CITY same-template physical copies remain distinct while same-stat templates remain different identities", () => {
  const cards = createCityCards(suppliedCardIds());
  const copies = cards.filter((card) => card.templateId === "CB-CIV-02");
  assert.equal(copies.length, 2);
  assert.notEqual(copies[0]?.cardId, copies[1]?.cardId);
  const first = getCityTemplate("CB-CIV-02");
  const second = getCityTemplate("CB-CIV-03");
  assert.equal(first.category, second.category);
  assert.equal(first.cost, second.cost);
  assert.equal(first.victoryPoints, second.victoryPoints);
  assert.notEqual(first.templateId, second.templateId);
});

test("CITY versions, 8 original role names/order, and approved window durations are pinned", () => {
  assert.equal(CITY_RULES_VERSION, "city-rules-v1");
  assert.equal(CITY_ROLESET_VERSION, "city-roles-v1");
  assert.equal(CITY_CARDSET_VERSION, "city-cardset-v1");
  assert.equal(CITY_SELECTION_SECONDS, 45);
  assert.equal(CITY_ACTION_SECONDS, 90);
  assert.deepEqual(CITY_ROLE_IDS, ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06", "CR-07", "CR-08"]);
  assert.deepEqual(CITY_ROLES.map((role) => role.name), ["가림꾼", "징수꾼", "교환꾼", "길잡이", "수호꾼", "장터지기", "설계꾼", "해체꾼"]);
  assert.equal(Object.isFrozen(CITY_ROLE_IDS), true);
  assert.equal(Object.isFrozen(CITY_ROLES), true);
  for (const [index, role] of CITY_ROLES.entries()) {
    assert.equal(Object.isFrozen(role), true);
    assert.equal(isCityRoleId(role.roleId), true);
    assert.equal(role.resolutionOrder, index + 1);
    assert.equal(cityRoleOrder(role.roleId), index + 1);
  }
  for (const value of ["CR-00", "CR-09", "CR01", "", 1, {}, null]) {
    assert.equal(isCityRoleId(value), false);
  }
});
