import type { DuetPlayingProjection, DuetFinishedProjection, PlayerId } from "@hangul-rummikub/shared";
export const DUET_ROLE_LABELS = { AGENT: "요원", BYSTANDER: "시민", ASSASSIN: "암살자" } as const;
export function duetControls(g:DuetPlayingProjection|DuetFinishedProjection,self:PlayerId){
  const me=g.playerStates.find(p=>p.playerId===self),partner=g.playerStates.find(p=>p.playerId!==self);
  return {
    canClue:g.phase==='CLUE'&&(g.clueGiverId===null||g.clueGiverId===self)&&me?.passed===false&&me.cluesComplete===false,
    canGuess:g.phase==='GUESS'&&g.clueGiverId!==self||g.phase==='SUDDEN_DEATH'&&partner?.cluesComplete===false,
    canEnd:g.phase==='GUESS'&&g.clueGiverId!==self&&g.guessesThisTurn>0,
  };
}
export function duetClueError(word:string,board:readonly {word:string;foundBy:string|null}[]):string|null {
  const normalized=word.trim().normalize('NFC');
  if(!normalized)return '힌트 한 단어를 입력하세요.';
  if(!/^[\p{L}\p{N}]{1,20}$/u.test(normalized))return '공백·기호 없이 20자 이내로 입력하세요.';
  if(board.some(c=>c.foundBy===null&&c.word.toLocaleLowerCase()===normalized.toLocaleLowerCase()))return '아직 보이는 단어를 그대로 힌트로 줄 수 없습니다.';
  return null;
}
