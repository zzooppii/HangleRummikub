import test from "node:test";
import assert from "node:assert/strict";
import { createSneakyLunch, transitionTeacher, parseSneakyLunchState, eatLunch, forfeitLunch, forfeitLunchBatch, type SneakyLunchState } from "../games/sneaky-lunch/domain/game.js";

function start(n: number) {
  const s = createSneakyLunch({ gameId: "placement", playerIds: Array.from({length:n}, (_,i)=>`p${i}`), settings:{lunchboxCount:1,difficulty:"EASY"}, now:0, transitionId:"countdown" });
  return transitionTeacher(s,"countdown",3000,"board",{durationMs:7500,outcome:null});
}
function complete(s: SneakyLunchState, id: string) {
  for(let i=0;i<30;i++) s=eatLunch(s,id,s.teacherStateRevision,3000+i*150).state;
  return s;
}
for(const count of [2,3,4,8]) test(`Lunch v2 ${count} sequential placements, immutable first and automatic last`,()=>{
  let s=start(count);
  for(let i=0;i<count-1;i++) {
    s=complete(s,`p${i}`);
    assert.equal(s.phase,i===count-2?"FINISHED":"CLASSROOM");
    assert.equal(s.placementOrder?.[i],`p${i}`);
    if(s.phase!=="FINISHED") {
      assert.equal(eatLunch(s,`p${i}`,s.teacherStateRevision,8000).outcome,"NOT_ACTIVE");
      assert.deepEqual(forfeitLunch(s,`p${i}`,8000),s);
    }
    s=parseSneakyLunchState(JSON.parse(JSON.stringify(s)));
  }
  assert.deepEqual(s.placementOrder,Array.from({length:count},(_,i)=>`p${i}`));
  assert.equal(s.players[count-1]!.completedBites,0);
  assert.equal(s.result?.winnerPlayerId,"p0"); assert.equal(s.result?.reason,"PLACEMENT_COMPLETE");
  assert.equal(s.nextTransitionAt,null);
  assert.deepEqual(eatLunch(s,"p0",s.teacherStateRevision,9000).state,s);
});
test("Lunch v2 catch last rival ends immediately; survivor need not eat",()=>{
  let s=start(2);
  s=transitionTeacher(s,"board",10500,"suspicious",{durationMs:900,outcome:"REAL"});
  s=transitionTeacher(s,"suspicious",11400,"watching",{durationMs:1600,outcome:null});
  const before=JSON.stringify(s), result=eatLunch(s,"p0",s.teacherStateRevision,11400);
  assert.equal(JSON.stringify(s),before); assert.equal(result.outcome,"CAUGHT");
  assert.equal(result.state.revision,s.revision+1);
  assert.deepEqual(result.state.placementOrder,["p1"]);
  assert.deepEqual(result.state.result,{reason:"LAST_PLAYER_STANDING",winnerPlayerId:"p1"});
});
test("Lunch v2 existing winner survives later elimination and placed cannot forfeit",()=>{
  let s=complete(start(4),"p2");
  s=forfeitLunch(s,"p0",8000); s=forfeitLunch(s,"p1",8000);
  assert.deepEqual(s.placementOrder,["p2","p3"]); assert.equal(s.result?.winnerPlayerId,"p2");
  assert.equal(s.result?.reason,"LAST_PLAYER_STANDING");
});
test("Lunch v2 simultaneous offline batch has no phantom survivor; all eliminated ends",()=>{
  const s=start(3), next=forfeitLunchBatch(s,["p0","p1","p2"],8000);
  assert.equal(next.revision,s.revision+1); assert.deepEqual(next.placementOrder,[]);
  assert.deepEqual(next.result,{reason:"TEACHER_WIN",winnerPlayerId:null});
  const placed=complete(start(3),"p0"), rest=forfeitLunchBatch(placed,["p1","p2"],8000);
  assert.equal(rest.result?.winnerPlayerId,"p0"); assert.deepEqual(rest.placementOrder,["p0"]);
});
test("Lunch v2 validator rejects missing, duplicate, fabricated and legacy placements",()=>{
  const s=complete(start(4),"p0");
  for(const placementOrder of [undefined,["p0","p0"],["p1"],["stranger"]]) assert.throws(()=>parseSneakyLunchState({...s,placementOrder}));
  assert.throws(()=>parseSneakyLunchState({...s,rulesVersion:"sneaky-lunch-rules-v1"}));
  assert.deepEqual(parseSneakyLunchState(JSON.parse(JSON.stringify(s))),s);
});
