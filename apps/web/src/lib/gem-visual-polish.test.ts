import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GEM_RESOURCE_IDS } from "../features/gem-card/gem-card-ui.js";
import { GemCardArt, GemResourceLegend, GemResourceMark } from "../features/gem-card/GemVisuals.js";
import { GemCardFace, GemCardPlayingScreen } from "../features/gem-card/GemCardPlayingScreen.js";
import { GemPurchasePreview } from "../features/gem-card/GemPurchasePreview.js";
import { gemPlayingFixture } from "./gem-card-test-fixtures.js";

test("GEM resources have six decorative distinct silhouettes plus visible text legend", () => {
  const shapes = GEM_RESOURCE_IDS.map(resource => renderToStaticMarkup(createElement(GemResourceMark, { resource })).match(/<path d="([^"]+)"/)?.[1]);
  assert.equal(new Set(shapes).size, 6);
  const legend = renderToStaticMarkup(createElement(GemResourceLegend));
  for (const label of ["새벽", "물결", "숲", "불씨", "울림", "프리즘"]) assert.ok(legend.includes(label));
  assert.match(legend, /aria-hidden="true"/);
  assert.match(legend, /focusable="false"/);
});

test("GEM five original family images are valid distinct lightweight WebP assets", () => {
  const hashes = new Set<string>(); let total = 0;
  for (const name of ["dawn", "tide", "grove", "ember", "echo"]) {
    const bytes = readFileSync(new URL(`../../public/gem-art/v1/${name}.webp`, import.meta.url));
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    assert.ok(bytes.length < 120_000); total += bytes.length;
    hashes.add(createHash("sha256").update(bytes).digest("hex"));
  }
  assert.equal(hashes.size, 5); assert.ok(total < 600_000);
});

test("GEM art depends only on visible discount resource and tier, not opaque ID or deck order", () => {
  const card = gemPlayingFixture().game.market[0]!.slots[0]!;
  const art = renderToStaticMarkup(createElement(GemCardArt, { card }));
  assert.match(art, /\/gem-art\/v1\/tide.webp/);
  assert.match(art, /loading="lazy"/); assert.match(art, /decoding="async"/);
  assert.match(art, /alt=""/); assert.doesNotMatch(art, /GC-T|future|deck|sessionToken/);
  const face = renderToStaticMarkup(createElement(GemCardFace, { card }));
  assert.match(face, /영구 할인 \+1/); assert.match(face, /기본 비용/); assert.match(face, /승점/);
});

test("GEM visual payment keeps insufficient Prism unmistakable and full discount details available", () => {
  const snapshot = gemPlayingFixture();
  const html = renderToStaticMarkup(createElement(GemPurchasePreview, { card: snapshot.game.market[0]!.slots[0]!, player: snapshot.game.playerStates[0]! }));
  assert.match(html, /구매 불가 · 자원 부족/); assert.match(html, /프리즘 대체 필요 5개 · 보유 0개/);
  assert.match(html, /<details class="gem-payment-details">/); assert.match(html, /할인 적용 후 필요한 자원/);
});

test("GEM supply precedes market with unchanged nine slots and snapshot-only wallet", () => {
  const snapshot = gemPlayingFixture(); const before = JSON.stringify(snapshot);
  const html = renderToStaticMarkup(createElement(GemCardPlayingScreen, { snapshot, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null, sessionReplaced: false, actionPending: false, commandRetryKind: null, actionFeedback: null, selectionResetGeneration: 0, roomLeavePending: false, canAct: true, onCollect() {}, onPurchase() {}, onReserve() {}, onYield() {}, onRetry() {}, onLeaveRoom() {}, onGoHome() {} }));
  assert.ok(html.indexOf('id="gem-collect-heading"') < html.indexOf('id="gem-market-heading"'));
  assert.equal((html.match(/data-gem-slot=/g) ?? []).length, 9);
  assert.match(html, /내 보석 보관함/); assert.match(html, /00:45/);
  assert.doesNotMatch(html, /sessionToken|storageRevision|rng|futureDeck/);
  assert.equal(JSON.stringify(snapshot), before);
});

test("GEM mobile navigation, timer, reduced motion and minimum target styling stay scoped", () => {
  const css = readFileSync(new URL("../../src/features/gem-card/gem-card.css", import.meta.url), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /position: sticky/); assert.match(css, /scroll-margin-top: 145px/);
  assert.match(css, /min-height: 44px/); assert.doesNotMatch(css, /\.city-|\.number-/);
});
