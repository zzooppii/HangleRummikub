import { useState } from "react";
export function RelayDoodle() {
  return <svg className="relay-doodle" viewBox="0 0 240 120" aria-hidden="true"><g stroke="#302b50" strokeWidth="3" strokeLinejoin="round"><path fill="#fffefa" d="m38 19 80-8 9 97-80 7z"/><path fill="#eadfff" d="m117 11 70 12-8 93-52-8z"/><path fill="none" d="m57 37 39-4m-36 18 27-3m48-13 32 6m-30 10 18 3"/><path fill="#ffcb59" d="m164 76 44-60 11 9-44 60-17 5z"/><path fill="#72d7c4" d="m69 71 10-9 12 8-2 17-18 1z"/><path fill="none" d="m9 53 15 7-15 9m184 30 15 4m-181-6 7-9"/></g><circle cx="222" cy="68" r="6" fill="#ed86ac"/></svg>;
}
export function RelayHelp({ drawSeconds = 90 }: { drawSeconds?: number }) {
  const [open, setOpen] = useState(() => { try { return typeof window !== "undefined" && localStorage.getItem("draw-relay:tutorial") !== "seen"; } catch { return false; } });
  return <details className="relay-help" open={open} onToggle={e => { setOpen(e.currentTarget.open); if (!e.currentTarget.open) { try { localStorage.setItem("draw-relay:tutorial", "seen"); } catch { /* Optional onboarding preference. */ } } }}><summary>게임 방법 · 처음이라면 펼쳐보세요</summary><RelayDoodle/><ol>
    <li><strong>단어는 비밀!</strong> 내가 받은 단어만 확인해요. 책 주인과 앞선 기록은 아직 몰라요.</li>
    <li><strong>그림으로 표현해요.</strong> {drawSeconds}초 동안 펜과 지우개로 자유롭게 그려요.</li>
    <li><strong>그림을 보고 추측해요.</strong> 45초 안에 무엇인지 짧게 적어요.</li>
    <li><strong>다음 사람에게 전달!</strong> 모두 제출하면 바로 넘어가요. 시간이 끝나면 빈 그림 또는 ‘모르겠어요’가 전달돼요.</li>
    <li><strong>마지막엔 함께 공개.</strong> 방장이 한 장씩 넘기며 처음 단어가 어떻게 변했는지 확인해요.</li>
  </ol><p>마지막 페이지는 항상 추측으로 끝나요. 점수와 승패 없이, 엉뚱한 변화를 함께 즐겨요!</p><p>그림은 ‘저장됨’ 표시 후 새로고침해도 복구됩니다. 제출하면 수정할 수 없어요.</p></details>;
}
