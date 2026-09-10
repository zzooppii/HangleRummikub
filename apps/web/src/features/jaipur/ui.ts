import { type JaipurAction, type JaipurCard, type JaipurCardType, type JaipurPlayingProjection } from "@hangul-rummikub/shared";
export const JAIPUR_LABELS: Record<JaipurCardType,string>={DIAMOND:'다이아몬드',GOLD:'금',SILVER:'은',CLOTH:'천',SPICE:'향신료',LEATHER:'가죽',CAMEL:'낙타'};
export type JaipurMode='TAKE_GOOD'|'EXCHANGE'|'TAKE_CAMELS'|'SELL';
export type JaipurDraft={mode:JaipurMode;marketIds:JaipurCard['cardId'][];handIds:JaipurCard['cardId'][];camelCount:number};
export const emptyJaipurDraft=(mode:JaipurMode='TAKE_GOOD'):JaipurDraft=>({mode,marketIds:[],handIds:[],camelCount:0});
export function previewJaipur(game:JaipurPlayingProjection,draft:JaipurDraft):{action:JaipurAction|null;reason:string;handAfter:number;goodsPoints:number;bonusSize:number|null} {
  const take=game.market.filter(c=>draft.marketIds.includes(c.cardId)),give=game.privateState.hand.filter(c=>draft.handIds.includes(c.cardId));
  const result={action:null as JaipurAction|null,reason:'',handAfter:game.privateState.hand.length,goodsPoints:0,bonusSize:null as number|null};
  if(take.length!==draft.marketIds.length||give.length!==draft.handIds.length||new Set(draft.marketIds).size!==draft.marketIds.length||new Set(draft.handIds).size!==draft.handIds.length)return {...result,reason:'카드가 바뀌었습니다. 다시 선택해주세요.'};
  if(draft.mode==='TAKE_GOOD') {
    if(take.length!==1||take[0]?.type==='CAMEL')return {...result,reason:'시장에서 상품 한 장을 고르세요.'};
    result.handAfter++;
    result.action={kind:'TAKE_GOOD',cardId:take[0]!.cardId};
  } else if(draft.mode==='TAKE_CAMELS') {
    if(!game.market.some(c=>c.type==='CAMEL'))return {...result,reason:'시장에 낙타가 없습니다.'};
    result.action={kind:'TAKE_CAMELS'};
  } else if(draft.mode==='EXCHANGE') {
    result.handAfter+=take.length-give.length;
    if(take.length<2)return {...result,reason:'시장에서 받을 상품을 2장 이상 고르세요.'};
    if(take.some(c=>c.type==='CAMEL'))return {...result,reason:'교환으로 낙타를 가져올 수 없습니다.'};
    if(!Number.isSafeInteger(draft.camelCount)||draft.camelCount<0||draft.camelCount>game.privateState.camelCount)return {...result,reason:'내 낙타 수를 확인해주세요.'};
    if(take.length!==give.length+draft.camelCount)return {...result,reason:`받기 ${take.length}장 · 내놓기 ${give.length+draft.camelCount}장 — 수량을 맞추세요.`};
    if(take.some(c=>give.some(g=>g.type===c.type)))return {...result,reason:'같은 상품을 받으면서 내놓을 수 없습니다.'};
    result.action={kind:'EXCHANGE',marketCardIds:draft.marketIds,handCardIds:draft.handIds,camelCount:draft.camelCount};
  } else {
    result.handAfter-=give.length;
    if(!give.length)return {...result,reason:'손패에서 판매할 상품을 고르세요.'};
    if(new Set(give.map(c=>c.type)).size!==1)return {...result,reason:'같은 상품만 판매할 수 있습니다.'};
    if(['DIAMOND','GOLD','SILVER'].includes(give[0]!.type)&&give.length<2)return {...result,reason:'다이아몬드·금·은은 2장 이상 판매해야 합니다.'};
    result.goodsPoints=game.goodsBank.find(b=>b.type===give[0]!.type)?.values.slice(0,give.length).reduce((a,b)=>a+b,0)??0;
    const bonusSize=give.length>=5?5:give.length>=3?give.length:null;
    result.bonusSize=game.bonusBank.some(b=>b.size===bonusSize&&b.count>0)?bonusSize:null;
    result.action={kind:'SELL',cardIds:draft.handIds};
  }
  if(result.handAfter>7)return {...result,action:null,reason:`선택 후 손패 ${result.handAfter}장 · 최대 7장입니다.`};
  return result;
}
