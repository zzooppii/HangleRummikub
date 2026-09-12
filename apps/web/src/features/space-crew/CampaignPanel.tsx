import { useEffect, useState } from "react";
import type { SpaceCrewStartPayload } from "@hangul-rummikub/shared";
import { createBrowserSpaceCrewCampaignStorage, type SpaceCrewSavedCampaign } from "./campaign-storage.js";
import { getSpaceCrewMissionCopy } from "./mission-copy.js";

export function CampaignPanel({ canStart, onStart, currentMission, campaignId }: {
  canStart: boolean; onStart(payload: SpaceCrewStartPayload): Promise<void>; currentMission?: number; campaignId?: string;
}) {
  const [storage] = useState(createBrowserSpaceCrewCampaignStorage);
  const [entries, setEntries] = useState<readonly SpaceCrewSavedCampaign[]>([]);
  const [mode, setMode] = useState<"CAMPAIGN" | "PRACTICE" | "RESUME">("CAMPAIGN");
  const [mission, setMission] = useState(1);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [exportText, setExportText] = useState("");
  useEffect(() => { let live = true; void storage.list().then(result => {
    if (!live) return;
    if (result.ok) setEntries(result.value);
    else setMessage("이 브라우저에 복구 정보를 보관할 수 없습니다. 브라우저 저장 공간 설정을 확인해주세요.");
  }); return () => { live = false; }; }, [storage]);
  useEffect(() => {
    if (campaignId && currentMission) void storage.updateMetadata(campaignId, { missionNumber: currentMission });
  }, [storage, campaignId, currentMission]);
  async function create() {
    if (!canStart || busy || mode === "RESUME") return;
    setBusy(true); setMessage(null);
    try {
      const saved = await storage.create({ mode, ...(mode === "PRACTICE" ? { missionNumber: mission } : {}), ...(label.trim() ? { label: label.trim() } : {}) });
      if (!saved.ok) { setMessage("안전하게 복구 정보를 저장하지 못했습니다. 브라우저 저장 공간과 보안 연결을 확인해주세요."); return; }
      setEntries(old => [...old, saved.value]);
      await onStart(mode === "CAMPAIGN" ? { kind: "NEW", mode, recoveryToken: saved.value.recoveryToken }
        : { kind: "NEW", mode, missionNumber: mission, recoveryToken: saved.value.recoveryToken });
    } catch { setMessage("시작 결과를 확인해주세요. 응답이 늦으면 위의 ‘같은 요청 결과 재확인’을 사용하세요."); }
    finally { setBusy(false); }
  }
  async function resume(entry: SpaceCrewSavedCampaign) {
    if (!canStart || busy) return;
    setBusy(true); setMessage(null);
    try { await onStart({ kind: "RESUME", campaignId: entry.campaignId, recoveryToken: entry.recoveryToken }); }
    catch { setMessage("캠페인 복구 결과를 확인해주세요. 진행 중인 다른 방이 있으면 먼저 그 방에서 임무를 마쳐주세요."); }
    finally { setBusy(false); }
  }
  async function importRecovery() {
    setMessage(null);
    const result = await storage.importRecoveryText(importText);
    if (!result.ok) { setMessage("복구 정보를 읽거나 저장하지 못했습니다. 복사한 전체 내용을 확인해주세요."); return; }
    setEntries(old => [...old.filter(entry => entry.campaignId !== result.value.campaignId), result.value]);
    setImportText(""); setMode("RESUME"); setMessage("복구 정보를 보관했습니다. 이어갈 캠페인을 선택하세요.");
  }
  async function exportRecovery(id: string) {
    const result = await storage.exportRecoveryText(id);
    if (!result.ok) { setMessage("이 브라우저에서 해당 캠페인의 복구 정보를 찾지 못했습니다."); return; }
    setExportText(result.value);
  }
  return <section className="sc-campaign-panel" aria-label="캠페인 설정과 복구">
    {!campaignId && <>
      <div className="sc-mode-tabs" aria-label="플레이 방식">
        {(["CAMPAIGN", "PRACTICE", "RESUME"] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
          {value === "CAMPAIGN" ? "새 캠페인" : value === "PRACTICE" ? "미션 연습" : "이어 하기"}</button>)}
      </div>
      {mode !== "RESUME" ? <div className="sc-launch-form">
        <p>{mode === "CAMPAIGN" ? "미션 1부터 50까지, 함께 한 단계씩 탐사합니다." : "원하는 미션을 바로 선택할 수 있습니다. 연습 기록은 캠페인과 따로 보관합니다."}</p>
        {mode === "PRACTICE" && <label>연습할 미션<select value={mission} onChange={event => setMission(Number(event.target.value))}>{Array.from({ length: 50 }, (_, index) => index + 1).map(number => <option key={number} value={number}>{number}. {getSpaceCrewMissionCopy(number).title}</option>)}</select></label>}
        <label>탐사 이름 <small>선택</small><input value={label} onChange={event => setLabel(event.target.value)} maxLength={60} placeholder="친구들과의 우주 탐사" /></label>
        <button type="button" className="sc-primary" disabled={!canStart || busy} onClick={() => void create()}>{busy ? "출항 준비 중…" : mode === "CAMPAIGN" ? "미션 1 · 탐사 시작" : `미션 ${mission} · 연습 시작`}</button>
        <p className="sc-muted">복구 정보는 시작 전에 이 브라우저에 보관합니다. 서버 재시작 후에는 새 방에서 새 손패로 이어갑니다.</p>
      </div> : <p>이 브라우저의 복구 정보를 선택하거나, 따로 보관한 복구 코드를 가져오세요. 50개 미션을 모두 완료했다면 새 캠페인이나 연습을 선택하세요.</p>}
    </>}
    {(mode === "RESUME" || campaignId) && <div className="sc-recovery-list">
      {entries.filter(entry => !campaignId || entry.campaignId === campaignId).map(entry => <div className="sc-recovery-entry" key={entry.campaignId}>
        <div><strong>{entry.label || (entry.mode === "CAMPAIGN" ? "우주 탐사 캠페인" : "미션 연습")}</strong><small>미션 {entry.campaignId === campaignId ? currentMission : entry.missionNumber} · 저장된 복구 정보</small></div>
        {!campaignId && <button type="button" disabled={!canStart || busy} onClick={() => void resume(entry)}>이어 하기</button>}
        <button type="button" onClick={() => void exportRecovery(entry.campaignId)}>복구 코드</button>
      </div>)}
      {!entries.some(entry => !campaignId || entry.campaignId === campaignId) && <p className="sc-muted">이 브라우저에 저장된 복구 정보가 없습니다. 탐사를 시작한 브라우저에서 복구 코드를 가져올 수 있습니다.</p>}
      <details><summary>다른 브라우저의 복구 코드 가져오기</summary><label>복구 코드<textarea value={importText} onChange={event => setImportText(event.target.value)} spellCheck={false} autoComplete="off" placeholder="보관한 복구 정보 전체를 붙여넣으세요" /></label><button type="button" disabled={!importText.trim()} onClick={() => void importRecovery()}>복구 정보 보관</button></details>
    </div>}
    {exportText && <div className="sc-export"><label>개인적으로 보관할 복구 코드<textarea readOnly value={exportText} spellCheck={false} onFocus={event => event.target.select()} /></label><button type="button" onClick={() => { void navigator.clipboard?.writeText(exportText).then(() => setMessage("복구 코드를 복사했습니다."), () => setMessage("코드 전체를 선택해 직접 복사해주세요.")); }}>복사</button><button type="button" onClick={() => setExportText("")}>닫기</button></div>}
    {message && <p className="sc-notice" role="status">{message}</p>}
  </section>;
}
