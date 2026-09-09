import { memo } from "react";

/** Original repo-owned vector scenes. No external art or copied character assets. */
export function LunchboxArt({ remaining = 1, closed = false, small = false }: { remaining?: number; closed?: boolean; small?: boolean }) {
  const food = Math.max(0, Math.min(1, remaining));
  return <svg viewBox="0 0 250 145" className={`lunch-bento-art${small ? " small" : ""}`} aria-hidden="true">
    <ellipse cx="125" cy="128" rx="105" ry="12" fill="#193e3930"/>
    <path d="M15 38Q15 24 31 24H219Q235 24 235 38V111Q235 125 219 125H31Q15 125 15 111Z" fill="#286957" stroke="#203d39" strokeWidth="4"/>
    <rect x="22" y="25" width="206" height="89" rx="16" fill="#f1c26f" stroke="#203d39" strokeWidth="3"/>
    {closed ? <g><rect x="20" y="23" width="210" height="96" rx="16" fill="#e99574" stroke="#203d39" strokeWidth="3"/><path d="M108 24V118M142 24V118" stroke="#f6dfaa" strokeWidth="13"/><circle cx="125" cy="70" r="16" fill="#fff6df"/><path d="M117 71l6 6 12-14" fill="none" stroke="#286957" strokeWidth="4"/></g> : <>
      <rect x="29" y="32" width="113" height="73" rx="11" fill="#ca964e"/><rect x="151" y="32" width="68" height="32" rx="9" fill="#ca964e"/><rect x="151" y="71" width="68" height="34" rx="9" fill="#ca964e"/>
      <g style={{ transformOrigin: "86px 76px", transform: `scale(${Math.sqrt(food)})` }} className="lunch-food"><path d="M39 57Q42 33 78 39Q117 31 132 53L130 94Q92 103 41 93Z" fill="#fff5d9"/>{[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${49 + i * 14} 56l3-4m-3 25l4 1`} stroke="#dfcfa8" strokeWidth="2"/>)}<ellipse cx="85" cy="69" rx="15" ry="12" fill="#d76655"/><path d="M77 65q6-7 13-2" fill="none" stroke="#f7997a" strokeWidth="3"/></g>
      <g style={{ opacity: food, transformOrigin: "185px 69px", transform: `scale(${.3 + .7 * food})` }} className="lunch-food"><path d="M161 42q12-10 18 6q8-13 18-1l11 10h-49Z" fill="#56805d"/>{[0, 1, 2].map(i => <g key={i} transform={`translate(${160 + i * 17} 78)`}><rect width="16" height="19" rx="5" fill="#f4da64" stroke="#a97c30" strokeWidth="1.5"/><path d="M4 7l8 2" stroke="#fff1a4" strokeWidth="3"/></g>)}</g>
    </>}
    {!closed && food>0 && <g className="lunch-food" opacity={food}>
      <g fill="#528454" stroke="#416545" strokeWidth="1"><circle cx="165" cy="48" r="8"/><circle cx="176" cy="44" r="8"/><circle cx="182" cy="51" r="7"/></g>
      <g transform="rotate(-17 204 47)"><rect x="193" y="37" width="17" height="24" rx="8" fill="#c36a47" stroke="#975438" strokeWidth="1.5"/><path d="M197 43l9 3m-9 3 9 3" stroke="#ed9c69" strokeWidth="2"/></g>
    </g>}
    {!small && !closed && <g className="lunch-chopsticks" stroke="#664b36" strokeWidth="5" strokeLinecap="round"><path d="M197 7L96 92"/><path d="M214 10L106 96"/></g>}
  </svg>;
}

export const StudentArt = memo(function StudentArt({ seat = 0, caught = false, winner = false, chewKey = 0 }: { seat?: number; caught?: boolean; winner?: boolean; chewKey?: number }) {
  const colors = ["#de9774", "#73a2b8", "#a59bc2", "#e5bc58", "#6fae94", "#d4889c", "#9aad6c", "#8fa5a8"];
  const hair = ["#403b36", "#725240", "#3f363a", "#695449"];
  const styles = ["M34 34q8-29 35-18l18 20q-20-2-26-15-8 12-27 13", "M32 35q0-35 31-29t27 31L71 24l-3 15-12-18-9 16Z", "M30 33q2-29 31-29t29 31L79 26l-3 11-9-12-8 12-6-11-12 9Z", "M32 39q-8-32 21-36 42-7 36 36L73 23Q55 34 32 39Z", "M31 35Q33 4 63 6t27 29L77 25l-9 10-7-14-10 16-4-13Z", "M31 38Q22 9 60 4q40 0 30 35L74 20Q63 39 31 38Z", "M31 33Q32 8 60 6t30 27L78 17l-8 7-9-10-10 12-9-8Z", "M31 36Q25 3 62 4q31 0 27 32L70 26l-6 13-10-18-9 16Z"];
  return <svg viewBox="0 0 120 108" className={`lunch-student${caught ? " caught" : ""}`} data-avatar-style={seat % 8} aria-hidden="true">
    <path d="M23 107V84q0-24 37-24t37 24v23" fill={colors[seat % 8]} stroke="#263e3b" strokeWidth="3"/>
    <path d="M46 65l14 15 14-15" fill="#fff3d6"/>
    <path d={seat % 2 ? "M33 85h18m18 0h18M33 96h18m18 0h18" : "M37 82v21m46-21v21"} stroke="#fff1cc" opacity=".3" strokeWidth="3"/>
    <g className="lunch-student-head">
      <ellipse cx="60" cy="38" rx="28" ry="32" fill={hair[seat % 4]}/>
      {seat % 3 === 1 && <><circle cx="29" cy="40" r="11" fill={hair[seat % 4]}/><circle cx="91" cy="40" r="11" fill={hair[seat % 4]}/></>}
      <path d="M37 32q23-20 46 0v22q-2 21-23 22Q39 75 37 54Z" fill={seat % 2 ? "#dca380" : "#efbc94"} stroke="#263e3b" strokeWidth="2"/>
      <path d={styles[seat % 8]} fill={hair[seat % 4]}/>
      {seat === 1 && <path d="M80 24l12-7v17Z" fill="#edc16d"/>}
      {seat === 5 && <path d="M37 21q23-17 46 0" fill="none" stroke="#afc6a0" strokeWidth="5"/>}
      <ellipse cx="41" cy="57" rx="5" ry="3" fill="#d88575" opacity=".55"/><ellipse cx="79" cy="57" rx="5" ry="3" fill="#d88575" opacity=".55"/>
      {caught ? <g stroke="#4a3533" strokeWidth="2.5"><path d="M45 44l7 7m0-7-7 7m22-7 7 7m0-7-7 7"/><ellipse cx="60" cy="60" rx="4" ry="6" fill="#8f5f51"/></g> : <g stroke="#3c3331" strokeWidth="2.5" strokeLinecap="round"><path d="M48 46v3m24-3v3"/><path key={chewKey} className={chewKey ? "lunch-chew" : undefined} d="M54 59q6 6 12 0" fill="none"/></g>}
      {seat % 4 === 2 && <g fill="none" stroke="#293d39" strokeWidth="2"><circle cx="48" cy="47" r="8"/><circle cx="72" cy="47" r="8"/><path d="M56 47h8"/></g>}
    </g>
    {winner && <path d="M60 1l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1Z" fill="#f4c95f" stroke="#715b35" strokeWidth="2"/>}
    <path d="M8 91h104l5 13H3Z" fill="#d29e6b" stroke="#263e3b" strokeWidth="3"/>
    {caught && <path className="lunch-slumped-arms" d="M30 91q14-6 29 7m32-7q-15-6-29 7" fill="none" stroke={colors[seat%8]} strokeWidth="12" strokeLinecap="round"/>}
  </svg>;
});

export const ClassroomArt = memo(function ClassroomArt({ state = "BOARD" }: { state?: "BOARD" | "SUSPICIOUS" | "WATCHING" | "RETURNING" }) {
  return <svg viewBox="0 0 760 340" className={`lunch-classroom-art teacher-${state.toLowerCase()}`} aria-hidden="true">
    <path d="M0 0h760v340H0" fill="#f6e8c7"/><path d="M0 246h760v94H0Z" fill="#d7b991"/>
    <g stroke="#b39168" strokeWidth="2" opacity=".55"><path d="M0 291h760M0 329h760M160 246L70 340M285 246l-40 94m240-94 40 94m90-94 90 94"/></g>
    <rect x="38" y="29" width="82" height="153" rx="4" fill="#b9dcd5" stroke="#a0815b" strokeWidth="9"/><path d="M79 27v156M39 90h80" stroke="#fffae8" strokeWidth="7"/><path d="M48 162l48-46 16 8v49Z" fill="#91bca3"/>
    <path d="M121 51L230 245H63Z" fill="#fffcde" opacity=".4"/>
    <rect x="156" y="24" width="449" height="179" rx="6" fill="#b48654" stroke="#5f4d39" strokeWidth="3"/>
    <rect x="167" y="34" width="426" height="155" rx="3" fill="#285951"/><path d="M180 179h400" stroke="#436d5f" strokeWidth="4"/>
    <g fill="none" stroke="#bcd2b5" strokeWidth="2.2" opacity=".65"><path d="M201 72h133m-128 27h69m-69 18h94m203-48 52 43h-78Zm21 62h59m-59 12h45"/><path d="M220 51h19m-10-9v18M284 48q11-10 17 0t-17 16h19"/></g>
    <path d="M176 201h414" stroke="#734f35" strokeWidth="8"/><path d="M220 196h14" stroke="#f8f2d9" strokeWidth="5"/>
    <g transform="translate(658 69)"><circle r="30" fill="#fff9e8" stroke="#7f7561" strokeWidth="5"/><path d="M0-21V0l13 8" fill="none" stroke="#42554a" strokeWidth="3"/></g>
    <g transform="translate(650 129) rotate(4)"><rect width="72" height="80" rx="2" fill="#e9ae83"/><path d="M17 17h39M17 28h31M17 39h39m-35 18h31" stroke="#926b50" strokeWidth="3"/></g>
    <g className="lunch-teacher" transform="translate(323 54)">
      <ellipse cx="59" cy="181" rx="50" ry="9" fill="#30443826"/>
      <path d="M37 125l-6 52h23l6-44 6 44h23l-9-52" fill="#394647"/><path d="M29 175h29v9H25m40-9h27l8 9H65" fill="#283735"/>
      <path d="M29 60q30-20 60 0l13 79H18Z" fill="#b89b70" stroke="#42483c" strokeWidth="3"/>
      <g className="teacher-back"><path d="M29 62L7 29l-11 8 22 51" fill="#b89b70" stroke="#42483c" strokeWidth="3"/><path className="teacher-chalk" d="M4 34l-8-15" stroke="#fff5de" strokeWidth="5" strokeLinecap="round"/><path d="M50 67v62m10-56v50" stroke="#947d5d" strokeWidth="2"/><ellipse cx="58" cy="31" rx="29" ry="34" fill="#434740"/><path d="M34 29q25-14 50 0" stroke="#596052" strokeWidth="4" fill="none"/></g>
      <g className="teacher-front"><path d="M30 72L9 116m80-44 16 44" stroke="#42483c" strokeWidth="16" strokeLinecap="round"/><path d="M31 61l28 47 27-47" fill="#f4edce"/><path d="M58 78l9 19-8 18-8-18Z" fill="#a8614e"/>
        <path d="M34 22q24-24 49 0v27q-5 25-25 25Q36 69 34 49Z" fill="#e8b48c" stroke="#42483c" strokeWidth="3"/>
        <path d="M29 30q-2-35 32-33 32-1 28 36L76 17q-27 16-47 13" fill="#434740"/>
        <g stroke="#3d453e" strokeWidth="3" fill="none"><rect x="34" y="35" width="20" height="14" rx="4"/><rect x="63" y="35" width="20" height="14" rx="4"/><path d="M54 41h9m-22-14 14 3m8 0 14-3M50 59h18"/></g>
      </g>
    </g>
    <g transform="translate(250 221)"><path d="M0 0h239v19H0Z" fill="#b88152" stroke="#624f3d" strokeWidth="3"/><path d="M9 19v43m221-43v43" stroke="#70563e" strokeWidth="8"/><path d="M183-14h34v13h-34Z" fill="#6f9b8d"/><path d="M161-20v19m6-23-6 23" stroke="#b26c4e" strokeWidth="3"/></g>
    {[145, 558].map((x, i) => <g className={`lunch-npc npc-${i}`} key={x} transform={`translate(${x} 226)`}>
      <path d="M-26 70V38q26-22 52 0v32" fill={i ? "#a5a29b" : "#8ca5a3"}/><ellipse className="npc-head" cy="17" rx="22" ry="26" fill="#645b4d"/><path d="M-33 64h68l13 14h-92Z" fill="#c99366" stroke="#7f6d53" strokeWidth="2"/><path d="M-14 62l13-6 16 6v13l-16-5-13 5Z" fill="#f9eecd"/><path className="npc-pencil" d="M19 62l8-15" stroke="#d2a74e" strokeWidth="4"/>
    </g>)}
  </svg>;
});
