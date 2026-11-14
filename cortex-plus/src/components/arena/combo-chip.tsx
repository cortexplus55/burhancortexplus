import "@/styles/arena.css";

/** Seri çipi (Faz 4A): 2 ve üstünde "×2", "×3"; 220 ms ölçek girişi, zıplama yok. Ekran okuyucuya "2 seri". */
export function ComboChip({ combo }: { combo: number }) {
  if (combo < 2) return null;
  return (
    <span key={combo} className="cx-t-meta-s cx-combo" aria-live="polite">
      <span aria-hidden>×{combo}</span>
      <span className="sr-only">{combo} seri</span>
    </span>
  );
}
