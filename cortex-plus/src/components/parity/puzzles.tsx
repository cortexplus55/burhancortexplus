"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  hanoiCanMove,
  hanoiDiscCount,
  hanoiInitial,
  hanoiMinMoves,
  hanoiMove,
  hanoiSolved,
  makeNonogram,
  makeSudoku,
  nonogramSolved,
  sudokuSolved,
  type HanoiState,
} from "@/lib/parity/puzzle-logic";

type Solved = { onSolved: (moves?: number) => void };

// ---------------------------------------------------------------------------
// Hanoi Kulesi
// ---------------------------------------------------------------------------

export function HanoiPuzzle({ seed, onSolved }: { seed: number } & Solved) {
  const discs = useMemo(() => hanoiDiscCount(seed), [seed]);
  const [state, setState] = useState<HanoiState>(() => hanoiInitial(discs));
  const [picked, setPicked] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [done, setDone] = useState(false);

  function tapPeg(index: number) {
    if (done) return;
    if (picked === null) {
      if (state[index].length) setPicked(index);
      return;
    }
    if (picked === index) {
      setPicked(null);
      return;
    }
    if (!hanoiCanMove(state, picked, index)) {
      // Geçersiz hamlede seçimi bırakmak, kullanıcıyı yanlış çubuğa kilitlemez.
      setPicked(null);
      return;
    }
    const next = hanoiMove(state, picked, index);
    const count = moves + 1;
    setState(next);
    setMoves(count);
    setPicked(null);
    if (hanoiSolved(next, discs)) {
      setDone(true);
      onSolved(count);
    }
  }

  return (
    <div className="ap-hanoi">
      <p className="ap-pz-hint">
        {discs} disk · en az {hanoiMinMoves(discs)} hamle · şu an {moves}
      </p>
      <div className="ap-hanoi-board">
        {state.map((peg, index) => (
          <button
            key={index}
            type="button"
            className={cn("ap-hanoi-peg", picked === index && "is-picked")}
            onClick={() => tapPeg(index)}
            aria-label={`${index + 1}. çubuk, ${peg.length} disk`}
          >
            <span className="ap-hanoi-rod" aria-hidden />
            <span className="ap-hanoi-stack">
              {peg.map((disc) => (
                <span
                  key={disc}
                  className="ap-hanoi-disc"
                  style={{ width: `${30 + disc * (60 / discs)}%` }}
                >
                  {disc}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nonogram
// ---------------------------------------------------------------------------

/** 0 = boş, 1 = dolu, 2 = çarpı (kullanıcı notu, çözümü etkilemez). */
type Mark = 0 | 1 | 2;

export function NonogramPuzzle({ seed, onSolved }: { seed: number } & Solved) {
  const puzzle = useMemo(() => makeNonogram(seed), [seed]);
  const [marks, setMarks] = useState<Mark[][]>(() =>
    Array.from({ length: puzzle.size }, () =>
      Array<Mark>(puzzle.size).fill(0),
    ),
  );
  const [done, setDone] = useState(false);

  const clueRows = Math.max(...puzzle.colClues.map((c) => c.length));
  const clueCols = Math.max(...puzzle.rowClues.map((c) => c.length));

  function cycle(r: number, c: number) {
    if (done) return;
    // Yeni durum güncelleyicinin DIŞINDA hesaplanıyor: React güncelleyiciyi
    // iki kez çalıştırabilir, yan etki içeride olsaydı çözüm iki kez
    // gönderilirdi.
    const next = marks.map((row) => [...row]) as Mark[][];
    next[r][c] = ((next[r][c] + 1) % 3) as Mark;
    setMarks(next);

    // Yalnızca "dolu" işaretler çözümle karşılaştırılır; çarpı bir nottur.
    const filled = next.map((row) => row.map((m) => m === 1));
    if (nonogramSolved(filled, puzzle.solution)) {
      setDone(true);
      onSolved();
    }
  }

  return (
    <div className="ap-nono">
      <p className="ap-pz-hint">
        Tıkla: boş → dolu → çarpı. Çarpı yalnızca senin notun.
      </p>
      <div
        className="ap-nono-grid"
        // Sütun sayısı ipucu genişliğine göre değişiyor; hücre boyutu CSS'te.
        style={{
          gridTemplateColumns: `repeat(${clueCols + puzzle.size}, var(--nono-cell))`,
        }}
      >
        {/* Sol üst boşluk + sütun ipuçları */}
        {Array.from({ length: clueRows }).map((_, rowIndex) => (
          <div key={`ch-${rowIndex}`} style={{ display: "contents" }}>
            {Array.from({ length: clueCols }).map((_, i) => (
              <span key={`pad-${rowIndex}-${i}`} className="ap-nono-pad" />
            ))}
            {puzzle.colClues.map((clues, col) => {
              const shown = clues.filter((n) => n > 0);
              const offset = clueRows - shown.length;
              const value = rowIndex >= offset ? shown[rowIndex - offset] : null;
              return (
                <span key={`cc-${rowIndex}-${col}`} className="ap-nono-clue">
                  {value ?? ""}
                </span>
              );
            })}
          </div>
        ))}

        {/* Satır ipuçları + hücreler */}
        {puzzle.rowClues.map((clues, row) => {
          const shown = clues.filter((n) => n > 0);
          const offset = clueCols - shown.length;
          return (
            <div key={`r-${row}`} style={{ display: "contents" }}>
              {Array.from({ length: clueCols }).map((_, i) => (
                <span key={`rc-${row}-${i}`} className="ap-nono-clue">
                  {i >= offset ? shown[i - offset] : ""}
                </span>
              ))}
              {Array.from({ length: puzzle.size }).map((_, col) => (
                <button
                  key={`c-${row}-${col}`}
                  type="button"
                  className={cn(
                    "ap-nono-cell",
                    marks[row][col] === 1 && "is-filled",
                    marks[row][col] === 2 && "is-cross",
                  )}
                  onClick={() => cycle(row, col)}
                  aria-label={`${row + 1}. satır ${col + 1}. sütun`}
                >
                  {marks[row][col] === 2 ? "×" : ""}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sudoku 6×6
// ---------------------------------------------------------------------------

export function SudokuPuzzle({ seed, onSolved }: { seed: number } & Solved) {
  const puzzle = useMemo(() => makeSudoku(seed), [seed]);
  const [entries, setEntries] = useState<number[][]>(() =>
    puzzle.given.map((row) => [...row]),
  );
  const [active, setActive] = useState<[number, number] | null>(null);
  const [done, setDone] = useState(false);

  function place(value: number) {
    if (done || !active) return;
    const [r, c] = active;
    if (puzzle.given[r][c] !== 0) return;

    const next = entries.map((row) => [...row]);
    next[r][c] = next[r][c] === value ? 0 : value;
    setEntries(next);

    if (sudokuSolved(next, puzzle.solution)) {
      setDone(true);
      onSolved();
    }
  }

  return (
    <div className="ap-sud">
      <p className="ap-pz-hint">
        Hücreyi seç, sonra sayıya bas. Aynı sayıya tekrar basmak siler.
      </p>
      <div className="ap-sud-grid">
        {entries.map((row, r) =>
          row.map((value, c) => {
            const fixed = puzzle.given[r][c] !== 0;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                className={cn(
                  "ap-sud-cell",
                  fixed && "is-fixed",
                  active?.[0] === r && active?.[1] === c && "is-active",
                  // 3×2 kutu sınırları
                  c % 3 === 0 && c !== 0 && "has-left",
                  r % 2 === 0 && r !== 0 && "has-top",
                )}
                onClick={() => !fixed && setActive([r, c])}
                aria-label={`${r + 1}. satır ${c + 1}. sütun${fixed ? ", verilen" : ""}`}
              >
                {value === 0 ? "" : value}
              </button>
            );
          }),
        )}
      </div>
      <div className="ap-sud-pad">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            type="button"
            className="ap-sud-key"
            onClick={() => place(n)}
            disabled={!active}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
