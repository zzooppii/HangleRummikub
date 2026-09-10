import { useEffect, useRef } from "react";

/** Only a newly confirmed catch of this viewer opens this brief original comic close-up. */
export function CaughtImpact({onClose}:{onClose():void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  return <dialog ref={dialog} className="lunch-caught-closeup" aria-labelledby="lunch-shout" onCancel={e=>{e.preventDefault();onClose();}}>
    <div className="lunch-shout-rays" aria-hidden="true"/>
    <svg viewBox="0 0 600 650" aria-hidden="true" className="lunch-shouting-teacher">
      <path d="M20 650Q10 370 170 347L300 401 430 347Q590 370 580 650Z" fill="#5e5848" stroke="#1c2028" strokeWidth="12"/>
      <path d="M168 352L300 575 432 352 337 383 300 440 263 383Z" fill="#e9d8ae"/>
      <path d="M300 419l26 34-12 28 33 111-47 43-47-43 33-111-12-28Z" fill="#822c30" stroke="#241d28" strokeWidth="5"/>
      <ellipse cx="161" cy="225" rx="30" ry="43" fill="#cb8566"/><ellipse cx="439" cy="225" rx="30" ry="43" fill="#cb8566"/>
      <path d="M159 144Q173 46 300 48T441 144L424 284Q398 390 300 407 202 390 176 284Z" fill="#e2a07b" stroke="#261f29" strokeWidth="9"/>
      <path d="M151 191Q92 43 228 15 352-24 431 45 476 84 446 189L403 124 364 65Q282 152 151 191Z" fill="#24252d"/>
      <path d="M201 155l74 29m124-29-74 29" stroke="#29242b" strokeWidth="17" strokeLinecap="round"/>
      <g fill="#eee0c8" stroke="#27222a" strokeWidth="8"><path d="M183 184h98v64h-89Z"/><path d="M319 184h98l-9 64h-89Z"/></g>
      <path d="M281 206h38" stroke="#27222a" strokeWidth="9"/>
      <ellipse cx="248" cy="214" rx="9" ry="14" fill="#35252d"/><ellipse cx="352" cy="214" rx="9" ry="14" fill="#35252d"/>
      <path d="M300 211l-15 54h29" fill="none" stroke="#a26554" strokeWidth="6"/>
      <path d="M237 305Q300 276 363 305L351 351Q300 390 249 351Z" fill="#391d29" stroke="#722f37" strokeWidth="7"/>
      <path d="M243 307q57-21 114 0l-7 15H250Z" fill="#fff1d1"/><path d="M267 357q33-29 66 0" fill="#bf5762"/>
      <path d="M116 362l-44 75 91 80M484 362l44 75-91 80" fill="none" stroke="#aaa079" strokeWidth="17"/>
    </svg>
    <h2 id="lunch-shout">야!!</h2><p>도시락은 점심시간에 먹어!</p>
    <button onClick={onClose}>놀랐잖아요… · 닫기</button>
  </dialog>;
}
