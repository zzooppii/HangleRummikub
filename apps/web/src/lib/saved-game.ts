import {
  validateBrowserStoredPlayerSession,
  type BrowserStoredPlayerSession,
  type GameType,
  type RoomCode,
} from "@hangul-rummikub/shared";
import {
  clearStoredPlayerSession,
  readStoredPlayerSession,
  readStoredPlayerSessionForRoom,
  writeStoredPlayerSession,
  type SessionStorageLike,
} from "./session-storage.js";

export const SAVED_GAME_KEY = "hangul-rummikub.saved-game.v1";
export const REPLACED_TAB_KEY = "hangul-rummikub.replaced-tab.v1";
export const MISSING_RESUME_CREDENTIAL =
  "이 기기에는 기존 게임의 재접속 정보가 없습니다.";

export type SavedGame = Readonly<{
  session: BrowserStoredPlayerSession;
  // Presentation metadata only. Admission and renderer selection use the server.
  gameType: GameType | null;
}>;
export type SavedGameEntry = Readonly<{
  roomCode: RoomCode;
  gameType: GameType | null;
}>;

function sameSession(a: BrowserStoredPlayerSession, b: BrowserStoredPlayerSession): boolean {
  return a.playerId === b.playerId &&
    a.credential.roomCode === b.credential.roomCode &&
    a.credential.sessionToken === b.credential.sessionToken;
}

/** Tab credentials isolate active seats; the browser backup survives tab closure.
 * Replaced tabs must not silently reclaim a seat using that shared backup.
 */
export class SavedGameStorage {
  constructor(
    private readonly tab: SessionStorageLike,
    private readonly browser: SessionStorageLike,
  ) {}

  read(): SavedGame | null {
    try {
      const raw = this.browser.getItem(SAVED_GAME_KEY);
      if (raw === null) return null;
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || !("session" in value)) return null;
      const session = validateBrowserStoredPlayerSession(value.session);
      if (!session.ok) return null;
      const gameType = "gameType" in value ? value.gameType : null;
      return {
        session: session.value,
        gameType: gameType === "HANGUL_TILE" || gameType === "NUMBER_TILE" ||
          gameType === "GEM_CARD" || gameType === "CITY_ROLE" ? gameType : null,
      };
    } catch {
      return null;
    }
  }

  entry(): SavedGameEntry | null {
    const saved = this.read();
    const session = saved?.session ?? readStoredPlayerSession(this.tab);
    return session === null ? null : {
      roomCode: session.credential.roomCode,
      gameType: saved?.gameType ?? null,
    };
  }

  forRoom(roomCode: RoomCode): BrowserStoredPlayerSession | null {
    const current = readStoredPlayerSessionForRoom(this.tab, roomCode);
    if (current !== null) return current;
    try {
      if (this.tab.getItem(REPLACED_TAB_KEY) !== null) return null;
    } catch {
      // Without tab isolation we cannot safely auto-claim a shared credential.
      return null;
    }
    const saved = this.read();
    if (saved?.session.credential.roomCode !== roomCode) return null;
    return writeStoredPlayerSession(this.tab, saved.session) ? saved.session : null;
  }

  /** An explicit user request may reclaim a replaced seat; never auto-retry it. */
  select(roomCode: RoomCode): BrowserStoredPlayerSession | null {
    const current = readStoredPlayerSessionForRoom(this.tab, roomCode);
    const saved = this.read();
    const session = current ?? (saved?.session.credential.roomCode === roomCode ? saved.session : null);
    if (session === null || !writeStoredPlayerSession(this.tab, session)) return null;
    try {
      this.tab.removeItem(REPLACED_TAB_KEY);
      return session;
    } catch {
      return null;
    }
  }

  save(session: BrowserStoredPlayerSession, gameType: GameType): boolean {
    const stored = writeStoredPlayerSession(this.tab, session);
    try {
      this.tab.removeItem(REPLACED_TAB_KEY);
      this.browser.setItem(SAVED_GAME_KEY, JSON.stringify({ session, gameType }));
      return stored;
    } catch {
      return false;
    }
  }

  forget(session: BrowserStoredPlayerSession | null): void {
    // Another tab may have saved a different seat since this tab connected.
    const saved = this.read();
    if (session !== null && saved !== null && sameSession(session, saved.session)) {
      try {
        this.browser.removeItem(SAVED_GAME_KEY);
      } catch {
        // The server has already invalidated this credential; never use it in
        // this tab again, even if browser persistence is unavailable.
        clearStoredPlayerSession(this.tab);
        return;
      }
    }
    clearStoredPlayerSession(this.tab);
  }

  replaced(): void {
    // Clear the private tab copy, not the surviving primary's browser backup.
    try {
      this.tab.setItem(REPLACED_TAB_KEY, "true");
    } catch {
      clearStoredPlayerSession(this.tab);
      return;
    }
    clearStoredPlayerSession(this.tab);
  }
}

/** Access storage lazily: browsers can throw even when obtaining the property. */
export function browserSavedGameStorage(): SavedGameStorage {
  const storage = (kind: "sessionStorage" | "localStorage"): SessionStorageLike => ({
    getItem: (key) => window[kind].getItem(key),
    setItem: (key, value) => window[kind].setItem(key, value),
    removeItem: (key) => window[kind].removeItem(key),
  });
  return new SavedGameStorage(storage("sessionStorage"), storage("localStorage"));
}
