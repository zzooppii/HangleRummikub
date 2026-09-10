import { parse } from "valibot";
import { LOST_CITIES_SUITS, LostCitiesCardIdSchema, type LostCitiesCard } from "@hangul-rummikub/shared";

export function makeLostCitiesCards(id: () => string): LostCitiesCard[] {
  return LOST_CITIES_SUITS.flatMap(suit => {
    const cards: LostCitiesCard[] = [];
    for(let i=0;i<3;i++)cards.push({cardId:parse(LostCitiesCardIdSchema,id()),suit,kind:'INVESTMENT'});
    for(let value=2;value<=10;value++)cards.push({cardId:parse(LostCitiesCardIdSchema,id()),suit,kind:'NUMBER',value});
    return cards;
  });
}
