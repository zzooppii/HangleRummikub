import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createCaughtScreamSamples, CAUGHT_SCREAM_SECONDS } from "../features/sneaky-lunch/caught-scream.js";
import { LunchAudio } from "../features/sneaky-lunch/sound.js";

test("Caught scream is a short, loud, deterministic waveform without clipping or an OS voice",()=>{
  for(const rate of [22050,44100,48000]) {
    const data=createCaughtScreamSamples(rate);
    assert.equal(data.length,Math.ceil(rate*CAUGHT_SCREAM_SECONDS));
    let peak=0,power=0;for(const value of data){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));power+=value*value;}
    assert.ok(peak>.95&&peak<.97);assert.ok(Math.sqrt(power/data.length)>.35);
    assert.equal(data[0],0);assert.equal(data[data.length-1],0);
    assert.deepEqual(data,createCaughtScreamSamples(rate));
  }
  assert.throws(()=>createCaughtScreamSamples(0));
});

function fakeAudio(t:TestContext,suspended=false) {
  const sources:{started:boolean;stopped:boolean;disconnected:boolean;buffer:{getChannelData():Float32Array}|null}[]=[];
  let resumeNow=()=>{};
  class Context {
    state=suspended?"suspended":"running";sampleRate=22050;destination={};currentTime=0;
    resume(){if(!suspended)return Promise.resolve();return new Promise<void>(resolve=>{resumeNow=()=>{this.state="running";resolve();};});}
    close(){this.state="closed";return Promise.resolve();}
    createBuffer(_channels:number,length:number){const data=new Float32Array(length);return {getChannelData:()=>data};}
    createBufferSource(){const source={buffer:null as {getChannelData():Float32Array}|null,onended:null as (()=>void)|null,started:false,stopped:false,disconnected:false,
      connect(){},start(){this.started=true;},stop(){this.stopped=true;},disconnect(){this.disconnected=true;}};sources.push(source);return source;}
  }
  for(const [key,value] of [["window",{AudioContext:Context}],["AudioContext",Context]] as const) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});
  }
  return {sources,resume:()=>resumeNow()};
}
test("Caught scream plays without speechSynthesis and Sound OFF stops/prevents it",t=>{
  const f=fakeAudio(t),audio=new LunchAudio();audio.enabled=true;audio.unlock();audio.play("CAUGHT");
  assert.equal(f.sources.length,1);assert.equal(f.sources[0]!.started,true);assert.ok(f.sources[0]!.buffer!.getChannelData().length>10000);
  audio.enabled=false;assert.equal(f.sources[0]!.stopped,true);audio.play("CAUGHT");assert.equal(f.sources.length,1);
  audio.enabled=true;audio.play("CAUGHT");assert.equal(f.sources.length,2);audio.close();assert.equal(f.sources[1]!.stopped,true);
});
test("Caught ACK can precede audio resume without dropping its cue",async t=>{
  const f=fakeAudio(t,true),audio=new LunchAudio();audio.enabled=true;audio.unlock();audio.play("CAUGHT");
  assert.equal(f.sources.length,0);f.resume();await Promise.resolve();await Promise.resolve();
  assert.equal(f.sources.length,1);audio.close();
});
test("A pending caught cue is canceled when muted or closed before audio resume",async t=>{
  const f=fakeAudio(t,true),audio=new LunchAudio();audio.enabled=true;audio.unlock();audio.play("CAUGHT");
  audio.enabled=false;f.resume();await Promise.resolve();await Promise.resolve();assert.equal(f.sources.length,0);
  audio.enabled=true;audio.unlock();audio.close();assert.equal(f.sources.length,0);
});
