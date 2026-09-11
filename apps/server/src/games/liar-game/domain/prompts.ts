import { LIAR_CATEGORIES, type LiarCategory, type LiarSettings } from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";

export type LiarPrompt = Readonly<{ category: LiarCategory; word: string; aliases: readonly string[] }>;
export interface LiarPromptSource { choose(category: LiarSettings["category"], random: RandomSource): LiarPrompt }
// Original, server-only vocabulary. Neither the list nor answer aliases enter browser contracts.
const WORDS: Readonly<Record<LiarCategory, readonly string[]>> = {
  FOOD: ["피자", "김밥", "떡볶이", "라면", "만두", "초밥", "햄버거", "팝콘", "아이스크림", "케이크", "김치", "비빔밥", "삼겹살", "수박", "딸기", "붕어빵", "호떡", "카레", "돈가스", "샌드위치"],
  ANIMAL: ["고양이", "강아지", "코끼리", "기린", "사자", "호랑이", "펭귄", "돌고래", "고래", "토끼", "다람쥐", "거북이", "악어", "독수리", "부엉이", "낙타", "판다", "캥거루", "문어", "나비"],
  PLACE: ["학교", "도서관", "영화관", "놀이공원", "수영장", "공항", "기차역", "병원", "약국", "편의점", "시장", "동물원", "박물관", "미술관", "해수욕장", "캠핑장", "우체국", "소방서", "미용실", "카페"],
  OBJECT: ["우산", "안경", "시계", "냉장고", "세탁기", "청소기", "선풍기", "전자레인지", "리모컨", "칫솔", "연필", "지우개", "가위", "망치", "거울", "베개", "이불", "책가방", "손전등", "열쇠"],
  JOB: ["의사", "간호사", "소방관", "경찰관", "선생님", "요리사", "제빵사", "미용사", "배우", "가수", "화가", "작가", "기자", "사진가", "조종사", "운전기사", "농부", "어부", "수의사", "마술사"],
  HOBBY: ["축구", "야구", "농구", "배구", "탁구", "배드민턴", "수영", "등산", "낚시", "캠핑", "독서", "그림 그리기", "사진 촬영", "춤추기", "노래하기", "요가", "볼링", "스케이트", "스키", "자전거 타기"],
};
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  돈가스: ["돈까스", "돈카츠"], 거북이: ["거북"], 부엉이: [], 선생님: ["교사"], 경찰관: ["경찰"],
  사진가: ["사진사"], 운전기사: ["운전사"], "그림 그리기": ["그림", "그리기"], "사진 촬영": ["사진", "사진 찍기"],
  춤추기: ["춤", "댄스"], 노래하기: ["노래", "노래 부르기"], "자전거 타기": ["자전거", "사이클링"],
};
export class CuratedLiarPrompts implements LiarPromptSource {
  choose(selected: LiarSettings["category"], random: RandomSource): LiarPrompt {
    const category = selected === "RANDOM" ? LIAR_CATEGORIES[random.nextInt(LIAR_CATEGORIES.length)]! : selected;
    const words = WORDS[category], word = words[random.nextInt(words.length)]!;
    return { category, word, aliases: [...(ALIASES[word] ?? [])] };
  }
}
export function normalizeLiarAnswer(value: string): string { return value.normalize("NFC").replace(/\s/gu, "").toLowerCase(); }
