import { CENTURY_COLORS, centurySum, type CenturyAction, type CenturyCardId, type CenturyColor, type CenturyMerchant, type CenturyPlayingProjection, type CenturySpices } from '@hangul-rummikub/shared';
export const CENTURY_LABELS = ['노랑','빨강','초록','갈색'] as const;
export const CENTURY_SPICE_NAMES = ['강황','사프란','카다멈','계피'] as const;
export const CENTURY_ACTION_LABELS = {PRODUCE:'생산',TRADE:'교환',UPGRADE:'업그레이드',ACQUIRE:'상인 획득',REST:'휴식',CLAIM:'점수 획득'} as const;
export type CenturyDraft={mode:'HAND'|'ACQUIRE'|'CLAIM'|'REST';cardId:CenturyCardId|null;times:number;upgrades:(0|1|2)[];payment:CenturyColor[];returned:CenturySpices};
export const emptyCenturyDraft=():CenturyDraft=>({mode:'HAND',cardId:null,times:1,upgrades:[],payment:[],returned:[0,0,0,0]});
export function centuryCardText(card:CenturyMerchant):string {const desc=(v:CenturySpices)=>CENTURY_COLORS.filter(i=>v[i]>0).map(i=>`${CENTURY_LABELS[i]} ${v[i]}`).join(' · ');return card.kind==='UPGRADE'?`최대 ${card.steps}단계 업그레이드`:card.kind==='PRODUCE'?`${desc(card.gain)} 획득`:`${desc(card.cost)} → ${desc(card.gain)}`;}
export function previewCentury(game:CenturyPlayingProjection,d:CenturyDraft):{action:CenturyAction|null;reason:string;before:CenturySpices;after:CenturySpices;beforeReturn:CenturySpices;excess:number;coin:string}{
 const before:CenturySpices=[...(game.playerStates.find(p=>p.playerId===game.privateState.playerId)?.spices??[0,0,0,0])];
 const after:CenturySpices=[...before];let reason='',action:CenturyAction|null=null,coin='';
 const pay=(cost:CenturySpices)=>{if(CENTURY_COLORS.some(i=>after[i]<cost[i]))return false;for(const i of CENTURY_COLORS)after[i]-=cost[i];return true;};
 const gain=(amount:CenturySpices)=>{for(const i of CENTURY_COLORS)after[i]+=amount[i];};
 if(d.mode==='REST')action={kind:'REST',returned:d.returned};
 else if(d.mode==='CLAIM'){
  const index=game.pointMarket.findIndex(c=>c.cardId===d.cardId),card=game.pointMarket[index];
  if(!card)reason='점수 카드를 선택하세요.';
  else if(!pay(card.cost))reason='필요한 향신료가 부족합니다.';
  else {action={kind:'CLAIM',cardId:card.cardId,returned:d.returned};coin=index===0&&game.gold>0?'금화 +1 · 3점':(index===1&&game.gold>0||index===0&&game.gold===0)&&game.silver>0?'은화 +1 · 1점':'';}
 }else if(d.mode==='ACQUIRE'){
  const index=game.market.findIndex(m=>m.card.cardId===d.cardId),slot=game.market[index];
  if(!slot)reason='상인 카드를 선택하세요.';
  else if(d.payment.length!==index)reason=`왼쪽 카드 ${index}장에 놓을 향신료를 선택하세요.`;
  else {for(const color of d.payment){if(after[color]<1){reason='지불할 향신료가 부족합니다.';break;}after[color]--;}
   if(!reason){gain(slot.spices);action={kind:'ACQUIRE',cardId:slot.card.cardId,payment:d.payment.map((color,i)=>({cardId:game.market[i]!.card.cardId,color})),returned:d.returned};}}
 }else{
  const card=game.privateState.hand.find(c=>c.cardId===d.cardId);
  if(!card)reason='사용할 손패를 선택하세요.';
  else if(card.kind==='PRODUCE'){gain(card.gain);action={kind:'PRODUCE',cardId:card.cardId,returned:d.returned};}
  else if(card.kind==='TRADE'){for(let i=0;i<d.times;i++){if(!pay(card.cost)){reason='선택한 횟수만큼 교환할 자원이 없습니다.';break;}gain(card.gain);}if(!reason)action={kind:'TRADE',cardId:card.cardId,times:d.times,returned:d.returned};}
  else {if(d.upgrades.length>card.steps)reason='업그레이드 횟수를 초과했습니다.';else for(const i of d.upgrades){if(after[i]<1){reason='올릴 향신료가 없습니다.';break;}after[i]--;after[i+1]!++;}if(!reason)action={kind:'UPGRADE',cardId:card.cardId,upgrades:d.upgrades,returned:d.returned};}
 }
 const beforeReturn:CenturySpices=[...after],excess=Math.max(0,centurySum(after)-10);
 if(!reason&&(centurySum(d.returned)!==excess||CENTURY_COLORS.some(i=>d.returned[i]>after[i]))){reason=`초과 향신료 ${excess}개를 선택해 반환하세요.`;action=null;}
 for(const i of CENTURY_COLORS)after[i]-=d.returned[i];
 if(game.activePlayerId!==game.privateState.playerId){reason='다른 상인의 차례입니다.';action=null;}
 return {action,reason,before,after,beforeReturn,excess,coin};
}
