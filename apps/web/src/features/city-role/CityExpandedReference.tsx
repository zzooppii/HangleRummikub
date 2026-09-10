import { useEffect, useId, useRef, useState } from 'react';
import type { CityRoleFinishedPlatformSnapshotV2, CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityExpandedHelp } from './CityExpandedHelp.js';
import { CityExpandedCatalog } from './CityExpandedCatalog.js';

type Snapshot = CityRolePlayingPlatformSnapshotV2 | CityRoleFinishedPlatformSnapshotV2;
type Reference = 'RULES' | 'CATALOG';

/** Native dialog keeps focus inside the reference; the game and its timer stay mounted. */
function ReferenceDialog({ mode, snapshot, onDismiss }: Readonly<{ mode: Reference; snapshot: Snapshot; onDismiss(): void }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    headingRef.current?.focus();
    return () => {
      dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const title = mode === 'RULES' ? '게임 방법' : '이번 게임의 직업과 특수 건물 14종';
  return <dialog ref={dialogRef} className="city-help-dialog city-reference-dialog" aria-modal="true" aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); onDismiss(); }}>
    <header className="city-help-header"><h2 id={headingId} ref={headingRef} tabIndex={-1}>{title}</h2><button type="button" aria-label={`${title} 닫기`} onClick={onDismiss}>닫기 ×</button></header>
    <div className="city-help-scroll">
      {snapshot.game.phase !== 'FINISHED' && <p className="city-help-timer">설명을 보는 동안에도 게임 시간은 계속 흐릅니다.</p>}
      {mode === 'RULES' ? <CityExpandedHelp selectionSeconds={snapshot.game.expansion?.settings.selectionSeconds ?? 45} /> : <CityExpandedCatalog snapshot={snapshot} />}
    </div>
  </dialog>;
}

export function CityExpandedReference({ snapshot }: Readonly<{ snapshot: Snapshot }>) {
  const [mode, setMode] = useState<Reference | null>(null);
  return <div className="city-expanded-reference">
    <button type="button" aria-label="게임 방법 보기" aria-haspopup="dialog" onClick={() => setMode('RULES')}>게임 방법</button>
    <button type="button" aria-label="이번 게임의 직업과 특수 건물 14종 보기" aria-haspopup="dialog" onClick={() => setMode('CATALOG')}>직업·특수 건물</button>
    {mode !== null && <ReferenceDialog mode={mode} snapshot={snapshot} onDismiss={() => setMode(null)} />}
  </div>;
}
