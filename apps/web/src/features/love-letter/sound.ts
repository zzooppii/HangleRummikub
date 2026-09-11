import {useEffect,useRef,useState} from 'react';
import type {LoveLetterProjection} from '@hangul-rummikub/shared';
export type CourtCue='SELECT'|'PAPER'|'PLAY'|'SECRET'|'SHIELD'|'DUEL'|'OUT'|'TURN'|'ROUND'|'WIN'|'ERROR';
export function courtTransitionCues(previous:LoveLetterProjection|null,next:LoveLetterProjection|null,self:string):CourtCue[]{
 if(!previous||!next||previous.gameId!==next.gameId||next.gameRevision<=previous.gameRevision)return [];
 if(next.phase==='FINISHED')return next.result.reason==='TOKENS'&&next.result.winnerPlayerIds.some(id=>id===self)?['WIN']:['ROUND'];
 if(next.phase==='ROUND_RESULT'&&previous.phase!=='ROUND_RESULT')return ['ROUND'];
 const cues:CourtCue[]=[];
 const e=next.history.at(-1),old=previous.history.at(-1);
 if(e&&(previous.roundId!==next.roundId||e.sequence!==old?.sequence))cues.push(e.eliminatedPlayerIds.length?'OUT':e.rank===4?'SHIELD':e.rank===3?'DUEL':e.rank===6?'PAPER':'PLAY');
 if(next.phase==='PLAYING'&&next.activePlayerId===self&&(previous.phase!=='PLAYING'||previous.activePlayerId!==self||previous.roundId!==next.roundId))cues.push('TURN');
 return cues;
}
const notes:Record<CourtCue,readonly number[]>={SELECT:[720],PAPER:[420],PLAY:[240,360],SECRET:[880,1320],SHIELD:[523,784,1046],DUEL:[185,196],OUT:[330,220,146],TURN:[659,880],ROUND:[440,554,659],WIN:[523,659,784,1046],ERROR:[196,174]};
/** Synthesized paper friction plus a soft wooden/card impact; no network audio dependency. */
export class CourtAudio{
 private context:AudioContext|null=null;private master:GainNode|null=null;
 volume=.45;enabled=true;
 async unlock():Promise<void>{try{if(!this.context&&typeof window!=='undefined'&&typeof window.AudioContext==='function'){this.context=new window.AudioContext();this.master=this.context.createGain();this.master.connect(this.context.destination);this.setLevel(this.enabled,this.volume);}if(this.context?.state==='suspended')await this.context.resume();}catch{/* Autoplay or device unavailability must not block play. */}}
 setLevel(enabled:boolean,volume:number){this.enabled=enabled;this.volume=volume;if(this.context&&this.master)this.master.gain.setTargetAtTime(enabled?volume:0,this.context.currentTime,.015);}
 play(cues:readonly CourtCue[]){const c=this.context,m=this.master;if(!c||!m||c.state!=='running'||!this.enabled)return;
  try{let start=c.currentTime+.008;
   for(const cue of cues){
    if(['SELECT','PAPER','PLAY'].includes(cue)){
     const duration=cue==='PAPER'?.22:.075,buffer=c.createBuffer(1,Math.ceil(c.sampleRate*duration),c.sampleRate),data=buffer.getChannelData(0);let seed=173;
     for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=(seed/2147483647*2-1)*Math.pow(1-i/data.length,2);}
     const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=cue==='PLAY'?600:2200;filter.Q.value=.6;gain.gain.value=.24;source.connect(filter);filter.connect(gain);gain.connect(m);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start(start);
    }
    for(const [i,hz] of notes[cue].entries()){
     const at=start+i*.09,duration=cue==='SELECT'?.045:cue==='WIN'?.65:.25;
     const osc=c.createOscillator(),gain=c.createGain();osc.type=cue==='DUEL'?'triangle':'sine';osc.frequency.setValueAtTime(hz,at);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(cue==='SELECT'?.08:.15,at+.008);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);osc.connect(gain);gain.connect(m);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration);
    }start+=notes[cue].length*.09+.12;
   }
  }catch{/* Effects are best effort; never alter or reject a game action. */}
 }
 dispose(){const c=this.context;this.context=null;this.master=null;if(c&&c.state!=='closed')void c.close().catch(()=>undefined);}
}
const key='love-letter:audio';
export function useCourtSound(game:LoveLetterProjection|null,self:string,connected:boolean){
 const audio=useRef<CourtAudio|null>(null),previous=useRef<LoveLetterProjection|null>(null);
 const [enabled,setEnabled]=useState(true),[volume,setVolume]=useState(.45);
 useEffect(()=>{audio.current=new CourtAudio();try{const pref:unknown=JSON.parse(localStorage.getItem(key)??'null');if(pref&&typeof pref==='object'&&'enabled' in pref&&typeof pref.enabled==='boolean')setEnabled(pref.enabled);if(pref&&typeof pref==='object'&&'volume' in pref&&typeof pref.volume==='number'&&Number.isFinite(pref.volume))setVolume(Math.max(0,Math.min(1,pref.volume)));}catch{/* Use defaults when storage is unavailable. */}return()=>{audio.current?.dispose();audio.current=null;};},[]);
 useEffect(()=>{audio.current?.setLevel(enabled,volume);try{localStorage.setItem(key,JSON.stringify({enabled,volume}));}catch{/* Storage is optional. */}},[enabled,volume]);
 useEffect(()=>{if(connected)audio.current?.play(courtTransitionCues(previous.current,game,self));previous.current=connected?game:null;},[game,self,connected]);
 const unlock=()=>{if(enabled)void audio.current?.unlock();};
 const cue=(value:CourtCue)=>{if(enabled)void audio.current?.unlock().then(()=>audio.current?.play([value]));};
 return {enabled,volume,setVolume,toggle:()=>setEnabled(x=>!x),unlock,cue};
}
