import * as v from "valibot";
import { LIAR_CATEGORIES, LiarCategorySchema, LiarClueSchema, type LiarCategory, type LiarSettings } from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";

export type LiarPrompt = Readonly<{ category: LiarCategory; word: string; aliases: readonly string[] }>;
export const LiarPromptHistorySchema = v.pipe(v.array(v.strictObject({ category: LiarCategorySchema, word: LiarClueSchema })), v.maxLength(300),
  v.check(items => new Set(items.map(p => `${p.category}:${normalizeLiarAnswer(p.word)}`)).size === items.length));
export type LiarPromptHistory = v.InferOutput<typeof LiarPromptHistorySchema>;
export interface LiarPromptSource { choose(category: LiarSettings["category"], random: RandomSource, used?: readonly LiarPromptHistory[number][], excluded?: readonly LiarPromptHistory[number][]): LiarPrompt }
export function rememberLiarPrompt(used: readonly LiarPromptHistory[number][], prompt: LiarPrompt): LiarPromptHistory {
  const reset = used.some(p => p.category === prompt.category && p.word === prompt.word);
  return v.parse(LiarPromptHistorySchema, [...used.filter(p => !reset || p.category !== prompt.category), { category: prompt.category, word: prompt.word }]);
}
// Original, server-only vocabulary. Neither the list nor answer aliases enter browser contracts.
const WORDS: Readonly<Record<LiarCategory, readonly string[]>> = {
  FOOD: ["피자", "김밥", "떡볶이", "라면", "만두", "초밥", "햄버거", "팝콘", "아이스크림", "케이크", "김치", "비빔밥", "삼겹살", "수박", "딸기", "붕어빵", "호떡", "카레", "돈가스", "샌드위치",
    "짜장면", "짬뽕", "탕수육", "치킨", "불고기", "갈비", "잡채", "냉면", "칼국수", "우동",
    "스파게티", "쌀국수", "김치찌개", "된장찌개", "미역국", "삼계탕", "순대", "어묵", "감자튀김", "계란말이",
    "김치볶음밥", "오므라이스", "죽", "토스트", "와플", "도넛", "쿠키", "푸딩", "바나나", "포도"],
  ANIMAL: ["고양이", "강아지", "코끼리", "기린", "사자", "호랑이", "펭귄", "돌고래", "고래", "토끼", "다람쥐", "거북이", "악어", "독수리", "부엉이", "낙타", "판다", "캥거루", "문어", "나비",
    "여우", "늑대", "곰", "원숭이", "고릴라", "침팬지", "얼룩말", "하마", "코뿔소", "사슴",
    "말", "소", "돼지", "양", "염소", "닭", "오리", "거위", "공작", "타조",
    "앵무새", "비둘기", "참새", "까마귀", "개구리", "뱀", "도마뱀", "상어", "해파리", "불가사리"],
  PLACE: ["학교", "도서관", "영화관", "놀이공원", "수영장", "공항", "기차역", "병원", "약국", "편의점", "시장", "동물원", "박물관", "미술관", "해수욕장", "캠핑장", "우체국", "소방서", "미용실", "카페",
    "식당", "빵집", "서점", "문구점", "백화점", "대형마트", "은행", "경찰서", "시청", "법원",
    "호텔", "목욕탕", "찜질방", "헬스장", "운동장", "축구장", "야구장", "볼링장", "스키장", "노래방",
    "공원", "놀이터", "수족관", "식물원", "천문대", "항구", "주차장", "지하철역", "버스정류장", "공연장"],
  OBJECT: ["우산", "안경", "시계", "냉장고", "세탁기", "청소기", "선풍기", "전자레인지", "리모컨", "칫솔", "연필", "지우개", "가위", "망치", "거울", "베개", "이불", "책가방", "손전등", "열쇠",
    "휴대전화", "노트북", "텔레비전", "카메라", "이어폰", "스피커", "키보드", "마우스", "프린터", "충전기",
    "전기밥솥", "토스터", "믹서기", "드라이어", "다리미", "체중계", "온도계", "계산기", "자물쇠", "지갑",
    "텀블러", "물뿌리개", "화분", "빗자루", "쓰레받기", "옷걸이", "돋보기", "줄자", "테이프", "스테이플러"],
  JOB: ["의사", "간호사", "소방관", "경찰관", "선생님", "요리사", "제빵사", "미용사", "배우", "가수", "화가", "작가", "기자", "사진가", "조종사", "운전기사", "농부", "어부", "수의사", "마술사",
    "치과의사", "약사", "변호사", "판사", "검사", "군인", "승무원", "선장", "우주비행사", "기상캐스터",
    "아나운서", "통역사", "번역가", "사서", "택배기사", "집배원", "정비사", "목수", "건축가", "프로그래머",
    "과학자", "고고학자", "운동선수", "심판", "지휘자", "작곡가", "성우", "패션디자이너", "플로리스트", "바리스타"],
  HOBBY: ["축구", "야구", "농구", "배구", "탁구", "배드민턴", "수영", "등산", "낚시", "캠핑", "독서", "그림 그리기", "사진 촬영", "춤추기", "노래하기", "요가", "볼링", "스케이트", "스키", "자전거 타기",
    "달리기", "줄넘기", "테니스", "골프", "당구", "양궁", "승마", "서핑", "스노보드", "스케이트보드",
    "클라이밍", "태권도", "권투", "발레", "피아노 연주", "기타 연주", "드럼 연주", "뜨개질", "자수", "종이접기",
    "퍼즐 맞추기", "보드게임", "마술", "도자기 만들기", "캘리그래피", "프라모델 조립", "원예", "요리", "베이킹", "영화 감상"],
};
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  돈가스: ["돈까스", "돈카츠"], 거북이: ["거북"], 부엉이: [], 선생님: ["교사"], 경찰관: ["경찰"],
  사진가: ["사진사"], 운전기사: ["운전사"], "그림 그리기": ["그림", "그리기"], "사진 촬영": ["사진", "사진 찍기"],
  휴대전화: ["휴대폰", "핸드폰", "스마트폰"], 텔레비전: ["TV", "티비"], 드라이어: ["헤어드라이어"], 스테이플러: ["호치키스"],
  "피아노 연주": ["피아노"], "기타 연주": ["기타"], "드럼 연주": ["드럼"], "퍼즐 맞추기": ["퍼즐"],
  "프라모델 조립": ["프라모델"], "영화 감상": ["영화 보기"], 클라이밍: ["암벽등반"],
  춤추기: ["춤", "댄스"], 노래하기: ["노래", "노래 부르기"], "자전거 타기": ["자전거", "사이클링"],
};
export class CuratedLiarPrompts implements LiarPromptSource {
  choose(selected: LiarSettings["category"], random: RandomSource, used: readonly LiarPromptHistory[number][] = [], excluded: readonly LiarPromptHistory[number][] = []): LiarPrompt {
    const category = selected === "RANDOM" ? LIAR_CATEGORIES[random.nextInt(LIAR_CATEGORIES.length)]! : selected;
    const history = used.filter(p => p.category === category).map(p => p.word);
    const blocked = new Set(excluded.filter(p => p.category === category).map(p => p.word));
    let words = WORDS[category].filter(word => !history.includes(word) && !blocked.has(word));
    if (words.length === 0) words = WORDS[category].filter(word => !blocked.has(word) && word !== history.at(-1));
    if (words.length === 0) throw new Error("No eligible LIAR prompts.");
    const word = words[random.nextInt(words.length)]!;
    return { category, word, aliases: [...(ALIASES[word] ?? [])] };
  }
}
export function normalizeLiarAnswer(value: string): string { return value.normalize("NFC").replace(/\s/gu, "").toLowerCase(); }
