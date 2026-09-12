import { CLUE_SUSPECTS, CLUE_WEAPONS, CLUE_ROOMS, CLUE_LABELS, type ClueCardKey } from "@hangul-rummikub/shared";
import type { CSSProperties } from "react";
export function clueArtStyle(card:ClueCardKey):CSSProperties {
  const suspect=CLUE_SUSPECTS.findIndex(k=>k===card),weapon=CLUE_WEAPONS.findIndex(k=>k===card),room=CLUE_ROOMS.findIndex(k=>k===card);
  const index=suspect>=0?suspect:weapon>=0?weapon:room,rows=room>=0?3:2;
  if(room>=0){
    // The illustrated atlas has uneven row heights; crop each room inside its own painted bounds.
    const columns=[[.005,.33],[.337,.663],[.67,.995]] as const;
    const bands=[[.005,.308],[.319,.631],[.642,.995]] as const;
    const [left,right]=columns[room%3]!,[top,bottom]=bands[Math.floor(room/3)]!;
    const width=right-left,height=bottom-top;
    return {backgroundImage:'url("/images/clue/rooms-bonus.webp")',backgroundSize:100/width+'% '+100/height+'%',backgroundPosition:left/(1-width)*100+'% '+top/(1-height)*100+'%'};
  }
  return {backgroundImage:'url("/images/clue/'+(suspect>=0?'suspects':weapon>=0?'objects':'rooms')+'.webp")',backgroundSize:'300% '+rows*100+'%',backgroundPosition:(index%3)*50+'% '+Math.floor(index/3)*100/(rows-1)+'%'};
}
export function ClueArt({card,className=""}:{card:ClueCardKey;className?:string}){return <span className={"cl-art "+className} style={clueArtStyle(card)} role="img" aria-label={CLUE_LABELS[card]+" 일러스트"}/>;}
export function ClueCardFace({card,small=false}:{card:ClueCardKey;small?:boolean}){return <span className={"cl-card-face"+(small?" cl-card-small":"")}><ClueArt card={card}/><span className="cl-card-caption">{CLUE_LABELS[card]}</span></span>;}
