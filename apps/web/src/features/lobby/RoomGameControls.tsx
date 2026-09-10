import { useState } from "react";
import type { GameType } from "@hangul-rummikub/shared";
import type { RoomSnapshotShell } from "../../lib/room-snapshot-shell.js";
import { GAME_CATALOG } from "../game-catalog/game-catalog.js";

export function RoomGameControls({ snapshot, disabled, onSelectGame, onReady }: Readonly<{
  snapshot: RoomSnapshotShell;
  disabled: boolean;
  onSelectGame(gameType: GameType): void;
  onReady(ready: boolean): void;
}>) {
  const [selected, setSelected] = useState(snapshot.room.gameType);
  if (snapshot.room.phase === "PLAYING") return null;
  const self = snapshot.room.players.find(player => player.playerId === snapshot.self.playerId);
  const finished = snapshot.room.phase === "FINISHED";
  const preparationRequired = !finished && self?.isReady !== undefined;
  return <section className="room-game-controls" aria-label="같은 방에서 다음 게임 준비">
    <div><strong>{finished ? "다음 게임도 이 방에서" : "함께할 게임 선택"}</strong><p>방 코드 {snapshot.room.roomCode} · 참가자와 초대 링크는 그대로 유지됩니다.</p></div>
    {self?.isHost ? <div className="room-game-selection">
      <label htmlFor="room-next-game">플레이할 게임</label>
      <select id="room-next-game" value={selected} disabled={disabled} onChange={event => {
        const item = GAME_CATALOG.find(game => game.gameType === event.target.value);
        if (item) setSelected(item.gameType);
      }}>{GAME_CATALOG.map(game => <option key={game.gameType} value={game.gameType}>{game.displayName}</option>)}</select>
      <button type="button" className="secondary-button" disabled={disabled || (!finished && selected === snapshot.room.gameType)} onClick={() => onSelectGame(selected)}>
        {finished ? "대기실로 돌아가기" : "게임 변경"}
      </button>
    </div> : <p>{finished ? "방장이 대기실로 돌아가면 같은 방에서 다음 게임을 준비합니다." : "방장이 플레이할 게임을 변경할 수 있습니다."}</p>}
    {preparationRequired && <div className="room-game-ready">
      <ul aria-label="참가자 준비 상태">{snapshot.room.players.map(player => <li key={player.playerId}>{player.nickname} · {player.isReady ? "준비 완료" : "준비 대기"}</li>)}</ul>
      <button className="primary-button" type="button" disabled={disabled} aria-pressed={self?.isReady === true} onClick={() => onReady(!self?.isReady)}>{self?.isReady ? "준비 취소" : "준비하기"}</button>
      <p>모두 준비한 뒤 방장이 시작할 수 있습니다.</p>
    </div>}
  </section>;
}
