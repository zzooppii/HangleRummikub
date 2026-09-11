import type {LoveLetterRank,LoveLetterProjection,LoveLetterCard,LoveLetterAction,PlayerId} from '@hangul-rummikub/shared';
export const COURT:Readonly<Record<LoveLetterRank,{name:string;english:string;effect:string}>>={
 0:{name:'첩자',english:'THE SPY',effect:'첩자를 쓴 생존자가 나뿐이면 라운드 끝에 호감 +1'},
 1:{name:'경비병',english:'THE GUARD',effect:'경비병을 제외한 상대의 인물을 맞히면 상대 탈락'},
 2:{name:'사제',english:'THE PRIEST',effect:'다른 사람의 손패를 나만 확인'},
 3:{name:'남작',english:'THE BARON',effect:'서로 손패를 비밀리에 비교. 낮은 사람이 탈락'},
 4:{name:'시녀',english:'THE HANDMAID',effect:'내 다음 차례 시작까지 다른 사람의 효과로부터 보호'},
 5:{name:'왕자',english:'THE PRINCE',effect:'나 또는 상대가 손패를 버리고 새로 한 장 뽑기'},
 6:{name:'재상',english:'THE CHANCELLOR',effect:'최대 두 장 더 뽑고, 한 장을 남겨 나머지는 덱 아래로'},
 7:{name:'왕',english:'THE KING',effect:'다른 사람 한 명과 손패 교환'},
 8:{name:'백작부인',english:'THE COUNTESS',effect:'왕이나 왕자와 함께 들고 있으면 반드시 사용'},
 9:{name:'공주',english:'THE PRINCESS',effect:'사용하거나 버리면 즉시 탈락. 끝까지 지켜주세요'},
};
export function forcedCountess(hand:readonly LoveLetterCard[]):boolean{return hand.some(c=>c.rank===8)&&hand.some(c=>c.rank===5||c.rank===7);}
export function targetsFor(g:LoveLetterProjection,rank:LoveLetterRank):PlayerId[]{return [1,2,3,5,7].includes(rank)?g.playerStates.filter(p=>!p.eliminated&&(p.playerId===g.privateState.playerId?rank===5:!p.protected)).map(p=>p.playerId):[];}
export function makePlay(g:LoveLetterProjection,cardId:string|null,target:PlayerId|null,guess:LoveLetterRank|null):LoveLetterAction|null{
 if(g.phase!=='PLAYING'||g.stage!=='PLAY_CARD'||g.activePlayerId!==g.privateState.playerId)return null;
 const card=g.privateState.hand.find(c=>c.cardId===cardId);if(!card||forcedCountess(g.privateState.hand)&&card.rank!==8)return null;
 const targets=targetsFor(g,card.rank);if(targets.length&&(!target||!targets.includes(target)))return null;
 if(card.rank===1&&targets.length&&(guess===null||guess===1))return null;
 return {kind:'PLAY',cardId:card.cardId,targetPlayerId:targets.length?target:null,guess:card.rank===1&&targets.length&&guess!==1?guess:null};
}
export function eventText(g:LoveLetterProjection,name:(id:string)=>string):string{
 const e=g.history.at(-1);if(!e)return '편지가 배분되었습니다. 궁정의 마음을 읽어보세요.';
 const start=`${name(e.actorPlayerId)} · ${COURT[e.rank].name}`;
 const target=e.targetPlayerId?` → ${name(e.targetPlayerId)}`:'';
 const outcome={PLAYED:'사용',MISS:'추측 실패',HIT:'추측 적중',LOOK:'비밀 확인',COMPARE:'비공개 대결 완료',PROTECTED:'다음 차례까지 보호',REDRAW:'손패 교체',CHOOSE:'남길 카드 선택 중',RETURNED:'카드 정리 완료',SWAP:'손패 교환',NO_TARGET:'대상이 없어 효과 종료',ELIMINATED:'탈락'}[e.outcome];
 return `${start}${target}${e.guess!==null?` · ${COURT[e.guess].name} 지목`:''} · ${outcome}${e.eliminatedPlayerIds.length?` (${e.eliminatedPlayerIds.map(name).join(', ')} 탈락)`:''}`;
}
