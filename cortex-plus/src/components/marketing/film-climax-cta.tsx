import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Sakin final CTA — Astra brief. */
export function FilmClimaxCta() {
  return (
    <section className="mk-astra-climax" aria-labelledby="astra-climax-heading">
      <div className="mk-astra-climax-inner">
        <h2 id="astra-climax-heading">Study smarter.</h2>
        <p>Sınava özel AI öğretmen, tek akışta. Kart gerekmez.</p>
        <div className="mk-astra-cta-row mk-astra-cta-row--center">
          <Link href="/kayit" className="mk-astra-btn-primary">
            Ücretsiz dene
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/ornek" className="mk-astra-btn-secondary">
            Ürünü gör
          </Link>
        </div>
      </div>
    </section>
  );
}
