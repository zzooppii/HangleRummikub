# Original Korean prompt pack v1
P19A approved target: exactly600 unique trimmed strings, EASY200/NORMAL250/HARD150. IDs and draw-relay-prompts-v1 version stable.
EASY: recognizable nouns/actions. NORMAL: everyday scenes, relationships and occupations. HARD: original imaginative scenes/simple idioms, no copyrighted character names or commercial prompt list.
No hateful/sexual/graphic violent prompts. Independently authored Korean text. Sampling without replacement per game, mode filtered before shuffle.

P20: `apps/server/src/games/draw-relay/domain/prompts-v1.ts` contains all 600 entries. Exact count, unique IDs/text and 200/250/150 distribution pass automated tests. Editorial inspection found no obvious profanity, commercial character references or copied commercial word list; common nouns and traditional expressions are not claimed to be individually novel. Difficulty remains a playtest-tuning judgment. Short words can be substrings of other prompts; privacy tests compare exact serialized values, not substring matches.
