import Link from "next/link";
import { Play, Star } from "lucide-react";

/**
 * Satın alma zirvesi — film final sahnesi.
 * Sahte metrik yok; mevcut ürün vaadi + güçlü CTA.
 */
export function FilmClimaxCta() {
  return (
    <section className="mk-film-climax" aria-labelledby="film-climax-heading">
      <div className="mk-film-climax-fx" aria-hidden>
        <span className="mk-film-climax-glow" />
        <span className="mk-film-climax-grid" />
      </div>
      <div className="relative z-10 mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
        <p className="mk-eyebrow">Final sahne</p>
        <h2 id="film-climax-heading" className="mk-film-climax-title">
          Buna çalışmak istememek imkânsız.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--mk-muted)] md:text-lg">
          Zayıf konuların görünür, planın net, her çalışma bir hedefe bağlı.
          Cortex Plus her oturumu sahneye çevirir.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/kayit" className="mk-btn-play mk-btn-play--film">
            <span className="mk-btn-play-icon" aria-hidden>
              <Play className="h-4 w-4 fill-current" />
            </span>
            Plus ile başla
          </Link>
          <Link href="/kayit" className="mk-btn-ghost">
            Önce ücretsiz dene
          </Link>
        </div>
        <ul className="mk-film-climax-chips">
          <li>
            <Star className="h-3.5 w-3.5" aria-hidden />
            Kart gerekmez
          </li>
          <li>TYT · AYT · LGS</li>
          <li>Tek akışta öğretmen</li>
        </ul>
      </div>
    </section>
  );
}
