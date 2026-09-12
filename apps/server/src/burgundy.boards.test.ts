import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BURGUNDY_BOARDS, BURGUNDY_BLACK_DEPOT_COUNTS,
  getBurgundyDepotSlots,
  type BurgundyBoardCell,
} from '@hangul-rummikub/shared';

function adjacent(a: BurgundyBoardCell, b: BurgundyBoardCell): boolean {
  const q = a.q - b.q, r = a.r - b.r;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === 1;
}

function regions(cells: BurgundyBoardCell[]): BurgundyBoardCell[][] {
  const remaining = new Map(cells.map(cell => [cell.id, cell]));
  const result: BurgundyBoardCell[][] = [];
  for (const cell of cells) {
    if (!remaining.delete(cell.id)) continue;
    const region = [cell];
    for (let index = 0; index < region.length; index++) {
      for (const candidate of remaining.values()) {
        if (candidate.color === cell.color && adjacent(region[index]!, candidate)) {
          region.push(candidate);
          remaining.delete(candidate.id);
        }
      }
    }
    result.push(region);
  }
  return result;
}

test('BURGUNDY printed duchies have 37 unique contiguous hexes and exact color inventory', () => {
  assert.equal(new Set(BURGUNDY_BOARDS.map(board => board.id)).size, BURGUNDY_BOARDS.length);
  for (const board of BURGUNDY_BOARDS) {
    assert.equal(board.cells.length, 37, `duchy ${board.id}`);
    assert.equal(new Set(board.cells.map(cell => cell.id)).size, 37);
    assert.equal(new Set(board.cells.map(cell => `${cell.q},${cell.r}`)).size, 37);
    const counts: Record<string, number> = {};
    for (const cell of board.cells) {
      assert.equal(cell.id, `${cell.q},${cell.r}`);
      assert.ok(Number.isInteger(cell.die) && cell.die >= 1 && cell.die <= 6);
      assert.ok(Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(cell.q + cell.r)) <= 3);
      counts[cell.color] = (counts[cell.color] ?? 0) + 1;
    }
    assert.deepEqual(counts, { BUILDING: 12, LIVESTOCK: 6, MINE: 3, SHIP: 6, MONASTERY: 6, CASTLE: 4 });
    // Ignoring terrain, every printed hex must be reachable from the center.
    assert.equal(regions(board.cells.map(cell => ({ ...cell, color: 'BUILDING' }))).length, 1);
  }
});

test('BURGUNDY 2019 dice retain the printed positional numbering across all duchies', () => {
  const printedDice = [6,5,4,3, 2,1,6,5,4, 5,4,3,1,2,3, 6,1,2,6,5,4,1, 2,5,4,3,1,2, 6,1,2,5,6, 3,4,1,3];
  for (const board of BURGUNDY_BOARDS) assert.deepEqual(board.cells.map(cell => cell.die), printedDice, board.name);
});

test('BURGUNDY duchy 1 preserves its photographed connected regions and central castle', () => {
  const board = BURGUNDY_BOARDS.find(candidate => candidate.id === 1)!;
  assert.deepEqual(board.cells.find(cell => cell.id === '0,0'), {
    id: '0,0', q: 0, r: 0, color: 'CASTLE', die: 6,
  });
  const areas = regions(board.cells);
  const sizes = (color: BurgundyBoardCell['color']) =>
    areas.filter(area => area[0]!.color === color).map(area => area.length).sort((a, b) => a - b);
  assert.deepEqual(sizes('BUILDING'), [1, 3, 3, 5]);
  assert.deepEqual(sizes('LIVESTOCK'), [1, 5]);
  assert.deepEqual(sizes('SHIP'), [3, 3]);
  assert.deepEqual(sizes('MONASTERY'), [3, 3]);
  assert.deepEqual(sizes('MINE'), [3]);
  assert.deepEqual(sizes('CASTLE'), [1, 3]);
});

test('BURGUNDY market supplies match 2/3/4 players and the 3BD printed exception', () => {
  for (const players of [2, 3, 4] as const) {
    for (let phase = 0; phase < 5; phase++) {
      const slots = getBurgundyDepotSlots(players, phase);
      assert.equal(slots.length, 6);
      assert.ok(slots.every(depot => depot.length === players));
      assert.equal(BURGUNDY_BLACK_DEPOT_COUNTS[players], players * 2);
    }
  }
  const a = getBurgundyDepotSlots(3, 0);
  const b = getBurgundyDepotSlots(3, 1);
  assert.deepEqual(a.slice(0, 5), b.slice(0, 5));
  assert.deepEqual(a[5], ['BUILDING', 'CASTLE', 'LIVESTOCK']);
  assert.deepEqual(b[5], ['BUILDING', 'MINE', 'LIVESTOCK']);
  assert.deepEqual(getBurgundyDepotSlots(3, 2), a);
  assert.deepEqual(getBurgundyDepotSlots(3, 3), b);
  assert.deepEqual(getBurgundyDepotSlots(3, 4), a);
  assert.deepEqual(getBurgundyDepotSlots(4, 0), getBurgundyDepotSlots(4, 1));
  b[0]!.pop();
  assert.equal(getBurgundyDepotSlots(3, 1)[0]!.length, 3);
  assert.throws(() => getBurgundyDepotSlots(3, -1), RangeError);
  assert.throws(() => getBurgundyDepotSlots(3, 5), RangeError);
});

test('BURGUNDY 2019 includes exactly the ten base and six border duchies', () => {
  assert.deepEqual(BURGUNDY_BOARDS.map(board => board.id), Array.from({ length: 16 }, (_, index) => index + 1));
  assert.ok(BURGUNDY_BOARDS.slice(0, 10).every(board => board.borderPostGroups === undefined));
  for (const board of BURGUNDY_BOARDS.slice(10)) {
    assert.equal(board.borderPostGroups?.length, 3);
    for (const group of board.borderPostGroups ?? []) {
      assert.equal(group.length, 2);
      const pair = group.map(id => board.cells.find(cell => cell.id === id));
      assert.ok(pair.every(cell => cell));
      assert.ok(adjacent(pair[0]!, pair[1]!));
      assert.ok(pair.every(cell => Math.max(Math.abs(cell!.q), Math.abs(cell!.r), Math.abs(cell!.q + cell!.r)) === 3));
    }
  }
});
