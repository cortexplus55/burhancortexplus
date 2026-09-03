/**
 * Günlük bulmacaların üretimi ve kural denetimi.
 *
 * Hepsi saf fonksiyon: aynı tohum her zaman aynı tahtayı verir. Bileşenler
 * yalnızca durum tutar, kural bilgisi burada.
 */

import { seededRandom } from "@/lib/parity/daily-puzzles";

// ---------------------------------------------------------------------------
// Hanoi Kulesi
// ---------------------------------------------------------------------------

export type HanoiState = number[][];

/** Disk sayısı 3–5 arası gezinir; 4 disk 15, 5 disk 31 hamle ister. */
export function hanoiDiscCount(seed: number): number {
  return 3 + (seed % 3);
}

export function hanoiInitial(discs: number): HanoiState {
  return [Array.from({ length: discs }, (_, i) => discs - i), [], []];
}

/** Büyük disk küçüğün üstüne konamaz — oyunun tek kuralı. */
export function hanoiCanMove(state: HanoiState, from: number, to: number): boolean {
  if (from === to) return false;
  const source = state[from];
  const target = state[to];
  if (!source?.length) return false;
  const moving = source[source.length - 1];
  const top = target[target.length - 1];
  return top === undefined || moving < top;
}

export function hanoiMove(state: HanoiState, from: number, to: number): HanoiState {
  if (!hanoiCanMove(state, from, to)) return state;
  const next = state.map((peg) => [...peg]);
  const disc = next[from].pop();
  if (disc !== undefined) next[to].push(disc);
  return next;
}

/** Bütün diskler üçüncü çubukta. */
export function hanoiSolved(state: HanoiState, discs: number): boolean {
  return state[2].length === discs;
}

export function hanoiMinMoves(discs: number): number {
  return 2 ** discs - 1;
}

// ---------------------------------------------------------------------------
// Nonogram 5×5
// ---------------------------------------------------------------------------

export type NonogramPuzzle = {
  size: number;
  solution: boolean[][];
  rowClues: number[][];
  colClues: number[][];
};

function cluesFromLine(line: boolean[]): number[] {
  const clues: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) run++;
    else if (run) {
      clues.push(run);
      run = 0;
    }
  }
  if (run) clues.push(run);
  return clues.length ? clues : [0];
}

/** Bir ipucu dizisine uyan tüm satır dizilişleri. 5 hücre için avuç içi kadar. */
function lineCandidates(clues: number[], size: number): boolean[][] {
  const out: boolean[][] = [];
  const positive = clues.filter((c) => c > 0);

  const place = (index: number, start: number, acc: boolean[]) => {
    if (index === positive.length) {
      out.push([...acc, ...Array(size - acc.length).fill(false)]);
      return;
    }
    const block = positive[index];
    const remaining = positive.slice(index + 1).reduce((s, c) => s + c + 1, 0);
    for (let pos = start; pos + block + remaining <= size; pos++) {
      const next = [...acc];
      while (next.length < pos) next.push(false);
      for (let i = 0; i < block; i++) next.push(true);
      if (index < positive.length - 1) next.push(false);
      place(index + 1, next.length, next);
    }
  };

  place(0, 0, []);
  return out;
}

/**
 * Çözüm sayısı. Tek çözümü olmayan bulmaca tahmin gerektirir; kullanıcıyı
 * haksız yere tıkar, o yüzden üretimde eleniyor. İki çözüm bulunca duruyoruz —
 * kaç tane olduğu değil, "birden fazla mı" bilgisi yeterli.
 */
function countSolutions(puzzle: Omit<NonogramPuzzle, "solution">): number {
  const { size, rowClues, colClues } = puzzle;
  const candidates = rowClues.map((clues) => lineCandidates(clues, size));
  let found = 0;

  const fits = (grid: boolean[][], rowsFilled: number): boolean => {
    for (let col = 0; col < size; col++) {
      const partial: boolean[] = [];
      for (let r = 0; r < rowsFilled; r++) partial.push(grid[r][col]);
      // Tamamlanmış sütunlar birebir eşleşmeli; yarımlar önek olarak tutarlı olmalı.
      const target = colClues[col];
      if (rowsFilled === size) {
        if (cluesFromLine(partial).join(",") !== target.join(",")) return false;
      } else {
        const prefix = cluesFromLine(partial);
        const soFar = prefix.filter((c) => c > 0);
        const goal = target.filter((c) => c > 0);
        if (soFar.length > goal.length) return false;
        for (let i = 0; i < soFar.length - 1; i++) {
          if (soFar[i] !== goal[i]) return false;
        }
        const last = soFar.length - 1;
        if (last >= 0 && soFar[last] > goal[last]) return false;
      }
    }
    return true;
  };

  const walk = (row: number, grid: boolean[][]) => {
    if (found > 1) return;
    if (row === size) {
      if (fits(grid, size)) found++;
      return;
    }
    for (const candidate of candidates[row]) {
      grid[row] = candidate;
      if (fits(grid, row + 1)) walk(row + 1, grid);
      if (found > 1) return;
    }
  };

  walk(0, Array.from({ length: size }, () => Array(size).fill(false)));
  return found;
}

export function makeNonogram(seed: number, size = 5): NonogramPuzzle {
  // Tek çözümlü bir tahta çıkana kadar tohumu ilerlet. Pratikte birkaç tur.
  for (let attempt = 0; attempt < 60; attempt++) {
    const rand = seededRandom(seed + attempt * 7919);
    const solution = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => rand() < 0.55),
    );
    // Tamamen boş satır/sütun bulmacayı sıkıcı yapıyor.
    const empty = solution.some((row) => row.every((c) => !c));
    if (empty || solution.every((row) => row.every((c) => c))) continue;

    const rowClues = solution.map(cluesFromLine);
    const colClues = Array.from({ length: size }, (_, col) =>
      cluesFromLine(solution.map((row) => row[col])),
    );

    if (countSolutions({ size, rowClues, colClues }) === 1) {
      return { size, solution, rowClues, colClues };
    }
  }

  // Buraya düşmek beklenmiyor; yine de tanımlı bir tahta dönmek gerekiyor.
  const fallback = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => (r + c) % 2 === 0),
  );
  return {
    size,
    solution: fallback,
    rowClues: fallback.map(cluesFromLine),
    colClues: Array.from({ length: size }, (_, col) =>
      cluesFromLine(fallback.map((row) => row[col])),
    ),
  };
}

export function nonogramSolved(
  marks: boolean[][],
  solution: boolean[][],
): boolean {
  return solution.every((row, r) => row.every((cell, c) => marks[r][c] === cell));
}

// ---------------------------------------------------------------------------
// Sudoku 6×6 (kutular 3 geniş × 2 yüksek)
// ---------------------------------------------------------------------------

export type SudokuPuzzle = {
  /** 0 = boş. */
  given: number[][];
  solution: number[][];
};

const SUDOKU_SIZE = 6;
const BOX_W = 3;
const BOX_H = 2;

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Geçerli bir 6×6 taban ızgara; satır/sütun/kutu permütasyonlarıyla çeşitleniyor. */
function makeSolvedGrid(rand: () => number): number[][] {
  const base = Array.from({ length: SUDOKU_SIZE }, (_, r) =>
    Array.from(
      { length: SUDOKU_SIZE },
      (_, c) => ((c + BOX_W * (r % BOX_H) + Math.floor(r / BOX_H)) % SUDOKU_SIZE) + 1,
    ),
  );

  const digits = shuffle([1, 2, 3, 4, 5, 6], rand);
  const remapped = base.map((row) => row.map((v) => digits[v - 1]));

  // Satırlar yalnızca kendi kutu bandı içinde, sütunlar kendi bandı içinde
  // yer değiştirebilir — aksi hâlde kutu kuralı bozulur.
  const rowBands = shuffle([0, 1, 2], rand);
  const rows: number[][] = [];
  for (const band of rowBands) {
    for (const offset of shuffle([0, 1], rand)) {
      rows.push(remapped[band * BOX_H + offset]);
    }
  }

  const colOrder: number[] = [];
  for (const band of shuffle([0, 1], rand)) {
    for (const offset of shuffle([0, 1, 2], rand)) {
      colOrder.push(band * BOX_W + offset);
    }
  }

  return rows.map((row) => colOrder.map((c) => row[c]));
}

function sudokuValid(grid: number[][], r: number, c: number, value: number): boolean {
  for (let i = 0; i < SUDOKU_SIZE; i++) {
    if (i !== c && grid[r][i] === value) return false;
    if (i !== r && grid[i][c] === value) return false;
  }
  const r0 = Math.floor(r / BOX_H) * BOX_H;
  const c0 = Math.floor(c / BOX_W) * BOX_W;
  for (let i = r0; i < r0 + BOX_H; i++) {
    for (let j = c0; j < c0 + BOX_W; j++) {
      if ((i !== r || j !== c) && grid[i][j] === value) return false;
    }
  }
  return true;
}

/** Çözüm sayısı; ikiyi görünce duruyor. */
function sudokuSolutionCount(grid: number[][]): number {
  let count = 0;
  const solve = (): void => {
    if (count > 1) return;
    for (let r = 0; r < SUDOKU_SIZE; r++) {
      for (let c = 0; c < SUDOKU_SIZE; c++) {
        if (grid[r][c] !== 0) continue;
        for (let v = 1; v <= SUDOKU_SIZE; v++) {
          if (!sudokuValid(grid, r, c, v)) continue;
          grid[r][c] = v;
          solve();
          grid[r][c] = 0;
          if (count > 1) return;
        }
        return;
      }
    }
    count++;
  };
  solve();
  return count;
}

export function makeSudoku(seed: number): SudokuPuzzle {
  const rand = seededRandom(seed);
  const solution = makeSolvedGrid(rand);
  const given = solution.map((row) => [...row]);

  // Hücreleri rastgele sırayla boşalt; tek çözüm bozulursa geri koy.
  const cells = shuffle(
    Array.from({ length: SUDOKU_SIZE * SUDOKU_SIZE }, (_, i) => i),
    rand,
  );
  for (const cell of cells) {
    const r = Math.floor(cell / SUDOKU_SIZE);
    const c = cell % SUDOKU_SIZE;
    const backup = given[r][c];
    if (backup === 0) continue;
    given[r][c] = 0;
    if (sudokuSolutionCount(given) !== 1) given[r][c] = backup;
  }

  return { given, solution };
}

export function sudokuSolved(entries: number[][], solution: number[][]): boolean {
  return solution.every((row, r) => row.every((v, c) => entries[r][c] === v));
}
