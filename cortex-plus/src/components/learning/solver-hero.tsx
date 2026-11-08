import { Icon3D } from "@/components/ui/icon-3d";
import { STUDIOS } from "@/lib/parity/studios";

const STUDIO = STUDIOS.find((item) => item.id === "soru-coz")!;

/** Soru Çöz'ün stüdyo rengi; sayfa kabı `--solver-accent` olarak alır. */
export const SOLVER_ACCENT = STUDIO.accent;

/**
 * Soru Çöz başlığı (8 Kasım 2026, ürün sahibinin onayı): Çalışma Stüdyosu'ndaki kartıyla aynı 3B simge, ad, renk.
 * Günlük fotoğraf hakkı yalnız ücretsiz hesapta yazılır (Plus ve kurucu da okuyordu).
 */
export function SolverHero({ freeAccount }: { freeAccount: boolean }) {
  return (
    <header className="cp-solver-hero">
      <span className="cp-solver-hero-art" aria-hidden>
        <span className="cp-solver-hero-plate" />
        <Icon3D name={STUDIO.icon} size={72} />
      </span>
      <span className="cp-solver-hero-text">
        <h1 className="cp-solver-hero-title">{STUDIO.title}</h1>
        <span className="cp-solver-hero-blurb">{STUDIO.blurb}</span>
        <span className="cp-solver-hero-facts">
          <span>Her şıkkın açıklaması</span>
          <span>Akılda kalacak kısa kural</span>
          {freeAccount ? <span className="cp-solver-hero-quota">Ücretsiz: günde 1 fotoğraf</span> : null}
        </span>
      </span>
    </header>
  );
}
