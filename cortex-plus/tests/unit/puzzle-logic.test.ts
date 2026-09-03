import { describe, expect, it } from "vitest";
import {
  hanoiCanMove,
  hanoiInitial,
  hanoiMinMoves,
  hanoiMove,
  hanoiSolved,
  makeNonogram,
  makeSudoku,
  nonogramSolved,
  sudokuSolved,
} from "@/lib/parity/puzzle-logic";
import {
  DAILY_PUZZLES,
  formatDuration,
  puzzleSeed,
} from "@/lib/parity/daily-puzzles";

/** Bulmaca üreticileri tohuma bağlı; bir kez bozulursa herkesin günü bozulur. */

describe("Hanoi", () => {
  it("büyük diski küçüğün üstüne koymaz", () => {
    const state = hanoiInitial(3);
    const moved = hanoiMove(state, 0, 1); // en küçük disk 1. çubuğa
    expect(moved[1]).toEqual([1]);
    // 2 numaralı disk 1'in üstüne konamaz.
    expect(hanoiCanMove(moved, 0, 1)).toBe(false);
  });

  it("boş çubuktan taşımaz", () => {
    expect(hanoiCanMove(hanoiInitial(3), 1, 2)).toBe(false);
  });

  it("geçersiz hamlede durumu değiştirmez", () => {
    const state = hanoiInitial(3);
    expect(hanoiMove(state, 1, 2)).toBe(state);
  });

  it("hepsi son çubuğa gelince çözülür", () => {
    let state = hanoiInitial(3);
    // 3 disk için bilinen 7 hamlelik en kısa çözüm.
    const moves: [number, number][] = [
      [0, 2], [0, 1], [2, 1], [0, 2], [1, 0], [1, 2], [0, 2],
    ];
    for (const [from, to] of moves) state = hanoiMove(state, from, to);
    expect(hanoiSolved(state, 3)).toBe(true);
    expect(moves).toHaveLength(hanoiMinMoves(3));
  });
});

describe("Nonogram", () => {
  it("ipuçları çözümle tutarlı ve tahta tek çözümlü", () => {
    for (const day of ["2026-09-04", "2026-09-05", "2026-12-31"]) {
      const puzzle = makeNonogram(puzzleSeed("nonogram", day));
      expect(puzzle.rowClues).toHaveLength(puzzle.size);
      expect(puzzle.colClues).toHaveLength(puzzle.size);

      // Satır ipuçlarının toplamı ile dolu hücre sayısı eşleşmeli.
      const clueTotal = puzzle.rowClues.flat().reduce((a, b) => a + b, 0);
      const filled = puzzle.solution.flat().filter(Boolean).length;
      expect(clueTotal).toBe(filled);

      expect(nonogramSolved(puzzle.solution, puzzle.solution)).toBe(true);
    }
  });

  it("aynı gün aynı tahtayı verir", () => {
    const a = makeNonogram(puzzleSeed("nonogram", "2026-09-04"));
    const b = makeNonogram(puzzleSeed("nonogram", "2026-09-04"));
    expect(a.solution).toEqual(b.solution);
  });

  it("farklı günler farklı tahta verir", () => {
    const a = makeNonogram(puzzleSeed("nonogram", "2026-09-04"));
    const b = makeNonogram(puzzleSeed("nonogram", "2026-09-05"));
    expect(a.solution).not.toEqual(b.solution);
  });
});

describe("Sudoku 6x6", () => {
  const boxOf = (r: number, c: number) =>
    `${Math.floor(r / 2)}-${Math.floor(c / 3)}`;

  it("çözüm satır, sütun ve kutu kurallarını sağlar", () => {
    const { solution } = makeSudoku(puzzleSeed("sudoku", "2026-09-04"));
    for (let i = 0; i < 6; i++) {
      expect(new Set(solution[i]).size).toBe(6);
      expect(new Set(solution.map((row) => row[i])).size).toBe(6);
    }
    const boxes = new Map<string, Set<number>>();
    solution.forEach((row, r) =>
      row.forEach((v, c) => {
        const key = boxOf(r, c);
        if (!boxes.has(key)) boxes.set(key, new Set());
        boxes.get(key)!.add(v);
      }),
    );
    expect(boxes.size).toBe(6);
    for (const values of boxes.values()) expect(values.size).toBe(6);
  });

  it("verilen ipuçları çözümle çelişmez ve boşluk bırakır", () => {
    const { given, solution } = makeSudoku(puzzleSeed("sudoku", "2026-09-06"));
    let blanks = 0;
    given.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v === 0) blanks++;
        else expect(v).toBe(solution[r][c]);
      }),
    );
    expect(blanks).toBeGreaterThan(0);
  });

  it("tam çözüm kabul edilir, eksik çözüm edilmez", () => {
    const { given, solution } = makeSudoku(puzzleSeed("sudoku", "2026-09-07"));
    expect(sudokuSolved(solution, solution)).toBe(true);
    expect(sudokuSolved(given, solution)).toBe(false);
  });
});

describe("Süre biçimi", () => {
  it("Astra'nın gösterdiği biçimi üretir", () => {
    expect(formatDuration(41_900)).toBe("41.9s");
    expect(formatDuration(4_500)).toBe("4.5s");
    expect(formatDuration(117_800)).toBe("1:57.8");
    // Saniye tek haneliyken sıfır dolgusu bozulmamalı.
    expect(formatDuration(63_000)).toBe("1:03.0");
  });
});

describe("Katalog", () => {
  it("her bulmacanın kimliği benzersiz", () => {
    const ids = DAILY_PUZZLES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
