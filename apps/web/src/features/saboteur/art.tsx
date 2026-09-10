import { saboteurConnections,type SaboteurPath,type SaboteurTool,type SaboteurCard } from '@hangul-rummikub/shared';
import type { CSSProperties } from 'react';
export const TOOL_NAMES:Record<SaboteurTool,string>={PICKAXE:'곡괭이',LANTERN:'등불',CART:'수레'};
export function ToolArt({tool,broken=false}:{tool:SaboteurTool;broken?:boolean}){
 return <svg viewBox="0 0 80 80" role="img" aria-label={`${TOOL_NAMES[tool]} ${broken?'고장':'정상'}`} className="sab-tool-art">
  {tool==='PICKAXE'?<><path d="M25 66 55 15" stroke="#442518" strokeWidth="11" strokeLinecap="round"/><path d="M25 65 54 16" stroke="#b58048" strokeWidth="6" strokeLinecap="round"/><path d="M15 22Q38 3 68 28L65 36Q44 20 19 30Z" fill="#a6b7b4" stroke="#344747" strokeWidth="3"/><path d="M20 24Q39 10 62 27" fill="none" stroke="#ecede2" strokeWidth="2"/></>:tool==='LANTERN'?<><path d="M30 17C29 1 51 1 50 17" fill="none" stroke="#a78543" strokeWidth="5"/><path d="M22 22H58L64 64H16Z" fill="#604422" stroke="#dbb65d" strokeWidth="3"/><path d="M27 28H53L57 58H23Z" fill={broken?'#4c443c':'#ffc75b'}/><path d="M39 30V55M23 64H57M25 18H55" stroke="#ac8440" strokeWidth="6"/>{!broken&&<ellipse cx="38" cy="44" rx="7" ry="12" fill="#fff4b4"/>}</>:<><path d="M9 23H68L61 55H19Z" fill="#905f37" stroke="#402c20" strokeWidth="4"/><path d="M17 34H64M20 45H62M27 26 32 52M51 26 48 52" stroke="#d19d60" strokeWidth="3"/><path d="M16 21Q28 10 36 18Q49 4 61 20" fill="#686b68" stroke="#383d3c" strokeWidth="4"/><circle cx="25" cy="62" r="9" fill="#252b2a" stroke="#a5a7a0" strokeWidth="4"/><circle cx="57" cy="62" r="9" fill="#252b2a" stroke="#a5a7a0" strokeWidth="4"/></>}
  {broken&&<><path d="m15 12 52 55M65 12 15 65" stroke="#321410" strokeWidth="10"/><path d="m15 12 52 55M65 12 15 65" stroke="#ee735c" strokeWidth="6" strokeLinecap="round"/></>}
 </svg>;
}
export function PathArt({path,rotation=0,start=false}:{path:SaboteurPath;rotation?:0|180;start?:boolean}){
 const groups=saboteurConnections(path,rotation),points={N:[50,0],E:[100,66],S:[50,132],W:[0,66]} as const;
 return <svg viewBox="0 0 100 132" className="sab-path-art" aria-hidden="true"><rect width="100" height="132" rx="5" fill="#302c25"/>
  <image href="/images/saboteur/atlas.png" x="-100" y="-132" width="300" height="264" preserveAspectRatio="none" opacity=".85"/>
  {[28,21,14].map((width,layer)=><g key={width} stroke={['#181b18','#675b43','#c1a879'][layer]} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round">{groups.map((group,i)=>group.map(d=>{const [x,y]=points[d];const dead=path.startsWith('DEAD_'),endX=dead?(x===0?23:x===100?77:50):50,endY=dead?(y===0?37:y===132?95:66):66;return <path key={`${i}-${d}`} d={`M${x} ${y}L${endX} ${endY}`}/>;}))}</g>)}
  {path.startsWith('DEAD_')&&<g stroke="#927d59" strokeWidth="2" opacity=".6"><path d="m38 53 8 5-6 7m20 9 4-9-8-5"/></g>}
  {start&&<g stroke="#42321f" strokeWidth="5"><path d="M39 35V96M61 35V96"/><path d="M39 42H61M39 57H61M39 73H61M39 89H61" stroke="#eac681" strokeWidth="4"/></g>}
 </svg>;
}
export function Atlas({panel,className=''}:{panel:'MINER'|'SABOTEUR'|'GOLD'|'TOOLS'|'STONE'|'WOOD';className?:string}){
 const pos={MINER:'0% 0%',SABOTEUR:'50% 0%',GOLD:'100% 0%',TOOLS:'0% 100%',STONE:'50% 100%',WOOD:'100% 100%'};
 return <span aria-hidden="true" className={`sab-atlas ${className}`} style={{backgroundPosition:pos[panel]} as CSSProperties}/>;
}
export function cardLabel(c:SaboteurCard):string{return c.kind==='PATH'?(c.path.startsWith('DEAD_')?'막다른 길':'통로 카드'):c.kind==='BREAK'?`${TOOL_NAMES[c.tool]} 고장`:c.kind==='REPAIR'?`${c.tools.map(t=>TOOL_NAMES[t]).join(' / ')} 수리`:c.kind==='MAP'?'보물 지도':'낙석';}
export function CardArt({card,rotation=0}:{card:SaboteurCard;rotation?:0|180}){
 if(card.kind==='PATH')return <PathArt path={card.path} rotation={rotation}/>;
 return <span className={`sab-action-art sab-action-${card.kind}`}><span className="sab-card-rivet"/>
  {card.kind==='BREAK'?<ToolArt tool={card.tool} broken/>:card.kind==='REPAIR'?<span className="sab-repair-tools">{card.tools.map(t=><ToolArt key={t} tool={t}/>)}<span className="sab-repair-plus">+</span></span>:card.kind==='MAP'?<svg viewBox="0 0 100 120" aria-hidden="true"><path d="m14 23 26-7 25 9 21-5-7 77-24 9-25-10-20 7Z" fill="#debd7d" stroke="#6e4d2a" strokeWidth="4"/><path d="m40 16-10 80m35-71-10 81" stroke="#a78043" strokeWidth="2"/><path d="m25 76 13-30 20 30 11-30" stroke="#845233" strokeWidth="3" strokeDasharray="4 4" fill="none"/><path d="m63 35 16 18m-17-1 17-17" stroke="#a43e2b" strokeWidth="5"/></svg>:<svg viewBox="0 0 100 120" aria-hidden="true"><path d="m12 77 19-25 24 3 12 35-22 14-31-8Zm43-51 20-8 16 21-12 20-23-6Z" fill="#6c716c" stroke="#252e2a" strokeWidth="4"/><path d="m31 52 9 26 27 12M55 26l18 16 18-3" fill="none" stroke="#afb1a0" strokeWidth="3"/><path d="m25 16-4 22m24-29-7 22m45 40 2 22" stroke="#db9b52" strokeWidth="3"/></svg>}
  <span className="sab-action-caption">{cardLabel(card)}</span></span>;
}
