import { memo, useId } from "react";

/** Hand-drawn, repository-owned classroom scenery. No commercial game assets. */
export const ClassroomBackdrop = memo(function ClassroomBackdrop() {
  const id = useId();
  return <svg className="lunch-room-background" viewBox="0 0 1200 580" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-wall`} x2="0" y2="1"><stop stopColor="#eee3c9"/><stop offset="1" stopColor="#cbd4b7"/></linearGradient>
      <linearGradient id={`${id}-floor`} x2="0" y2="1"><stop stopColor="#a88559"/><stop offset="1" stopColor="#dbb783"/></linearGradient>
      <linearGradient id={`${id}-light`}><stop stopColor="#fff5c4" stopOpacity=".6"/><stop offset="1" stopColor="#fff9d9" stopOpacity="0"/></linearGradient>
    </defs>
    <path d="M0 0h1200v310H0Z" fill={`url(#${id}-wall)`}/>
    <path d="M0 285h1200v295H0Z" fill={`url(#${id}-floor)`}/>
    <path d="M0 208h1200v77H0Z" fill="#9fae91"/><path d="M0 211h1200M0 281h1200" stroke="#708670" strokeWidth="6"/>
    {Array.from({length:21},(_,i)=><path key={i} d={`M${i*60} 218v56`} stroke="#758970" strokeWidth="2" opacity=".3"/>)}
    <g stroke="#765735" fill="none" opacity=".32">
      {[312,352,404,471,552].map(y=><path key={y} d={`M0 ${y}h1200`}/>)}
      {Array.from({length:13},(_,i)=><path key={i} d={`M${240+i*60} 285L${-300+i*150} 580`}/>)}
    </g>
    <path d="M0 0h44v580H0M1200 0h-44v580h44" fill="#3d5140" opacity=".17"/>
    {[54,178].map(x=><g key={x}><rect x={x} y="28" width="106" height="183" rx="3" fill="#739b93" stroke="#827655" strokeWidth="9"/><rect x={x+8} y="37" width="90" height="165" fill="#c5dfd5"/><path d={`M${x+8} 160q30-40 90-15v57h-90Z`} fill="#a1bca0"/><path d={`M${x+8} 177q45-33 90 0v25h-90Z`} fill="#8ba88a"/><path d={`M${x+52} 36v167m-47-84h96`} stroke="#fbefd5" strokeWidth="7"/><path d={`M${x-8} 26h122`} stroke="#625f49" strokeWidth="7"/></g>)}
    <path d="M58 42L900 580H125L55 204Z" fill={`url(#${id}-light)`}/>
    <path d="M56 21q16 22 0 115m225-115q-17 22 0 115" fill="none" stroke="#e3c78e" strokeWidth="20"/>
    <g transform="translate(946 105)"><rect x="-6" y="-6" width="158" height="139" rx="4" fill="#9a7853"/><rect width="146" height="127" fill="#ccb17c"/>{[0,1,2].map(i=><g key={i} transform={`translate(${13+i*41} ${17+i%2*12}) rotate(${i*5-5})`}><rect width="34" height="76" fill={i===1?"#e8c08c":"#f5edcf"}/><circle cx="17" cy="4" r="3" fill="#b26243"/><path d="M6 22h22m-22 8h16m-16 10h22m-22 8h19" stroke="#929879" strokeWidth="2"/></g>)}</g>
    <g transform="translate(1031 47)"><circle r="28" fill="#f9edd2" stroke="#627663" strokeWidth="5"/>{[0,1,2,3].map(i=><path key={i} d="M0-20v5" transform={`rotate(${i*90})`} stroke="#6b785e" strokeWidth="2"/>)}<path d="M0-13V0l11 6" fill="none" stroke="#435c4b" strokeWidth="3"/></g>
    <g transform="translate(1090 239)"><path d="M-21 0h42l-7 43h-29Z" fill="#ba7c53" stroke="#865b42" strokeWidth="3"/><path d="M0 0v-72m0 46q-44-8-24-43Q4-60 0-26m0-18q43-40 42-3Q20-19 0-30" fill="#658164" stroke="#47654e" strokeWidth="3"/></g>
  </svg>;
});

export const TeacherArt = memo(function TeacherArt({state="BOARD"}: {state?:"BOARD"|"SUSPICIOUS"|"WATCHING"|"RETURNING"}) {
  const id=useId();
  return <svg viewBox="0 0 620 320" className={`lunch-teacher-stage teacher-${state.toLowerCase()}`} aria-hidden="true">
    <defs><linearGradient id={`${id}-board`} x2="0" y2="1"><stop stopColor="#315d51"/><stop offset="1" stopColor="#21483e"/></linearGradient><linearGradient id={`${id}-coat`}><stop stopColor="#c9a46f"/><stop offset=".5" stopColor="#dfbd85"/><stop offset="1" stopColor="#b38a5b"/></linearGradient></defs>
    <rect x="33" y="14" width="554" height="211" rx="7" fill="#866544" stroke="#574a34" strokeWidth="4"/>
    <rect x="45" y="25" width="530" height="186" rx="2" fill={`url(#${id}-board)`}/>
    <path d="M55 31h510M55 202h510" stroke="#638272" opacity=".4"/>
    <g stroke="#e0e5c8" strokeWidth="2" fill="none" opacity=".65"><path d="M80 57h79m-79 11h56m-56 27h109m-109 15h72m-72 15h96M442 83l37-35 34 35Zm-17 44h79m-79 14h60m-60 14h87"/><path d="M100 158h30m-15-15v30m32-15h15m20-10q17-9 16 2t-18 19h23M440 185h22m-10-9v18m18-13 9 8 18-23"/></g>
    <g opacity=".2" stroke="#a8c0a5" strokeWidth="12"><path d="M75 185h123m244-86h99"/></g>
    <path d="M30 219h560" stroke="#b2905d" strokeWidth="10"/><path d="M65 214h24" stroke="#f5efce" strokeWidth="4"/><rect x="514" y="207" width="32" height="9" rx="2" fill="#cda472"/>
    <g className="lunch-teacher-body" transform="translate(230 66)">
      <ellipse cx="77" cy="225" rx="66" ry="11" fill="#273e3333"/>
      <path d="M47 155l-8 61h30l9-51 6 51h31l-9-61" fill="#374348"/><path d="M37 213h34v13H27q-1-9 10-13m47 0h32l14 13H84" fill="#293737"/>
      <path d="M37 72q41-29 81 0l12 98q-49 13-105 0Z" fill={`url(#${id}-coat)`} stroke="#665840" strokeWidth="3"/>
      <g className="teacher-back"><path className="lunch-writing-arm" d="M38 77L12 37-3 43l27 61" fill="#d8b47d" stroke="#665840" strokeWidth="3"/><g className="teacher-chalk"><path d="M8 43L-3 24" stroke="#e8b993" strokeWidth="12" strokeLinecap="round"/><path d="M-4 24l-7-13" stroke="#fff9dd" strokeWidth="5" strokeLinecap="round"/></g><path d="M74 80v79m8-70v56m-41-13h20m33 0h22" stroke="#aa855c" strokeWidth="2"/>
        <ellipse className="lunch-teacher-head" cx="78" cy="36" rx="36" ry="43" fill="#42473e"/><path d="M49 25q27-18 58 1" fill="none" stroke="#606355" strokeWidth="5"/>
      </g>
      <g className="teacher-front"><path d="M38 80L14 143m104-63 25 62" stroke="#665840" strokeWidth="20" strokeLinecap="round"/><path d="M38 78L17 138m99-59 22 60" stroke="#cfaa76" strokeWidth="14" strokeLinecap="round"/><path d="M14 144l-2 15m130-15 2 15" stroke="#e6b38c" strokeWidth="13" strokeLinecap="round"/>
        <path d="M44 69l34 56 29-56" fill="#faf0d5"/><path d="M77 90l9 16-10 29-9-29Z" fill="#a95545"/><path d="M43 19q36-32 70 1v34q-5 35-36 35Q46 84 43 54Z" fill="#edbc91" stroke="#665840" strokeWidth="2"/>
        <path d="M41 29Q33-17 80-14q46 0 38 45L102 6Q79 25 41 29" fill="#42473e"/><path d="M51 49h11m30 0h11" stroke="#303e35" strokeWidth="4"/>
        <g stroke="#42473e" strokeWidth="3" fill="none"><rect x="46" y="35" width="28" height="22" rx="6"/><rect x="83" y="35" width="28" height="22" rx="6"/><path d="M74 44h9M51 26l22 4m12 0 20-4M65 70h24"/></g>
      </g>
      {state==="SUSPICIOUS"&&<g className="lunch-teacher-question" fill="#ffe6a1"><path d="M132 20q-4-18 12-18t9 22q-10 7-10 15h-9q0-13 10-20 9-10 0-10-6 0-4 11Z"/><circle cx="138" cy="49" r="5"/></g>}
    </g>
    <g transform="translate(172 269)"><path d="M0 0h279l12 17H-12Z" fill="#d3a56a" stroke="#7a583b" strokeWidth="3"/><path d="M0 17h280v21H0Z" fill="#a7764c"/><path d="M8 35v16m263-16v16" stroke="#765b43" strokeWidth="9"/><path d="M187-12h52v10h-52Z" fill="#80988b"/><path d="M191-17h46v5h-46Z" fill="#ece3c9"/><path d="M27-22h21v22H27Z" fill="#cf8961"/><path d="M34-28v10m7-15v17" stroke="#526958" strokeWidth="3"/></g>
  </svg>;
});

export function NpcDesk({variant=0}: {variant?:number}) {
  return <svg viewBox="0 0 140 115" className="lunch-front-pupil" aria-hidden="true"><ellipse cx="70" cy="108" rx="63" ry="6" fill="#4f49382b"/><path d="M28 89v22m86-22v22" stroke="#6c624a" strokeWidth="7"/><path d="M32 84V48q38-26 76 0v36" fill={variant?"#98a397":"#88a0a0"}/><g className={`lunch-npc npc-${variant}`}><ellipse className="npc-head" cx="70" cy="33" rx="27" ry="30" fill={variant?"#665546":"#484c43"}/><path d="M50 22q20-10 39 0" stroke="#bcbda0" opacity=".2" strokeWidth="4"/></g><path d="M19 73h102l16 23H3Z" fill="#d1a273" stroke="#856747" strokeWidth="3"/><path d="M48 77l23-6 23 6v14l-23-4-23 4Z" fill="#eee7c9"/><path d="M72 74v12" stroke="#abac91"/><path className="npc-pencil" d="M101 83l11-21" stroke="#eac06c" strokeWidth="4"/></svg>;
}
