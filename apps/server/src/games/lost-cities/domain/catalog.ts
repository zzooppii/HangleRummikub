import { parse } from "valibot";
import { lostCitiesSuits, type LostCitiesSettings, LostCitiesCardIdSchema, type LostCitiesCard } from "@hangul-rummikub/shared";

export function makeLostCitiesCards(id: () => string, mode: LostCitiesSettings["mode"] = "BASE"): LostCitiesCard[] {
  return lostCitiesSuits(mode).flatMap(suit => {
    const cards: LostCitiesCard[] = [];
    for(let i=0;i<3;i++)cards.push({cardId:parse(LostCitiesCardIdSchema,id()),suit,kind:'INVESTMENT'});
    for(let value=2;value<=10;value++)cards.push({cardId:parse(LostCitiesCardIdSchema,id()),suit,kind:'NUMBER',value});
    return cards;
  });
}
