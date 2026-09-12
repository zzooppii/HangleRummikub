import type { BurgundyColor } from './actions.js';

export interface BurgundyBoardCell {
  id: string;
  q: number;
  r: number;
  color: BurgundyColor;
  die: number;
}

export interface BurgundyBoard {
  id: number;
  name: string;
  cells: BurgundyBoardCell[];
  borderPostGroups?: string[][];
}

const colors: Record<string, BurgundyColor> = {
  B: 'BUILDING', G: 'LIVESTOCK', M: 'MINE',
  S: 'SHIP', K: 'MONASTERY', C: 'CASTLE',
};

// Rows run from north to south; each row runs west to east. The axial origin
// is the central hex. Only transcribed, verified printed layouts belong here.
function cells(rows: readonly string[]): BurgundyBoardCell[] {
  return rows.flatMap((row, rowIndex) => {
    const r = rowIndex - 3;
    const startQ = Math.max(-3, -r - 3);
    return row.split(' ').map((entry, columnIndex) => {
      const q = startQ + columnIndex;
      const color = colors[entry[0] ?? ''];
      const die = Number(entry.slice(1));
      if (!color || !Number.isInteger(die) || die < 1 || die > 6) {
        throw new Error('Invalid Burgundy board transcription');
      }
      return { id: `${q},${r}`, q, r, color, die };
    });
  });
}

// 2019 Alea anniversary edition, printed duchies 1–10 and 11a–11f.
// Each original photograph below shows the unobscured physical board.
// IDs 11–16 internally represent the printed labels 11a–11f.
// Rulebook: https://product-files.ravensburger.cloud/manuals/664462.pdf
export const BURGUNDY_BOARDS: BurgundyBoard[] = [
  // https://boardgamegeek.com/image/5021355/the-castles-of-burgundy
  { id: 1, name: '공국 1', cells: cells([
    'G6 C5 C4 K3',
    'G2 G1 C6 K5 B4',
    'G5 G4 B3 K1 B2 B3',
    'S6 S1 S2 C6 S5 S4 S1',
    'B2 B5 M4 B3 B1 G2',
    'B6 M1 K2 B5 B6',
    'M3 K4 K1 B3',
  ]) },
  // https://boardgamegeek.com/image/5021357/the-castles-of-burgundy
  { id: 2, name: '공국 2', cells: cells([
    'K6 K5 K4 C3',
    'B2 B1 S6 G5 M4',
    'M5 B4 B3 S1 G2 S3',
    'C6 B1 S2 C6 K5 B4 S1',
    'K2 S5 B4 G3 K1 B2',
    'B6 B1 G2 B5 M6',
    'G3 G4 B1 C3',
  ]) },
  // https://boardgamegeek.com/image/5021363/the-castles-of-burgundy
  { id: 3, name: '공국 3', cells: cells([
    'G6 G5 G4 G3',
    'S2 S1 C6 S5 S4',
    'B5 M4 K3 K1 S2 B3',
    'B6 B1 K2 C6 K5 B4 B1',
    'B2 B5 K4 K3 B1 B2',
    'C6 G1 M2 M5 C6',
    'B3 G4 S1 B3',
  ]) },
  // https://boardgamegeek.com/image/5021361/the-castles-of-burgundy
  { id: 4, name: '공국 4', cells: cells([
    'C6 G5 B4 S3',
    'G2 G1 B6 S5 S4',
    'B5 B4 B3 S1 C2 M3',
    'G6 G1 G2 K6 K5 M4 S1',
    'B2 C5 K4 B3 B1 B2',
    'B6 M1 B2 K5 K6',
    'S3 B4 K1 C3',
  ]) },
  // https://boardgamegeek.com/image/5021366/the-castles-of-burgundy
  { id: 5, name: '공국 5', cells: cells([
    'G6 B5 B4 S3',
    'G2 G1 B6 M5 M4',
    'B5 C4 K3 S1 S2 S3',
    'B6 B1 G2 K6 C5 B4 B1',
    'K2 C5 G4 K3 S1 B2',
    'B6 G1 B2 C5 S6',
    'K3 K4 B1 M3',
  ]) },
  // https://boardgamegeek.com/image/5021347/the-castles-of-burgundy
  { id: 6, name: '공국 6', cells: cells([
    'K6 K5 C4 S3',
    'K2 B1 B6 S5 B4',
    'G5 G4 M3 S1 B2 B3',
    'K6 B1 B2 C6 S5 B4 B1',
    'K2 B5 B4 M3 S1 B2',
    'K6 M1 G2 G5 S6',
    'C3 G4 G1 C3',
  ]) },
  // https://boardgamegeek.com/image/5021346/the-castles-of-burgundy
  { id: 7, name: '공국 7', cells: cells([
    'K6 C5 C4 S3',
    'K2 G1 G6 G5 S4',
    'S5 M4 B3 B1 M2 G3',
    'S6 K1 B2 B6 B5 G4 B1',
    'B2 K5 B4 B3 G1 B2',
    'B6 S1 M2 K5 B6',
    'S3 C4 C1 K3',
  ]) },
  // https://boardgamegeek.com/image/5021351/the-castles-of-burgundy
  { id: 8, name: '공국 8', cells: cells([
    'B6 B5 S4 B3',
    'S2 C1 K6 C5 B4',
    'B5 K4 M3 K1 K2 S3',
    'B6 G1 K2 M6 G5 K4 B1',
    'S2 G5 G4 G3 M1 B2',
    'B6 C1 G2 C5 S6',
    'B3 S4 B1 B3',
  ]) },
  // https://boardgamegeek.com/image/5021349/the-castles-of-burgundy
  { id: 9, name: '공국 9', cells: cells([
    'B6 B5 C4 K3',
    'B2 B1 G6 G5 S4',
    'B5 B4 G3 G1 S2 S3',
    'C6 K1 K2 M6 S5 C4 K1',
    'S2 S5 K4 M3 B1 G2',
    'K6 B1 B2 B5 G6',
    'M3 C4 B1 B3',
  ]) },
  // https://boardgamegeek.com/image/5021353/the-castles-of-burgundy
  { id: 10, name: '공국 10', cells: cells([
    'S6 B5 G4 C3',
    'G2 S1 B6 G5 B4',
    'G5 G4 G3 B1 K2 B3',
    'B6 B1 B2 B6 B5 K4 C1',
    'K2 K5 M4 K3 M1 S2',
    'B6 B1 M2 K5 S6',
    'C3 S4 S1 C3',
  ]) },
  // https://boardgamegeek.com/image/5021359/the-castles-of-burgundy
  { id: 11, name: '공국 11a · 국경 초소', cells: cells([
    'C6 B5 B4 C3',
    'K2 K1 K6 K5 K4',
    'S5 G4 B3 B1 S2 G3',
    'B6 S1 B2 B6 B5 G4 M1',
    'B2 S5 B4 B3 G1 M2',
    'C6 S1 K2 G5 C6',
    'M3 S4 G1 B3',
  ]), borderPostGroups: [['-1,-2', '-2,-1'], ['3,-2', '3,-1'], ['-2,3', '-1,3']] },
  // https://boardgamegeek.com/image/5021356/the-castles-of-burgundy
  { id: 12, name: '공국 11b · 국경 초소', cells: cells([
    'B6 B5 B4 C3',
    'B2 M1 K6 K5 B4',
    'B5 M4 M3 G1 K2 B3',
    'C6 S1 S2 G6 K5 K4 B1',
    'S2 S5 S4 G3 K1 C2',
    'S6 G1 G2 G5 B6',
    'B3 C4 B1 B3',
  ]), borderPostGroups: [['-1,-2', '-2,-1'], ['3,-2', '3,-1'], ['-2,3', '-1,3']] },
  // https://boardgamegeek.com/image/5021362/the-castles-of-burgundy
  { id: 13, name: '공국 11c · 국경 초소', cells: cells([
    'C6 B5 B4 K3',
    'M2 G1 B6 B5 G4',
    'B5 B4 C3 G1 G2 G3',
    'K6 B1 B2 M6 S5 S4 G1',
    'K2 K5 K4 C3 S1 S2',
    'S6 B1 B2 K5 M6',
    'S3 B4 B1 C3',
  ]), borderPostGroups: [['-1,-2', '-2,-1'], ['3,-2', '3,-1'], ['-2,3', '-1,3']] },
  // https://boardgamegeek.com/image/5021360/the-castles-of-burgundy
  { id: 14, name: '공국 11d · 국경 초소', cells: cells([
    'S6 C5 C4 B3',
    'S2 S1 K6 B5 B4',
    'S5 S4 S3 B1 B2 B3',
    'G6 G1 M2 M6 M5 K4 K1',
    'G2 B5 G4 G3 B1 K2',
    'B6 B1 G2 K5 B6',
    'C3 B4 K1 C3',
  ]), borderPostGroups: [['-1,-2', '-2,-1'], ['3,-2', '3,-1'], ['-2,3', '-1,3']] },
  // https://boardgamegeek.com/image/5021365/the-castles-of-burgundy
  { id: 15, name: '공국 11e · 국경 초소', cells: cells([
    'M6 M5 K4 K3',
    'K2 B1 B6 S5 B4',
    'C5 K4 B3 K1 S2 C3',
    'G6 G1 G2 K6 B5 B4 M1',
    'G2 S5 S4 B3 B1 B2',
    'G6 S1 S2 B5 B6',
    'G3 C4 C1 B3',
  ]), borderPostGroups: [['-1,-2', '-2,-1'], ['3,-2', '3,-1'], ['-2,3', '-1,3']] },
  // https://boardgamegeek.com/image/5021364/the-castles-of-burgundy
  { id: 16, name: '공국 11f · 국경 초소', cells: cells([
    'B6 B5 B4 S3',
    'K2 K1 C6 B5 S4',
    'S5 B4 B3 M1 B2 B3',
    'C6 B1 B2 M6 G5 S4 C1',
    'K2 B5 M4 G3 S1 S2',
    'K6 B1 C2 K5 K6',
    'G3 G4 G1 G3',
  ]), borderPostGroups: [['-1,-2', '-2,-1'], ['3,-2', '3,-1'], ['-2,3', '-1,3']] },
];

// Printed depot colors numbered clockwise 1–6. Anniversary rulebook pp. 2/11.
// Verified printed boards: https://boardgamegeek.com/image/4966605/the-castles-of-burgundy
// and https://boardgamegeek.com/image/5421148/the-castles-of-burgundy (2/3 players).
// The final entry in each 4-player row is the extra fourth-player space.
const threePlayerSlots: BurgundyColor[][] = [
  ['MONASTERY', 'BUILDING', 'SHIP'],
  ['BUILDING', 'MONASTERY', 'CASTLE'],
  ['SHIP', 'LIVESTOCK', 'BUILDING'],
  ['LIVESTOCK', 'SHIP', 'BUILDING'],
  ['BUILDING', 'MINE', 'MONASTERY'],
  ['BUILDING', 'CASTLE', 'LIVESTOCK'],
];

export const BURGUNDY_BLACK_DEPOT_COUNTS: Record<2 | 3 | 4, number> = {
  2: 4, 3: 6, 4: 8,
};

export const BURGUNDY_DEPOT_SLOTS: Record<2 | 3 | 4, BurgundyColor[][]> = {
  2: [
    ['BUILDING', 'SHIP'],
    ['MONASTERY', 'CASTLE'],
    ['LIVESTOCK', 'BUILDING'],
    ['SHIP', 'BUILDING'],
    ['MINE', 'MONASTERY'],
    ['BUILDING', 'LIVESTOCK'],
  ],
  3: threePlayerSlots,
  4: [
    ['MONASTERY', 'BUILDING', 'SHIP', 'LIVESTOCK'],
    ['BUILDING', 'MONASTERY', 'CASTLE', 'BUILDING'],
    ['SHIP', 'LIVESTOCK', 'BUILDING', 'MONASTERY'],
    ['LIVESTOCK', 'SHIP', 'BUILDING', 'MINE'],
    ['BUILDING', 'MINE', 'MONASTERY', 'BUILDING'],
    ['BUILDING', 'CASTLE', 'LIVESTOCK', 'SHIP'],
  ],
};

/** phaseIndex is zero-based: A=0, B=1, C=2, D=3, E=4. */
export function getBurgundyDepotSlots(players: 2 | 3 | 4, phaseIndex: number): BurgundyColor[][] {
  if (!Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex > 4) {
    throw new RangeError('Invalid Burgundy phase index');
  }
  return BURGUNDY_DEPOT_SLOTS[players].map((depot, index) =>
    depot.map(color => players === 3 && index === 5 &&
      (phaseIndex === 1 || phaseIndex === 3) && color === 'CASTLE' ? 'MINE' : color),
  );
}
