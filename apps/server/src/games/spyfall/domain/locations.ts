import { spyfallLocations, type SpyfallLocation, type SpyfallSettings } from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";
export function chooseSpyfallLocation(pack: SpyfallSettings["locationPack"], random: RandomSource): SpyfallLocation {
  const options = spyfallLocations(pack);
  return options[random.nextInt(options.length)]!;
}
// Original role prompts. The assigned role remains server private until its owner's projection.
const JOBS: Readonly<Record<SpyfallLocation, readonly string[]>> = {
  HOSPITAL: ["의사", "간호사", "환자", "보호자", "약사", "검사 기사", "접수 직원"],
  SCHOOL: ["교사", "학생", "교장", "보건 교사", "급식 조리사", "학부모", "행정 직원"],
  AIRPORT: ["조종사", "승무원", "여행객", "정비사", "관제사", "보안 직원", "수하물 담당"],
  HOTEL: ["투숙객", "지배인", "벨보이", "청소 직원", "요리사", "프런트 직원", "도어맨"],
  RESTAURANT: ["셰프", "손님", "서빙 직원", "바리스타", "매니저", "식재료 납품원", "음식 평론가"],
  CINEMA: ["관객", "영사 기사", "매표 직원", "팝콘 판매원", "청소 직원", "영화 평론가", "관장"],
  LIBRARY: ["사서", "학생", "작가", "방문객", "책 정리 직원", "연구자", "독서 모임장"],
  BEACH: ["서퍼", "안전 요원", "관광객", "아이스크림 판매원", "사진가", "해변 청소원", "보트 운전사"],
  BANK: ["은행원", "고객", "청원 경찰", "지점장", "금고 관리자", "회계사", "현금 운송원"],
  CIRCUS: ["곡예사", "광대", "관객", "단장", "마술사", "매표원", "무대 기사"],
  MUSEUM: ["학예사", "관람객", "안내원", "보존 전문가", "경비원", "미술 학생", "전시 기획자"],
  THEATER: ["배우", "관객", "조명 감독", "무대 감독", "분장사", "연출가", "의상 담당"],
  TRAIN: ["기관사", "승객", "차장", "승무원", "매점 직원", "정비사", "여행 작가"],
  CRUISE: ["선장", "승객", "항해사", "셰프", "공연자", "객실 직원", "기관사"],
  SPACE: ["우주 비행사", "지휘관", "연구원", "의무관", "통신 담당", "정비 기술자", "우주 관광객"],
  SUBMARINE: ["함장", "조타수", "음탐사", "기관사", "의무관", "요리사", "항해사"],
  FARM: ["농부", "수의사", "수확 일꾼", "농장주", "체험 방문객", "트랙터 운전사", "배송 기사"],
  SKI: ["스키 강사", "초보 스키어", "구조대원", "리프트 직원", "장비 대여원", "선수", "매점 직원"],
  FIRE_STATION: ["소방관", "구급 대원", "서장", "운전 대원", "통신 담당", "정비사", "견학 학생"],
  POLICE: ["경찰관", "형사", "민원인", "통역사", "과학 수사관", "서장", "행정 직원"],
  ZOO: ["사육사", "수의사", "관람객", "안내원", "매점 직원", "생태 연구원", "사진가"],
  GARDEN: ["정원사", "식물학자", "관람객", "안내원", "종자 연구원", "화가", "관리자"],
  TV_STUDIO: ["아나운서", "카메라 감독", "방청객", "작가", "출연자", "분장사", "음향 감독"],
  DIG_SITE: ["고고학자", "발굴 인부", "기록 담당", "사진가", "유물 복원가", "현장 소장", "연구 학생"],
};
export function spyfallJob(location: SpyfallLocation, index: number): string { return JOBS[location][index % JOBS[location].length]!; }
