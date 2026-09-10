import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CITY_DEFAULT_SETTINGS, CITY_STANDARD_SPECIALS, CityBuildingCardIdSchema, PlayerIdSchema, CityActionIdSchema } from '@hangul-rummikub/shared';
import { parse } from 'valibot';
import { cityActionFixture } from './city-role-test-fixtures.js';
import { createCityImpactTracker, deriveCityImpacts } from '../features/city-role/city-impact.js';
function fixture() {
 const s=cityActionFixture();if(s.game.phase!=='ROLE_ACTION')throw new Error('fixture');
 s.game.rulesVersion='city-rules-v3';s.game.cardSetVersion='city-cardset-v3';s.game.roleSetVersion='city-roles-v2';
 s.game.expansion={settings:{enabled:false,roles:[...CITY_DEFAULT_SETTINGS.roles]},specialIds:[...CITY_STANDARD_SPECIALS],tax:0,decorated:[],museum:[],disabledRole:null,robbedRole:null,warrants:[],threats:[],witchTarget:null,pending:null,vaultOwners:[]};
 s.game.privateState.expansion={incomeUsed:false,usedSpecials:[],inspectedCards:[],choiceCards:[],recipients:[]};
 return {...s,game:s.game};
}
function next(s:ReturnType<typeof fixture>){const n=structuredClone(s);n.game.gameRevision++;return n;}
test('v3 basic gold and card acquisition produce exact effects without a legacy action receipt',()=>{
 const a=fixture(),gold=next(a);gold.game.playerStates[0]!.gold+=3;
 assert.match(deriveCityImpacts(a,gold).find(e=>e.cue==='COIN_GAIN')!.message,/3개/);
 const cards=next(a);cards.game.privateState.hand.push({...cards.game.privateState.hand[0]!,cardId:parse(CityBuildingCardIdSchema,'new-private-card')});cards.game.playerStates[0]!.handCount++;
 const events=deriveCityImpacts(a,cards);assert.equal(events.filter(e=>e.cue==='DRAW').length,1);assert.doesNotMatch(JSON.stringify(events),/new-private-card/);
});
test('v3 library and special card gains batch multiple cards into one draw effect',()=>{
 const a=fixture(),b=next(a);for(let i=0;i<3;i++)b.game.privateState.hand.push({...a.game.privateState.hand[0]!,cardId:parse(CityBuildingCardIdSchema,`private-${i}`)});b.game.playerStates[0]!.handCount+=3;
 const events=deriveCityImpacts(a,b);assert.equal(events.filter(e=>e.cue==='DRAW').length,1);assert.match(events.find(e=>e.cue==='DRAW')!.message,/3장/);
});
test('v3 thief gold transfer is distinct from normal income and is private to the involved players',()=>{
 const a=fixture();a.game.expansion!.robbedRole='CR-04';a.game.revealedRoles=[{roundNumber:1,roleId:'CR-02',playerId:a.self.playerId,kind:'NORMAL'}];
 const b=next(a);b.game.window.activeRoleId='CR-04';b.game.window.actionId=parse(CityActionIdSchema,'next-role');b.game.window.activePlayerId=parse(PlayerIdSchema,'P1');b.game.playerStates[1]!.gold=0;b.game.playerStates[0]!.gold+=2;
 assert.equal(deriveCityImpacts(a,b).filter(e=>e.cue==='STEAL').length,1);assert.equal(deriveCityImpacts(a,b).filter(e=>e.cue==='COIN_GAIN').length,0);
 a.self.playerId=parse(PlayerIdSchema,'P2');b.self.playerId=a.self.playerId;assert.equal(deriveCityImpacts(a,b).filter(e=>e.cue==='STEAL').length,0);
});
test('v3 spy uses theft sound, ordinary construction payments never do',()=>{
 const a=fixture();a.game.expansion!.settings.roles[1]='SPY';a.game.window.activeRoleId='CR-02';const b=next(a);b.game.playerStates[0]!.gold++;b.game.playerStates[1]!.gold--;
 assert.ok(deriveCityImpacts(a,b).some(e=>e.cue==='STEAL'));
 a.game.window.activeRoleId='CR-04';b.game.window.activeRoleId='CR-04';assert.ok(!deriveCityImpacts(a,b).some(e=>e.cue==='STEAL'));
});
test('v3 construction and armory destruction work outside the rank eight turn, transfers are not destruction',()=>{
 const a=fixture(),b=next(a),card={...a.game.privateState.hand[0]!};b.game.playerStates[0]!.builtBuildings.push(card);b.game.privateState.hand=[];
 assert.ok(deriveCityImpacts(a,b).some(e=>e.cue==='BUILD'));
 const c=next(b);c.game.playerStates[0]!.builtBuildings=[];assert.ok(deriveCityImpacts(b,c).some(e=>e.cue==='BREAK'));
 c.game.playerStates[1]!.builtBuildings=[card];assert.ok(!deriveCityImpacts(b,c).some(e=>e.cue==='BREAK'));
});
test('v3 gain sounds are never replayed after reconnect, duplicate snapshots or revision gaps',()=>{
 const a=fixture(),b=next(a);b.game.playerStates[0]!.gold+=2;const tracker=createCityImpactTracker();assert.deepEqual(tracker.accept(a),[]);assert.equal(tracker.accept(b).length,1);assert.deepEqual(tracker.accept(b),[]);tracker.reset();assert.deepEqual(tracker.accept(b),[]);const gap=next(b);gap.game.gameRevision++;gap.game.playerStates[0]!.gold+=2;assert.deepEqual(tracker.accept(gap),[]);
});
test('both expanded playing and finished routes retain the impact boundary and sound unlock hook',()=>{
 const app=readFileSync(new URL('../../src/App.tsx',import.meta.url),'utf8');
 const routes=app.split('\n').filter(line=>line.includes('game.expansion) return'));
 assert.equal(routes.length,2);for(const line of routes)assert.match(line,/<CityImpactLayer.*<CityExpandedScreen.*<\/CityImpactLayer>/);
 const screen=readFileSync(new URL('../../src/features/city-role/CityExpandedScreen.tsx',import.meta.url),'utf8');assert.match(screen,/useCitySound\(s, null, !connected, true\)/);
});
