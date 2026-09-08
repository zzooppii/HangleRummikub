import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateBrowserStoredPlayerSession } from "@hangul-rummikub/shared";
import { SavedGameStorage, SAVED_GAME_KEY, MISSING_RESUME_CREDENTIAL } from "./saved-game.js";
import { readStoredPlayerSession, writeStoredPlayerSession, type SessionStorageLike } from "./session-storage.js";
import { HomeScreen, type HomeScreenProps } from "../features/lobby/HomeScreen.js";
import { ReconnectBoundary } from "../features/platform/ReconnectBoundary.js";

class MemoryStorage implements SessionStorageLike {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function session(roomCode = "ABC234", playerId = "player_resume_1") {
  const result = validateBrowserStoredPlayerSession({ protocolVersion: 1, playerId,
    credential: { roomCode, sessionToken: `opaque_saved_credential_${playerId}` } });
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}
function fixture() {
  const tab = new MemoryStorage();
  const browser = new MemoryStorage();
  return { tab, browser, store: new SavedGameStorage(tab, browser), player: session() };
}

test("saved game: refresh and closed/reopened tab restore exact room/player/token without nickname", () => {
  const { tab, browser, store, player } = fixture();
  assert.equal(store.save(player, "NUMBER_TILE"), true);
  assert.deepEqual(new SavedGameStorage(tab, browser).forRoom(player.credential.roomCode), player);
  const freshTab = new MemoryStorage();
  assert.deepEqual(new SavedGameStorage(freshTab, browser).forRoom(player.credential.roomCode), player);
  assert.deepEqual(readStoredPlayerSession(freshTab), player);
  assert.deepEqual(store.entry(), { roomCode: "ABC234", gameType: "NUMBER_TILE" });
  assert.equal("credential" in (store.entry() ?? {}), false);
});

test("saved game: existing tab-only sessions remain available before persistence migration", () => {
  const { tab, store, player } = fixture();
  writeStoredPlayerSession(tab, player);
  assert.deepEqual(store.entry(), { roomCode: "ABC234", gameType: null });
  assert.deepEqual(store.forRoom(player.credential.roomCode), player);
  assert.deepEqual(store.select(player.credential.roomCode), player);
});

test("saved game: missing/forged local record cannot fall back to nickname or another room", () => {
  const { store, browser, player } = fixture();
  assert.equal(store.forRoom(player.credential.roomCode), null);
  assert.equal(store.select(player.credential.roomCode), null);
  for (const raw of ["{broken", "null", JSON.stringify({ session: { playerId: player.playerId,
    credential: { roomCode: "ABC234" }, nickname: "same name" } })]) {
    browser.setItem(SAVED_GAME_KEY, raw);
    assert.equal(store.read(), null);
    assert.equal(store.select(player.credential.roomCode), null);
  }
  store.save(player, "NUMBER_TILE");
  assert.equal(store.forRoom(session("JKM567").credential.roomCode), null);
});

test("saved game: replacement blocks auto-reclaim even on refresh; only explicit reconnect may reclaim", () => {
  const { store, tab, browser, player } = fixture();
  store.save(player, "NUMBER_TILE");
  store.replaced();
  assert.equal(readStoredPlayerSession(tab), null);
  assert.equal(store.forRoom(player.credential.roomCode), null);
  const refreshed = new SavedGameStorage(tab, browser);
  assert.equal(refreshed.forRoom(player.credential.roomCode), null);
  assert.deepEqual(store.read()?.session, player); // latest primary backup survives
  assert.deepEqual(refreshed.select(player.credential.roomCode), player);
  assert.deepEqual(refreshed.forRoom(player.credential.roomCode), player);
});

test("saved game: active tab remains isolated from another tab saving a different seat", () => {
  const { store, browser, player } = fixture();
  store.save(player, "NUMBER_TILE");
  const other = new SavedGameStorage(new MemoryStorage(), browser);
  const otherPlayer = session("ABC234", "player_resume_2");
  other.save(otherPlayer, "NUMBER_TILE");
  assert.deepEqual(store.forRoom(player.credential.roomCode), player);
  store.forget(player);
  assert.deepEqual(other.read()?.session, otherPlayer);
});

test("saved game: definitive leave/stale credential clears matching browser and tab only", () => {
  const { store, player, tab } = fixture();
  store.save(player, "HANGUL_TILE");
  store.forget(player);
  assert.equal(store.entry(), null);
  assert.equal(readStoredPlayerSession(tab), null);
  assert.equal(store.forRoom(player.credential.roomCode), null);
});

test("saved game: storage restrictions fail safely and tab fallback remains usable", () => {
  const unavailable: SessionStorageLike = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); },
  };
  const player = session();
  const store = new SavedGameStorage(new MemoryStorage(), unavailable);
  assert.equal(store.save(player, "GEM_CARD"), false);
  assert.deepEqual(store.forRoom(player.credential.roomCode), player);
  assert.doesNotThrow(() => store.forget(player));
  const blocked = new SavedGameStorage(unavailable, unavailable);
  assert.equal(blocked.select(player.credential.roomCode), null);
  assert.equal(blocked.forRoom(player.credential.roomCode), null);
  assert.doesNotThrow(() => blocked.replaced());
});

function homeProps(): HomeScreenProps {
  return { nickname: "", roomCodeInput: "", invitationRoomCode: null, routeErrorMessage: null,
    busyLabel: null, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null,
    onNicknameChange() {}, onRoomCodeChange() {}, onCreateRoom() {}, onJoinRoom() {}, onGoHome() {} };
}
test("Home saved-session entry is available offline without nickname and never renders credentials", () => {
  const { store, player } = fixture();
  store.save(player, "NUMBER_TILE");
  const html = renderToStaticMarkup(createElement(HomeScreen, { ...homeProps(),
    savedGame: store.entry(), busyLabel: "서버 재연결 중...", connectionTone: "offline", onReconnect() {} }));
  assert.match(html, /진행 중인 게임/u);
  assert.match(html, /ROOM ABC234/u);
  assert.match(html, /다시 접속하기/u);
  assert.doesNotMatch(html, new RegExp(player.credential.sessionToken));
  const savedCard = html.slice(html.indexOf('saved-game-entry'), html.indexOf('aria-labelledby="entry-heading"'));
  assert.match(savedCard, /숫자 타일 게임/u);
  assert.doesNotMatch(savedCard, /disabled/u);
});

test("direct Room without credential explains fail-closed recovery; ordinary Home is not an error", () => {
  const roomHtml = renderToStaticMarkup(createElement(HomeScreen, {
    ...homeProps(), invitationRoomCode: session().credential.roomCode,
  }));
  assert.ok(roomHtml.includes(MISSING_RESUME_CREDENTIAL));
  assert.doesNotMatch(roomHtml, /다시 접속하기/u);
  assert.equal(renderToStaticMarkup(createElement(HomeScreen, homeProps())).includes(MISSING_RESUME_CREDENTIAL), false);
});

test("room reconnect notice retains game view, offers retry, and locks only while resume is in flight", () => {
  const render = (visible: boolean, pending: boolean) => renderToStaticMarkup(createElement(ReconnectBoundary, {
    visible, pending, onReconnect() {}, children: "existing game view",
  }));
  assert.match(render(true, false), /existing game view/u);
  assert.match(render(true, false), /연결이 끊어졌습니다. 재접속 중/u);
  assert.match(render(true, false), /다시 접속하기/u);
  assert.doesNotMatch(render(true, false), /disabled/u);
  assert.match(render(true, true), /disabled/u);
  assert.doesNotMatch(render(false, false), /room-recovery-notice/u);
});
