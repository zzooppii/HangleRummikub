import { LOST_CITIES_SUITS, type LostCitiesAction, type LostCitiesCard, type LostCitiesProjection, type LostCitiesSuit } from "@hangul-rummikub/shared";
export const LC_LABELS:Record<LostCitiesSuit,string>={DESERT:'사막',JUNGLE:'정글',OCEAN:'바다',VOLCANO:'화산',SNOW:'설산'};
export const LC_MARKS:Record<LostCitiesSuit,string>={DESERT:'☀',JUNGLE:'❧',OCEAN:'≈',VOLCANO:'▲',SNOW:'❄'};
export type LostCitiesDraft={cardId:LostCitiesCard['cardId']|null;kind:LostCitiesAction['kind']|null;draw:LostCitiesAction['draw']|null};
export const emptyLostCitiesDraft=():LostCitiesDraft=>({cardId:null,kind:null,draw:null});
export const cardLabel=(card:LostCitiesCard)=>`${LC_LABELS[card.suit]} ${card.kind==='INVESTMENT'?'투자':card.value}`;
export function canPlaceLostCities(card:LostCitiesCard,cards:readonly LostCitiesCard[]):boolean {
  const last=cards.filter(c=>c.kind==='NUMBER').at(-1);
  return last?.kind==='NUMBER'?card.kind==='NUMBER'&&card.value>last.value:true;
}
export function sortLostCitiesHand(hand:readonly LostCitiesCard[]):LostCitiesCard[] {
  return [...hand].sort((a,b)=>LOST_CITIES_SUITS.indexOf(a.suit)-LOST_CITIES_SUITS.indexOf(b.suit)||(a.kind==='NUMBER'?a.value:0)-(b.kind==='NUMBER'?b.value:0));
}
export function previewLostCities(game:LostCitiesProjection,draft:LostCitiesDraft):{action:LostCitiesAction|null;hint:string} {
  if(game.phase!=='PLAYING')return {action:null,hint:'라운드 결과를 확인하세요.'};
  const card=game.privateState.hand.find(c=>c.cardId===draft.cardId);
  if(!card)return {action:null,hint:'손패에서 카드 한 장을 선택하세요.'};
  if(!draft.kind)return {action:null,hint:`${cardLabel(card)} · 탐험에 놓거나 버릴 수 있습니다.`};
  const expedition=game.playerStates.find(p=>p.playerId===game.privateState.playerId)?.expeditions.find(e=>e.suit===card.suit);
  if(draft.kind==='PLAY'&&(!expedition||!canPlaceLostCities(card,expedition.cards)))return {action:null,hint:'투자는 숫자보다 먼저, 숫자는 더 큰 카드만 놓을 수 있습니다.'};
  if(!draft.draw)return {action:null,hint:'가져올 곳을 선택하세요. 덱 또는 중앙의 버린 카드에서 가져옵니다.'};
  if(draft.draw.kind==='DISCARD') {
    const suit=draft.draw.suit;
    if(draft.kind==='DISCARD'&&card.suit===suit)return {action:null,hint:'방금 버린 카드는 바로 가져올 수 없습니다.'};
    if(!game.discards.find(d=>d.suit===suit)?.top)return {action:null,hint:'이 더미에는 가져올 카드가 없습니다.'};
  } else if(game.deckCount===0)return {action:null,hint:'덱이 소진되었습니다.'};
  return {action:{cardId:card.cardId,kind:draft.kind,draw:draft.draw},hint:`${cardLabel(card)} ${draft.kind==='PLAY'?'놓기':'버리기'} → ${draft.draw.kind==='DECK'?'덱':LC_LABELS[draft.draw.suit]+' 버림'}에서 1장`};
}
