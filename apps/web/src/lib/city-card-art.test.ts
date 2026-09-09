import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CityBuildingFace } from "../features/city-role/CityBuildingFace.js";
import { CITY_TEMPLATE_ART, CityTemplateArt } from "../features/city-role/CityTemplateArt.js";
import { CityRolePlayingScreen, type CityRolePlayingScreenProps } from "../features/city-role/CityRolePlayingScreen.js";
import { cityActionFixture } from "./city-role-test-fixtures.js";

test("CITY thirty original scene files exist, are distinct and stay within the image budget", () => {
  const hashes = new Set<string>();
  let total = 0;
  for (const [id, art] of Object.entries(CITY_TEMPLATE_ART)) {
    assert.equal(art.src, `/city-art/illustrated-v1/${id.toLowerCase()}.webp`);
    const bytes = readFileSync(new URL(`../../public${art.src}`, import.meta.url));
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.ok(bytes.length > 10_000 && bytes.length < 110_000, id);
    total += bytes.length;
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(hashes.size, 30, "no duplicated plates or category recolors");
  assert.ok(total < 2_500_000, "all images together stay below 2.5 MB");
});

test("CITY artwork has six separate local scenes in every category without external URLs", () => {
  for (const category of ["CIVIC", "CULTURE", "TRADE", "GUARD", "LANDMARK"] as const) {
    const plates = Object.entries(CITY_TEMPLATE_ART).filter(([, art]) => art.category === category);
    assert.equal(plates.length, 6);
    for (const [templateId, art] of plates) {
      const html = renderToStaticMarkup(createElement(CityTemplateArt, { templateId, category }));
      assert.ok(html.includes(art.src));
      assert.ok(html.includes(`city-art-${category.toLowerCase()}`));
      assert.match(html, /loading="lazy".*decoding="async"/u);
      assert.doesNotMatch(html, /https?:|data:image|<script|tabindex/u);
    }
  }
});

test("CITY unknown or mismatched template does not borrow a misleading scene", () => {
  for (const templateId of ["not-a-template", "CB-LAN-01"]) {
    const html = renderToStaticMarkup(createElement(CityTemplateArt, { templateId, category: "TRADE" }));
    assert.doesNotMatch(html, /<img/u);
    assert.match(html, /그림 준비 중/u);
  }
});

test("CITY common card face exposes printed cost and VP as separate readable information", () => {
  const card = cityActionFixture().game.privateState.hand[0]!;
  const html = renderToStaticMarkup(createElement(CityBuildingFace, { card }));
  assert.match(html, /city-card-cost/u); assert.match(html, /city-card-vp/u);
  assert.match(html, /금화 <b>1<\/b>/u); assert.match(html, /<b>1<\/b>점/u);
  assert.ok(html.indexOf("city-category") < html.indexOf("data-template-art"));
  assert.ok(html.indexOf("data-template-art") < html.indexOf("city-building-name"));
  assert.match(html, /alt=""/u);
});

test("CITY Landmark art stays identical across rule versions but v1 never gains ability text", () => {
  const card = { ...cityActionFixture().game.privateState.hand[0]!, templateId: "CB-LAN-05", name: "달그림회랑", category: "LANDMARK" as const, cost: 4, victoryPoints: 4 };
  const old = renderToStaticMarkup(createElement(CityBuildingFace, { card, rulesVersion: "city-rules-v1" }));
  const current = renderToStaticMarkup(createElement(CityBuildingFace, { card, rulesVersion: "city-rules-v2" }));
  assert.ok(old.includes(CITY_TEMPLATE_ART["CB-LAN-05"].src));
  assert.ok(current.includes(CITY_TEMPLATE_ART["CB-LAN-05"].src));
  assert.doesNotMatch(old, /특수 능력/u);
  assert.match(current, /★ 특수 능력/u);
  assert.match(current, /다양성의 빠진 일반 분류 1종 보완/u);
});

test("CITY visual build states follow existing preview and connection authority", () => {
  const snapshot = cityActionFixture();
  const props: CityRolePlayingScreenProps = {
    snapshot, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null,
    sessionReplaced: false, actionPending: false, retryPending: false, actionFeedback: null,
    selectionResetGeneration: 0, roomLeavePending: false, canAct: true,
    onAction() {}, onRetry() {}, onLeaveRoom() {}, onGoHome() {},
  };
  const ready = renderToStaticMarkup(createElement(CityRolePlayingScreen, props));
  assert.match(ready, /data-build-state="ready"/u);
  const poor = { ...snapshot, game: { ...snapshot.game, playerStates: snapshot.game.playerStates.map(p => ({ ...p, gold: 0 })) } };
  assert.match(renderToStaticMarkup(createElement(CityRolePlayingScreen, { ...props, snapshot: poor })), /data-build-state="unaffordable"/u);
  assert.match(renderToStaticMarkup(createElement(CityRolePlayingScreen, { ...props, canAct: false })), /data-build-state="unavailable"/u);
});

test("CITY card styling does not stretch short city cards and preserves small-screen/motion affordances", () => {
  const css = readFileSync(new URL("../../src/features/city-role/city-role.css", import.meta.url), "utf8");
  assert.match(css, /\.city-shell \.city-card-grid \{ align-items: start/u);
  assert.match(css, /repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(css, /prefers-reduced-motion: reduce/u);
  assert.match(css, /\.city-shell \.city-building:focus-visible/u);
  assert.match(css, /data-build-state="unaffordable"/u);
});
