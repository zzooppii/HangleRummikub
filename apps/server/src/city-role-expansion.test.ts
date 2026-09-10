import { CITY_EXPANDED_ROLES as PUBLIC_ROLES, CITY_SPECIAL_BUILDINGS as PUBLIC_BUILDINGS } from "@hangul-rummikub/shared";
import { CITY_EXPANDED_ROLES } from "./games/city-role/domain/expansion-catalog.js";
import { parse } from "valibot";
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema } from "@hangul-rummikub/shared";
import { projectCityRoleV2Game } from "./games/city-role/compatibility/city-role-v2-game-projector.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCityCards, getCityTemplate, type BuildingTemplateId } from './games/city-role/domain/cardset-v1.js';
import { CITY_BUILDING_TEMPLATES_V2 } from './games/city-role/domain/cardset-v2.js';
import { CITY_SPECIAL_BUILDINGS, CITY_STANDARD_CAST, type CityJobId, type CitySpecialId } from './games/city-role/domain/expansion-catalog.js';
import { applyCityAction, createInitialCityGameState, timeoutCityWindow, forfeitCityPlayers, type CityAction, type CityEntropy } from './games/city-role/domain/rule-engine.js';
import { parseBuildingCardId, parseCityPlayerId, parseCityGameId, parseCityActionId } from './games/city-role/domain/identity.js';
import { CITY_ALL_ROLE_IDS, type CityRoleId } from './games/city-role/domain/role.js';
import type { CityGameState, CityRoleAssignment } from './games/city-role/domain/game-state.js';
import { assertCityGameState } from './games/city-role/domain/state-validator.js';
import { expandedScore, expandedBonusBreakdown } from './games/city-role/domain/expansion-scoring.js';
import type { CityExpansionAction } from './games/city-role/domain/expansion-state.js';

let counter = 0;
const people = Array.from({ length: 4 }, (_, i) => parseCityPlayerId(`expanded-player-${i}`));
const me = people[0]!, them = people[1]!;
function entropy(s: CityGameState): CityEntropy { return { nextActionId: parseCityActionId(`expanded-action-${++counter}`), nextRoleOrder: CITY_ALL_ROLE_IDS.slice(0, s.expansion?.settings.roles.length ?? 8), discardOrder: s.discard, shuffleCards: cards => [...cards].reverse(), randomIndex: () => 0 }; }
function setup(job: CityJobId = 'KING', specialIds: readonly CitySpecialId[] = [], tax = false): CityGameState {
  const roleRank: Record<CityJobId, number> = { ASSASSIN:1,WITCH:1,MAGISTRATE:1,THIEF:2,SPY:2,BLACKMAILER:2,MAGICIAN:3,WIZARD:3,SEER:3,KING:4,EMPEROR:4,PATRICIAN:4,BISHOP:5,ABBOT:5,CARDINAL:5,MERCHANT:6,ALCHEMIST:6,TRADER:6,ARCHITECT:7,NAVIGATOR:7,SCHOLAR:7,WARLORD:8,DIPLOMAT:8,MARSHAL:8,QUEEN:9,ARTIST:9,TAX_COLLECTOR:9 };
  const rank = roleRank[job], cast = [...CITY_STANDARD_CAST]; if (rank === 9) cast.push(job); else cast[rank-1] = job;
  if (tax && cast.length === 8) cast.push('TAX_COLLECTOR');
  const specials = [...specialIds, ...CITY_SPECIAL_BUILDINGS.map(b => b.templateId).filter(id => !specialIds.includes(id))].slice(0,14);
  const templates = [...CITY_BUILDING_TEMPLATES_V2.filter(t => t.category !== 'LANDMARK'), ...specials.map(id => getCityTemplate(id))];
  const cards = createCityCards(Array.from({ length:68 }, (_, i) => parseBuildingCardId(`expanded-card-${i}`)), templates);
  const initial = createInitialCityGameState({ gameId:parseCityGameId('expanded-game'), rulesVersion:'city-rules-v3', expansionSettings:{ enabled:true, roles:cast }, specialIds:specials, playerIds:people, seatOrder:people, cards, deck:cards.slice(16).map(c=>c.cardId), initialHands:people.map((playerId,i)=>({playerId,cardIds:cards.slice(i*4,i*4+4).map(c=>c.cardId)})), actionId:parseCityActionId(`expanded-action-${++counter}`), roleOrder:CITY_ALL_ROLE_IDS.slice(0,cast.length) });
  const roleId = CITY_ALL_ROLE_IDS[rank-1]!, assignedIds = [roleId, ...CITY_ALL_ROLE_IDS.slice(0,cast.length).filter(r=>r!==roleId).slice(0,3)];
  const assignments: CityRoleAssignment[] = assignedIds.map((id,i)=>({roleId:id,playerId:people[i]!, status:id===roleId?'ACTIVE':Number(id.slice(-2))<rank?'RESOLVED':'SELECTED',revealed:Number(id.slice(-2))<=rank}));
  const unassigned = CITY_ALL_ROLE_IDS.slice(0,cast.length).filter(r=>!assignedIds.includes(r));
  const s: CityGameState = { ...initial, players:initial.players.map(p=>({...p,gold:30})), round:{...initial.round,selectionCursor:4,pickQueue:people,rolesPerPlayer:1,available:[],publicRemoved:[],hiddenRemoved:unassigned.slice(0,1),unselected:unassigned.slice(1),assignments,resolutionCursor:rank}, revealedRoles:assignments.filter(a=>a.revealed).map(a=>({roundNumber:1,roleId:a.roleId,playerId:a.playerId,kind:'NORMAL'})), window:{kind:'ROLE_ACTION',actionId:parseCityActionId(`expanded-action-${++counter}`),activePlayerId:me,activeRoleId:roleId,acquisition:'COMPLETE',abilityUsed:false,buildingsBuilt:0},result:null };
  assertCityGameState(s); return s;
}
function zones(s: CityGameState, city: readonly BuildingTemplateId[] = [], hand: readonly BuildingTemplateId[] = [], otherCity: readonly BuildingTemplateId[] = [], otherHand: readonly BuildingTemplateId[] = []): CityGameState {
  const used = new Set<string>(); const take = (ids: readonly BuildingTemplateId[]) => ids.map(id=>{ const c=s.cards.find(c=>c.templateId===id&&!used.has(c.cardId)); assert.ok(c,`missing ${id}`); used.add(c.cardId); return c.cardId; });
  const ownCity=take(city), ownHand=take(hand), theirs=take(otherCity), theirHand=take(otherHand);
  const next: CityGameState = { ...s, players:s.players.map(p=>({...p,city:p.playerId===me?ownCity:p.playerId===them?theirs:[],hand:p.playerId===me?ownHand:p.playerId===them?theirHand:[]})),deck:s.cards.filter(c=>!used.has(c.cardId)).map(c=>c.cardId),discard:[] };
  assertCityGameState(next);return next;
}
function act(s: CityGameState, action: CityAction): CityGameState { assert.ok(s.window); const next=applyCityAction(s,{gameId:s.gameId,actionId:s.window.actionId,playerId:s.window.activePlayerId},action,entropy(s));assertCityGameState(next);return next; }
function extra(s: CityGameState, action: CityExpansionAction) { return act(s,{kind:'EXPANSION',action}); }
function card(s: CityGameState, id: BuildingTemplateId) { const c=s.cards.find(c=>c.templateId===id);assert.ok(c);return c.cardId; }
function ownPlayer(s: CityGameState) { return s.players.find(p=>p.playerId===me)!; }

test('CITY expanded inventory is 54 ordinary + 14 distinct special physical cards',()=>{const s=setup();assert.equal(s.cards.length,68);assert.deepEqual(['TRADE','CIVIC','GUARD','CULTURE','LANDMARK'].map(category=>s.cards.filter(c=>getCityTemplate(c.templateId).category===category).length),[20,12,11,11,14]);assert.throws(()=>assertCityGameState({...s,deck:[...s.deck,s.deck[0]!]}));});
test('factory, stables, trader and navigator enforce actual build costs and budgets',()=>{
 let s=zones(setup('TRADER',['CB-SP-05','CB-SP-26']),['CB-SP-05'],['CB-SP-26','CB-TRA-01','CB-CIV-01']);
 s=extra(s,{command:'BUILD',cardId:card(s,'CB-SP-26')});assert.equal(ownPlayer(s).gold,29);assert.equal(s.window?.kind==='ROLE_ACTION'&&s.window.buildingsBuilt,0);
 s=extra(s,{command:'BUILD',cardId:card(s,'CB-TRA-01')});s=extra(s,{command:'BUILD',cardId:card(s,'CB-CIV-01')});assert.equal(ownPlayer(s).city.length,4);
 const no=zones(setup('NAVIGATOR',['CB-SP-26']),[],['CB-SP-26']);assert.throws(()=>extra(no,{command:'BUILD',cardId:card(no,'CB-SP-26')}));
});
test('framework and necropolis sacrifice a real owned building; invalid payment is atomic',()=>{
 for(const id of ['CB-SP-06','CB-SP-18'] as const){let s=zones(setup('KING',[id]),[id==='CB-SP-06'?id:'CB-CIV-01'],[id==='CB-SP-06'?'CB-CIV-06':id]);const old=JSON.stringify(s);assert.throws(()=>extra(s,{command:'BUILD',cardId:ownPlayer(s).hand[0]!,ownCardId:'unknown'}));assert.equal(JSON.stringify(s),old);s=extra(s,{command:'BUILD',cardId:ownPlayer(s).hand[0]!,ownCardId:ownPlayer(s).city[0]!});assert.equal(ownPlayer(s).gold,30);assert.equal(ownPlayer(s).city.length,1);assert.equal(s.discard.length,0);assert.equal(s.deck.length,67);}
});
test('laboratory, smithy and museum are once per role turn and conserve hidden cards',()=>{
 let s=zones(setup('KING',['CB-SP-13','CB-SP-25','CB-SP-17']),['CB-SP-13','CB-SP-25','CB-SP-17'],['CB-CIV-01','CB-CIV-02']);
 s=extra(s,{command:'SPECIAL',effect:'LABORATORY',cardId:ownPlayer(s).hand[0]!});assert.equal(ownPlayer(s).gold,32);assert.throws(()=>extra(s,{command:'SPECIAL',effect:'LABORATORY',cardId:ownPlayer(s).hand[0]!}));
 s=extra(s,{command:'SPECIAL',effect:'MUSEUM',cardId:ownPlayer(s).hand[0]!});assert.equal(s.expansion?.museum[0]?.cards.length,1);assert.equal(ownPlayer(s).hand.length,0);
 s=extra(s,{command:'SPECIAL',effect:'SMITHY'});assert.equal(ownPlayer(s).hand.length,3);assert.equal(ownPlayer(s).gold,30);
});
test('observatory and library combine to keep three cards; gold mine pays three gold',()=>{
 let s=zones(setup('KING',['CB-SP-14','CB-SP-19','CB-SP-07']),['CB-SP-14','CB-SP-19','CB-SP-07']);assert.ok(s.window?.kind==='ROLE_ACTION');s={...s,result:null,window:{...s.window,acquisition:'NOT_TAKEN'}};
 const drawn=act(s,{kind:'DRAW_BUILDING_CARDS'});assert.equal(ownPlayer(drawn).hand.length,3);assert.equal(drawn.pendingChoice,null);
 const gold=act(s,{kind:'TAKE_INCOME'});assert.equal(ownPlayer(gold).gold,33);
});
test('secret vault cannot be built and scores only from hand; wishing well includes itself',()=>{
 let s=zones(setup('KING',['CB-SP-24','CB-SP-30']),['CB-SP-30'],['CB-SP-24']);assert.throws(()=>extra(s,{command:'BUILD',cardId:card(s,'CB-SP-24')}));assert.equal(expandedScore(s,ownPlayer(s)).landmarkBonus,4);
 s=zones(setup('KING',['CB-SP-27']),['CB-SP-27']);assert.equal(expandedScore(s,ownPlayer(s)).landmarkBonus,5);
});
test('rank 8 cannot target keep, completed cities or bishop; wall increases price',()=>{
 let s=zones(setup('WARLORD',['CB-SP-12','CB-SP-08']),[],[],['CB-SP-12','CB-SP-08','CB-CIV-02']);assert.throws(()=>extra(s,{command:'ROLE',targetPlayerId:them,cardId:card(s,'CB-SP-12')}));
 const protectedState={...s,round:{...s.round,protectedPlayerIds:[them]}};assert.throws(()=>extra(protectedState,{command:'ROLE',targetPlayerId:them,cardId:card(s,'CB-CIV-02')}));
 s=extra(s,{command:'ROLE',targetPlayerId:them,cardId:card(s,'CB-CIV-02')});assert.equal(ownPlayer(s).gold,28);
});
test('quarry permits duplicate construction and monument advances completion by two',()=>{
 let s=zones(setup('ARCHITECT',['CB-SP-22','CB-SP-16']),['CB-SP-22','CB-CIV-01'],['CB-CIV-01']);const id=ownPlayer(s).hand[0]!;s=extra(s,{command:'BUILD',cardId:id});assert.equal(ownPlayer(s).city.length,3);
 const blocked=zones(setup('KING',['CB-SP-16']),['CB-CIV-01','CB-CIV-02','CB-CIV-03','CB-CIV-04','CB-CIV-05'],['CB-SP-16']);assert.throws(()=>extra(blocked,{command:'BUILD',cardId:card(blocked,'CB-SP-16')}));
});
test('wizard privately chooses an opponent card; seer redistributes exact cards',()=>{
 let s=zones(setup('WIZARD'),[],[],[],['CB-CIV-01']);s=extra(s,{command:'ROLE',targetPlayerId:them});assert.equal(s.expansion?.pending?.kind,'WIZARD');s=extra(s,{command:'DECIDE',cardId:card(s,'CB-CIV-01'),choice:'BUILD'});assert.equal(ownPlayer(s).city.length,1);assert.equal(s.window?.kind==='ROLE_ACTION'&&s.window.buildingsBuilt,0);
 let seer=zones(setup('SEER'),[],['CB-CIV-02'],[],['CB-CIV-01']);seer=extra(seer,{command:'ROLE'});assert.equal(ownPlayer(seer).hand.length,2);assert.throws(()=>extra(seer,{command:'DECIDE',cardIds:[]}));seer=extra(seer,{command:'DECIDE',cardIds:[card(seer,'CB-CIV-02')]});assert.equal(seer.players[1]!.hand[0],card(seer,'CB-CIV-02'));
});
test('scholar keeps one of seven and artist raises cost and scoring together',()=>{
 let s=setup('SCHOLAR');const before=ownPlayer(s).hand.length;s=extra(s,{command:'ROLE'});assert.equal(s.expansion?.pending?.cards.length,7);s=extra(s,{command:'DECIDE',cardId:s.expansion!.pending!.cards[0]!});assert.equal(ownPlayer(s).hand.length,before+1);
 let artist=zones(setup('ARTIST'),['CB-CIV-01','CB-CIV-02']);artist=extra(artist,{command:'ROLE',cardIds:[...ownPlayer(artist).city]});assert.equal(ownPlayer(artist).gold,28);assert.equal(expandedScore(artist,ownPlayer(artist)).buildingVP,5);
});
test('role income is once, patrician/cardinal draw, and school of magic counts once',()=>{
 for(const job of ['KING','PATRICIAN','CARDINAL','ABBOT'] as const){let s=zones(setup(job,['CB-SP-23']),['CB-SP-23',job==='KING'||job==='PATRICIAN'?'CB-CIV-01':'CB-CUL-01']);s=extra(s,{command:'INCOME',goldCount:1});assert.throws(()=>extra(s,{command:'INCOME'}));if(job==='KING')assert.equal(ownPlayer(s).gold,32);else if(job==='ABBOT'){assert.equal(ownPlayer(s).gold,31);assert.equal(ownPlayer(s).hand.length,1);}else assert.equal(ownPlayer(s).hand.length,2);}
});
test('expanded timeout resolves private choices and progresses without card loss',()=>{
 let s=extra(setup('SCHOLAR'),{command:'ROLE'});assert.ok(s.window);s=timeoutCityWindow(s,{gameId:s.gameId,actionId:s.window.actionId,playerId:s.window.activePlayerId},{offline:false},entropy(s));assertCityGameState(s);assert.equal(s.expansion?.pending,null);
});

test('all end scoring effects use the approved table including haunted category tradeoffs',()=>{
  const cases: readonly { specials: readonly CitySpecialId[]; city: readonly BuildingTemplateId[]; hand?: readonly BuildingTemplateId[]; bonus: number; diversity?: number }[] = [
    {specials:['CB-SP-02'],city:['CB-SP-02','CB-CIV-01','CB-CIV-02'],bonus:1},
    {specials:['CB-SP-03'],city:['CB-SP-03','CB-CIV-01','CB-CIV-02','CB-CIV-03'],bonus:3},
    {specials:['CB-SP-09','CB-SP-11'],city:['CB-SP-09','CB-SP-11'],bonus:5},
    {specials:['CB-SP-10','CB-SP-15'],city:['CB-SP-10','CB-SP-15'],hand:['CB-CIV-01','CB-CIV-02'],bonus:32},
    {specials:['CB-SP-04','CB-SP-27'],city:['CB-SP-04','CB-SP-27'],bonus:7},
    {specials:['CB-SP-09','CB-SP-30'],city:['CB-SP-09','CB-SP-30','CB-CIV-01','CB-CUL-01','CB-TRA-01'],bonus:1,diversity:3},
  ];
  for(const row of cases){const s=zones(setup('KING',row.specials),row.city,row.hand);const result=expandedScore(s,ownPlayer(s));assert.equal(result.landmarkBonus,row.bonus);assert.equal(result.diversityBonus,row.diversity??0);
    const details=expandedBonusBreakdown(s,ownPlayer(s));assert.equal(details.reduce((sum,b)=>sum+b.points,0),row.bonus);assert.ok(details.every(b=>row.specials.includes(b.templateId)));assert.deepEqual(expandedBonusBreakdown(s,{...ownPlayer(s),forfeited:true}),[]);
    if(row.specials.includes('CB-SP-10'))assert.deepEqual(details,[{templateId:'CB-SP-10',points:30},{templateId:'CB-SP-15',points:2}]);
    if(row.specials.includes('CB-SP-30'))assert.deepEqual(details,[{templateId:'CB-SP-30',points:1}]);
  }
});
test('finished bonus projection itemizes every player without publishing their private cards or changing stored results',()=>{
  let s=zones(setup('KING',['CB-SP-04','CB-SP-15','CB-SP-24']),['CB-SP-04','CB-SP-15'],['CB-SP-24','CB-CIV-01']);
  assert.equal('result' in visible(s,me),false);
  s=forfeitCityPlayers(s,people.slice(1),entropy(s));assertCityGameState(s);
  const before=structuredClone(s);
  const projections=people.map(viewer=>projectCityRoleV2Game({phase:'FINISHED',selfPlayerId:parse(PlayerIdSchema,viewer),playerIds:people.map(id=>parse(PlayerIdSchema,id)),game:{state:s,gameId:parse(GameIdSchema,s.gameId),gameRevision:parse(GameRevisionSchema,1),startedAt:parse(ServerTimeSchema,1000),windowStartedAt:null,deadlineAt:null,finishedAt:parse(ServerTimeSchema,91000),entropySeed:'0'.repeat(64),entropyCounter:0}}));
  const result=projections[0];assert.ok(result?.phase==='FINISHED');
  assert.deepEqual(result.result.rankings[0]?.specialBonusBreakdown,[{templateId:'CB-SP-04',points:2},{templateId:'CB-SP-15',points:2},{templateId:'CB-SP-24',points:3}]);
  for(const projection of projections){assert.equal(projection.phase,'FINISHED');assert.deepEqual(projection.result,result.result);for(const id of ownPlayer(s).hand)assert.equal(JSON.stringify(projection.result).includes(id),false);}
  assert.deepEqual(s,before);
});
test('monument completes a seven-card physical city as eight buildings',()=>{
 let s=zones(setup('KING',['CB-SP-16']),['CB-SP-16','CB-CIV-01','CB-CIV-02','CB-CIV-03','CB-CUL-01','CB-TRA-01'],['CB-GUA-01']);
 s=extra(s,{command:'BUILD',cardId:ownPlayer(s).hand[0]!});assert.equal(ownPlayer(s).city.length,7);assert.equal(s.firstCompletion?.playerId,me);
});
test('poor house and park run before alchemist refunds; tax is excluded from refund',()=>{
 let s=zones(setup('ALCHEMIST',['CB-SP-20','CB-SP-21'],true),['CB-SP-20','CB-SP-21'],['CB-CIV-01']);
 s={...s,players:s.players.map(p=>p.playerId===me?{...p,gold:1}:p)};s=extra(s,{command:'BUILD',cardId:ownPlayer(s).hand[0]!});assert.equal(ownPlayer(s).gold,0);s=act(s,{kind:'END_TURN'});assert.equal(ownPlayer(s).gold,2);assert.equal(ownPlayer(s).hand.length,2);assert.equal(s.expansion?.tax,0);
 let taxed=zones(setup('KING',[],true),[],['CB-CIV-01']);taxed=extra(taxed,{command:'BUILD',cardId:ownPlayer(taxed).hand[0]!});assert.equal(ownPlayer(taxed).gold,28);assert.equal(taxed.expansion?.tax,1);
});
test('magistrate interrupts the first paid build, refunds its payment and taxes the recipient',()=>{
 let s=zones(setup('MAGISTRATE',[],true),[],[],[],['CB-CIV-02']);s=extra(s,{command:'ROLE',roleIds:['CR-02','CR-03','CR-04']});s=act(s,{kind:'END_TURN'});assert.equal(s.window?.activePlayerId,them);s=act(s,{kind:'TAKE_INCOME'});
 s=extra(s,{command:'BUILD',cardId:card(s,'CB-CIV-02')});assert.equal(s.expansion?.pending?.kind,'CONFISCATE');assert.equal(s.window?.activePlayerId,me);
 s=extra(s,{command:'DECIDE',choice:'YES'});assert.equal(s.window?.activePlayerId,them);assert.equal(s.players[1]!.gold,32);assert.equal(s.players[1]!.city.length,0);assert.deepEqual(ownPlayer(s).city,[card(s,'CB-CIV-02')]);assert.equal(ownPlayer(s).gold,29);assert.equal(s.expansion?.tax,1);
});
test('witch cannot use city effects before suspension and controls only the target remainder',()=>{
 let s=zones(setup('WITCH',['CB-SP-13']),['CB-SP-13'],['CB-CIV-01']);assert.throws(()=>extra(s,{command:'SPECIAL',effect:'LABORATORY',cardId:ownPlayer(s).hand[0]!}));
 s=extra(s,{command:'ROLE',roleIds:['CR-02']});assert.equal(s.window?.activePlayerId,them);s=act(s,{kind:'TAKE_INCOME'});assert.equal(s.window?.activePlayerId,me);assert.equal(s.players[1]!.gold,32);assert.equal(ownPlayer(s).gold,30);
 s=extra(s,{command:'SPECIAL',effect:'LABORATORY',cardId:ownPlayer(s).hand[0]!});assert.equal(ownPlayer(s).gold,32);s=act(s,{kind:'END_TURN'});assert.equal(s.round.assignments.find(a=>a.roleId==='CR-02')?.status,'RESOLVED');
});
test('blackmail bribe and refusal pause optional actions and respect the real mark',()=>{
 for(const bribe of [true,false]){let s=setup('BLACKMAILER');s=extra(s,{command:'ROLE',roleIds:['CR-03','CR-04']});s=act(s,{kind:'END_TURN'});const target=s.window!.activePlayerId;s=act(s,{kind:'TAKE_INCOME'});assert.equal(s.expansion?.pending?.kind,'BRIBE');assert.throws(()=>act(s,{kind:'END_TURN'}));s=extra(s,{command:'DECIDE',choice:bribe?'YES':'NO'});if(!bribe){assert.equal(s.window?.activePlayerId,me);s=extra(s,{command:'DECIDE',choice:'YES'});}assert.equal(s.window?.activePlayerId,target);assert.equal(s.players.find(p=>p.playerId===target)?.gold,bribe?16:0);assert.equal(ownPlayer(s).gold,bribe?46:62);}
});
test('diplomat and marshal move district ownership and museum contents without duplicating cards',()=>{
 let s=zones(setup('DIPLOMAT',['CB-SP-17']),['CB-CIV-01'],[],['CB-SP-17']);s=extra(s,{command:'ROLE',targetPlayerId:them,cardId:card(s,'CB-SP-17'),ownCardId:card(s,'CB-CIV-01')});assert.equal(ownPlayer(s).gold,27);assert.equal(s.players[1]!.gold,33);assert.deepEqual(ownPlayer(s).city,[card(s,'CB-SP-17')]);
 let marshal=zones(setup('MARSHAL'),[],[],['CB-CIV-02']);marshal=extra(marshal,{command:'ROLE',targetPlayerId:them,cardId:card(marshal,'CB-CIV-02')});assert.equal(ownPlayer(marshal).gold,28);assert.equal(marshal.players[1]!.gold,32);
});
test('cardinal finances exactly the shortfall; thieves den pays cards without spending gold',()=>{
 let s=zones(setup('CARDINAL'),[],['CB-CIV-06','CB-CIV-01','CB-CIV-02']);s={...s,players:s.players.map(p=>p.playerId===me?{...p,gold:4}:p)};s=extra(s,{command:'BUILD',cardId:card(s,'CB-CIV-06'),cardIds:[card(s,'CB-CIV-01'),card(s,'CB-CIV-02')],targetPlayerId:them});assert.equal(ownPlayer(s).gold,0);assert.equal(s.players[1]!.gold,28);assert.equal(s.players[1]!.hand.length,2);
 let den=zones(setup('KING',['CB-SP-29']),[],['CB-SP-29','CB-CIV-01','CB-CIV-02']);den=extra(den,{command:'BUILD',cardId:card(den,'CB-SP-29'),cardIds:[card(den,'CB-CIV-01'),card(den,'CB-CIV-02')]});assert.equal(ownPlayer(den).gold,26);assert.equal(ownPlayer(den).hand.length,0);
});

function freshFive(cast: readonly CityJobId[], roleOrder: readonly CityRoleId[], special: CitySpecialId): CityGameState {
  const ids=Array.from({length:5},(_,i)=>parseCityPlayerId(`expanded-player-${i}`));
  const specials=[special,...CITY_SPECIAL_BUILDINGS.map(b=>b.templateId).filter(id=>id!==special)].slice(0,14);
  const cards=createCityCards(Array.from({length:68},(_,i)=>parseBuildingCardId(`expanded-card-${i}`)),[...CITY_BUILDING_TEMPLATES_V2.filter(t=>t.category!=='LANDMARK'),...specials.map(getCityTemplate)]);
  return createInitialCityGameState({gameId:parseCityGameId('expanded-game'),rulesVersion:'city-rules-v3',expansionSettings:{enabled:true,roles:cast},specialIds:specials,playerIds:ids,seatOrder:ids,cards,deck:cards.slice(20).map(c=>c.cardId),initialHands:ids.map((playerId,i)=>({playerId,cardIds:cards.slice(i*4,i*4+4).map(c=>c.cardId)})),actionId:parseCityActionId(`expanded-action-${++counter}`),roleOrder});
}
test('theater swaps hidden roles after the actual draft before any role is revealed',()=>{
 let s=zones(freshFive(CITY_STANDARD_CAST,CITY_ALL_ROLE_IDS.slice(0,8),'CB-SP-28'),['CB-SP-28']);
 for(const roleId of ['CR-03','CR-04','CR-05','CR-06','CR-07'] as const) s=act(s,{kind:'SELECT_ROLE',roleId});
 assert.equal(s.expansion?.pending?.kind,'THEATER');assert.equal(s.revealedRoles.length,0);
 s=extra(s,{command:'DECIDE',choice:'YES',targetPlayerId:them,roleIds:['CR-03']});assert.equal(s.round.assignments.find(a=>a.roleId==='CR-04')?.playerId,me);assert.equal(s.window?.activePlayerId,them);assert.equal(s.window?.kind==='ROLE_ACTION'&&s.window.activeRoleId,'CR-03');
});
test('assassinated royalty grants the crown and Queen bonus only at round end',()=>{
 for(const royal of ['KING','EMPEROR'] as const){const cast=[...CITY_STANDARD_CAST,'QUEEN' as const];cast[3]=royal;
  let s=freshFive(cast,['CR-03','CR-02','CR-05','CR-01','CR-04','CR-06','CR-07','CR-08','CR-09'],'CB-SP-01');
  for(const roleId of ['CR-09','CR-04','CR-01','CR-06','CR-07'] as const)s=act(s,{kind:'SELECT_ROLE',roleId});
  s=act(s,{kind:'TAKE_INCOME'});s=act(s,{kind:'USE_ROLE_ABILITY',ability:{kind:'MARK_ROLE_DISABLED',targetRoleId:'CR-04'}});s=act(s,{kind:'END_TURN'});
  while(s.window?.kind==='ROLE_ACTION'&&s.window.activeRoleId!=='CR-09'){s=act(s,{kind:'TAKE_INCOME'});s=act(s,{kind:'END_TURN'});}
  s=act(s,{kind:'TAKE_INCOME'});assert.equal(ownPlayer(s).gold,4);s=act(s,{kind:'END_TURN'});assert.equal(ownPlayer(s).gold,7);
  if(royal==='KING')assert.equal(s.leaderPlayerId,them);
  else{assert.equal(s.expansion?.pending?.kind,'EMPEROR');assert.equal(s.window?.activePlayerId,them);const before=s.players[2]!.gold;s=extra(s,{command:'DECIDE',targetPlayerId:people[2]!});assert.equal(s.leaderPlayerId,people[2]);assert.equal(s.players[2]!.gold,before);assert.equal(s.window?.kind,'ROLE_SELECTION');}
 }
});

function visible(s: CityGameState, viewer: string) {
 return projectCityRoleV2Game({phase:'PLAYING',selfPlayerId:parse(PlayerIdSchema,viewer),playerIds:s.players.map(p=>parse(PlayerIdSchema,p.playerId)),game:{state:s,gameId:parse(GameIdSchema,s.gameId),gameRevision:parse(GameRevisionSchema,1),startedAt:parse(ServerTimeSchema,1000),windowStartedAt:parse(ServerTimeSchema,1000),deadlineAt:parse(ServerTimeSchema,91000),finishedAt:null,entropySeed:'0'.repeat(64),entropyCounter:0}});
}
test('spy inspection remains private when a magistrate temporarily becomes the responder',()=>{
 let s=zones(setup('SPY'),[],['CB-CIV-02'],[],['CB-CIV-01','CB-TRA-01']);
 assert.ok(s.expansion);const roles=[...s.expansion.settings.roles];roles[0]='MAGISTRATE';
 s={...s,expansion:{...s.expansion,settings:{enabled:true,roles},warrants:{sourcePlayerId:them,roles:['CR-02','CR-03','CR-04'],real:'CR-02',used:false}},players:s.players.map(p=>p.playerId===them?{...p,gold:0}:p)};
 s=extra(s,{command:'ROLE',targetPlayerId:them,category:'CIVIC'});assert.equal(ownPlayer(s).hand.length,2);assert.equal(ownPlayer(s).gold,30);
 assert.equal(visible(s,me).privateState.expansion?.inspectedCards.length,2);assert.equal(visible(s,them).privateState.expansion?.inspectedCards.length,0);
 s=extra(s,{command:'BUILD',cardId:card(s,'CB-CIV-02')});assert.equal(s.window?.activePlayerId,them);assert.equal(visible(s,them).privateState.expansion?.inspectedCards.length,0);
 s=extra(s,{command:'DECIDE',choice:'NO'});assert.equal(visible(s,me).privateState.expansion?.inspectedCards.length,2);
 s=act(s,{kind:'END_TURN'});assert.equal(s.expansion?.inspectedOwner,null);assert.equal(s.expansion?.inspectedHand.length,0);
});
test('emperor must pass the crown and receives the chosen payment plus civic income',()=>{
 let s=zones(setup('EMPEROR'),['CB-CIV-01'],[],[],['CB-TRA-01']);assert.throws(()=>act(s,{kind:'END_TURN'}));assert.throws(()=>extra(s,{command:'ROLE',targetPlayerId:me,choice:'GOLD'}));
 s=extra(s,{command:'INCOME'});s=extra(s,{command:'ROLE',targetPlayerId:them,choice:'CARDS'});assert.equal(s.leaderPlayerId,them);assert.equal(ownPlayer(s).gold,31);assert.equal(ownPlayer(s).hand.length,1);assert.equal(s.players[1]!.hand.length,0);
});
test('a departing blackmailer releases both response stages and grants deferred architect cards',()=>{
 for(const refuse of [false,true]){let s=setup('BLACKMAILER');assert.ok(s.expansion);
 s={...s,round:{...s.round,assignments:s.round.assignments.map(a=>a.playerId===people[2]?{...a,roleId:'CR-07'}:a),unselected:s.round.unselected.map(r=>r==='CR-07'?'CR-03':r)}};
 s=extra(s,{command:'ROLE',roleIds:['CR-07','CR-08']});s=act(s,{kind:'END_TURN'});
 while(s.window?.kind==='ROLE_ACTION'&&s.window.activeRoleId!=='CR-07'){s=act(s,{kind:'TAKE_INCOME'});s=act(s,{kind:'END_TURN'});}
 s=act(s,{kind:'TAKE_INCOME'});assert.equal(s.expansion?.pending?.kind,'BRIBE');const owner=s.window!.activePlayerId;const before=s.players.find(p=>p.playerId===owner)!.hand.length;
 if(refuse)s=extra(s,{command:'DECIDE',choice:'NO'});
 s=forfeitCityPlayers(s,[me],entropy(s));assertCityGameState(s);assert.equal(s.expansion?.pending,null);assert.equal(s.window?.activePlayerId,owner);assert.equal(s.players.find(p=>p.playerId===owner)!.hand.length,before+2);
 }
});

test('public and server catalogs agree on all 27 jobs and all 30 approved special buildings',()=>{
 assert.deepEqual(CITY_EXPANDED_ROLES,PUBLIC_ROLES);assert.deepEqual(CITY_SPECIAL_BUILDINGS,PUBLIC_BUILDINGS);
 assert.equal(CITY_EXPANDED_ROLES.length,27);assert.equal(CITY_SPECIAL_BUILDINGS.length,30);
 assert.deepEqual(CITY_SPECIAL_BUILDINGS.map(b=>b.cost),[3,4,5,6,5,3,6,6,2,5,5,3,5,6,5,4,4,5,4,6,4,5,6,0,5,2,3,6,6,5]);
});


test('all role marks are projected to every viewer and survive restoration and turn advance', () => {
  for (const job of ['ASSASSIN','THIEF','WITCH','MAGISTRATE','BLACKMAILER'] as const) {
    let s = setup(job);
    s = job === 'ASSASSIN' ? act(s,{kind:'USE_ROLE_ABILITY',ability:{kind:'MARK_ROLE_DISABLED',targetRoleId:'CR-04'}})
      : job === 'THIEF' ? act(s,{kind:'USE_ROLE_ABILITY',ability:{kind:'MARK_ROLE_GOLD_TRANSFER',targetRoleId:'CR-04'}})
      : extra(s,{command:'ROLE',roleIds: job === 'WITCH' ? ['CR-04'] : job === 'MAGISTRATE' ? ['CR-06','CR-04','CR-05'] : ['CR-06','CR-04']});
    for (let turn = 0; turn < 2; turn++) {
      const restored: unknown = JSON.parse(JSON.stringify(s)); assertCityGameState(restored);
      for (const viewer of people) {
        const view = visible(restored,viewer), e = view.expansion;
        assert.ok(e);
        if (job === 'ASSASSIN') assert.equal(e.disabledRole,'CR-04');
        if (job === 'THIEF') assert.equal(e.robbedRole,'CR-04');
        if (job === 'WITCH') assert.equal(e.witchTarget,'CR-04');
        if (job === 'MAGISTRATE') {
          assert.deepEqual(e.warrants,['CR-04','CR-05','CR-06']);
          assert.equal(view.privateState.expansion?.realWarrant,viewer === me ? 'CR-06' : undefined);
        }
        if (job === 'BLACKMAILER') {
          assert.deepEqual(e.threats,['CR-04','CR-06']);
          assert.equal(view.privateState.expansion?.realThreat,viewer === me ? 'CR-06' : undefined);
        }
      }
      if (turn === 0) {
        // Witch marking already advances to the next role; acquire its resources before ending it.
        if (s.window?.kind === 'ROLE_ACTION' && s.window.acquisition === 'NOT_TAKEN') s = act(s,{kind:'TAKE_INCOME'});
        s = act(s,{kind:'END_TURN'});
      }
    }
  }
});

test('public warrant and threat order cannot identify the real mark', () => {
  for (const job of ['MAGISTRATE','BLACKMAILER'] as const) {
    const before = setup(job);
    const roles: CityRoleId[] = job === 'MAGISTRATE' ? ['CR-06','CR-04','CR-05'] : ['CR-06','CR-04'];
    const a = extra(before,{command:'ROLE',roleIds:roles});
    const b = extra(before,{command:'ROLE',roleIds:[...roles].reverse()});
    assert.deepEqual(visible(a,them),visible(b,them));
    assert.notDeepEqual(visible(a,me).privateState.expansion,visible(b,me).privateState.expansion);
    assert.deepEqual(job === 'MAGISTRATE' ? a.expansion?.warrants?.roles : a.expansion?.threats?.roles,roles);
  }
});


test('abbot collection validates current wealth, ties and once-per-turn use atomically', () => {
  const initial=setup('ABBOT');
  for(const gold of [[2,8,5,0],[2,8,8,0],[8,8,5,0],[10,8,5,0]]){
    const s={...initial,players:initial.players.map((p,i)=>({...p,gold:gold[i]!}))};
    for(const target of [me,them,people[2]!]){
      const before=structuredClone(s), targetGold=s.players.find(p=>p.playerId===target)!.gold;
      if(target!==me && targetGold===Math.max(...gold) && gold[0]!<targetGold){
        const next=extra(s,{command:'ROLE',targetPlayerId:target});
        assert.equal(ownPlayer(next).gold,gold[0]!+1);
        assert.equal(next.players.find(p=>p.playerId===target)!.gold,targetGold-1);
        assert.throws(()=>extra(next,{command:'ROLE',targetPlayerId:target}));
      }else assert.throws(()=>extra(s,{command:'ROLE',targetPlayerId:target}));
      assert.deepEqual(s,before);
    }
  }
});

test('abbot culture income allocation and tribute are independent and cannot exceed current buildings', () => {
  const s=zones(setup('ABBOT',['CB-SP-23']),['CB-CUL-01','CB-SP-23']);
  for(const goldCount of [0,1,2]){
    const next=extra(s,{command:'INCOME',goldCount});
    assert.equal(ownPlayer(next).gold,ownPlayer(s).gold+goldCount);
    assert.equal(ownPlayer(next).hand.length,ownPlayer(s).hand.length+2-goldCount);
    assert.equal(next.window?.kind==='ROLE_ACTION' && next.window.abilityUsed,false);
    assert.throws(()=>extra(next,{command:'INCOME',goldCount}));
  }
  const before=structuredClone(s);assert.throws(()=>extra(s,{command:'INCOME',goldCount:3}));assert.deepEqual(s,before);
});


test('cardinal transfers four distinct payment cards for a six-gold building and rejects invalid exchanges atomically', () => {
  const base = zones(setup('CARDINAL'), [], ['CB-CIV-06','CB-CIV-01','CB-CIV-01','CB-CIV-02','CB-CIV-03']);
  const s = {...base, players:base.players.map(p=>({...p,gold:p.playerId===me?2:10}))};
  assertCityGameState(s);
  const [building, ...payment] = ownPlayer(s).hand;
  assert.ok(building); assert.equal(payment.length,4);
  const before=structuredClone(s);
  for (const action of [
    {command:'BUILD',cardId:building,cardIds:payment.slice(0,1),targetPlayerId:them},
    {command:'BUILD',cardId:building,cardIds:[building,...payment.slice(0,3)],targetPlayerId:them},
  ] satisfies CityExpansionAction[]) {
    assert.throws(()=>extra(s,action)); assert.deepEqual(s,before);
  }
  const poor={...s,players:s.players.map(p=>p.playerId===them?{...p,gold:3}:p)};
  const poorBefore=structuredClone(poor);
  assert.throws(()=>extra(poor,{command:'BUILD',cardId:building,cardIds:payment,targetPlayerId:them}));
  assert.deepEqual(poor,poorBefore);
  const next=extra(s,{command:'BUILD',cardId:building,cardIds:payment,targetPlayerId:them});
  assert.deepEqual(ownPlayer(next).city,[building]);
  assert.deepEqual(ownPlayer(next).hand,[]);
  assert.equal(ownPlayer(next).gold,0);
  const recipient=next.players.find(p=>p.playerId===them)!;
  assert.equal(recipient.gold,6); assert.deepEqual(recipient.hand,payment);
  assert.deepEqual(next.deck,s.deck); assert.deepEqual(next.discard,s.discard);
  assert.deepEqual(s,before);
});
