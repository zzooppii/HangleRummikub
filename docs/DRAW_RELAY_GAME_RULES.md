# 그림 릴레이 — 승인 규칙
P19A · USER-APPROVED · draw-relay-rules-v1

## 참가 및 시작
DRAW_RELAY / 그림 릴레이. 3–8명, Ready 없음, Host 시작, 모두 CONNECTED. 점수·순위·winner 없음. 제시어 모드 EASY(EASY), NORMAL(EASY+NORMAL), MIXED(전체, 기본). 게임 안 중복 제시어 없음. Custom prompt는 제외.

## 비밀 책과 순환
시작 때 서버가 seatOrder를 shuffleFrozen으로 고정한다. 각 seat마다 Book 하나, 초기 제시어 하나. 소유자는 자기 초기 제시어를 진행 중 보지 않는다. Book owner seat i의 stage s(1부터) actor는 seat[(i+s)%N]. Stage1 DRAW, 이후 GUESS/DRAW 교대. 홀수 N은 N−1단계; 짝수 N은 N단계이며 마지막은 owner의 FINAL_GUESS. 3: D/G, 4:D/G/D/FG, 5:D/G/D/G, 6:D/G/D/G/D/FG, 7:D/G/D/G/D/G, 8:D/G/D/G/D/G/D/FG.

모든 참가자가 동시에 자기 assignment 하나를 수행한다. 직전 page만 보이며 owner/author/history/future route는 비공개. stageToken은 stage 동안 고정, 각각 제출은 잠금. 전체 barrier 충족 시 원자적으로 page 추가 및 다음 stage. seat와 Book은 이탈 후에도 제거하지 않는다.

## 시간과 이탈
DRAW90초, GUESS/FINAL_GUESS45초, 전체 deadline 없음. DRAW timeout은 저장 draft와 무관하게 blank page, GUESS는 “모르겠어요”; timedOut 표시. Connected timeout은 streak 증가 없음. Offline 미제출 timeout은 streak+1; resume reset. 연속3회면 forfeit. 명시 leave 즉시 forfeit/session cleanup; 이후 assignment는 자동 default, Book 보존. Disconnect 자체는 forfeit 아님. Forfeited seats는 다음 stage 시작에 자동 제출하며 연쇄 barrier도 유한 단계 내 진행한다.

## 그림과 추측
1000×700 logical canvas. PEN/ERASER, undo/clear, 3 widths, 8-color palette. Text/image upload/AI tools 없음. 최대250 strokes/12000 points/1000 points per stroke, finite bounded coordinates, unique stroke IDs, width/color whitelist. UI는 stroke 완료 시 private server draft 저장. 제출 이후 수정 불가. Reconnect는 acknowledged draft와 동일 assignment/deadline 복원. 전송 전 local unsaved 데이터는 서버 저장 보장 대상이 아니며 저장상태·실패 재시도 표시.
Guess는 공백 normalize/trim, 1–40 Unicode characters, plain escaped text.

## Reveal / 종료 / 재게임
REVEAL은 Room PLAYING 내부 subphase이며 deadline 없음. seatOrder의 Book 순서, owner 소개부터 prompt와 각 page를 Host가 한 장씩 공개. 아직 안 열린 future pages는 wire에 없음. 마지막 guess까지 본 후 원문/최종 비교. 마지막 Book 확인 후 FINISHED, 전체 공개 recap. 뒤로가기는 v1 필수 아님.
draw:rematch Host만 FINISHED→LOBBY, RoomCode/participant/session 유지. 명시leave만 다음 roster에서 제외; 단순offline 유지. 새판은 books/prompts/drafts/streak/cursor/timer 모두 새로 생성. 기존4게임 변경 금지.
