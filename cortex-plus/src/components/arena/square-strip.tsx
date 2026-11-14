import "@/styles/arena.css";

/** Kare dizisi (Faz 4A): her soru bir kare; durum şekil ve glifle de söylenir (renk tek başına anlam taşımaz). */
export type SquareState = "correct" | "wrong" | "skipped" | "double" | "pending";

const GLYPH: Record<SquareState, string> = { correct: "✓", wrong: "✕", skipped: "–", double: "×2", pending: "" };

export function squareSummary(items: readonly { state: SquareState }[]): string {
  const count = (state: SquareState) => items.filter((item) => item.state === state).length;
  const correct = count("correct") + count("double");
  const parts = [`${correct} doğru`, `${count("wrong")} yanlış`];
  if (count("skipped")) parts.push(`${count("skipped")} boş`);
  return parts.join(", ");
}

export function SquareStrip({ items }: { items: readonly { state: SquareState }[] }) {
  return (
    <ol className="cx-squares" role="img" aria-label={squareSummary(items)}>
      {items.map((item, index) => (
        <li key={index} className="cx-square cx-t-meta-xs" data-state={item.state} aria-hidden>
          {GLYPH[item.state]}
        </li>
      ))}
    </ol>
  );
}
