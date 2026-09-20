import { Play, ShieldCheck, Sparkles, Timer } from "lucide-react";
import {
  PremiumPrimaryCta,
  PremiumGhostCta,
} from "@/components/marketing/premium-cta";

/**
 * Final sahne — premium butonlar + güven widget’ları.
 */
export function FilmClimaxCta() {
  return (
    <section className="mk-film-climax" aria-labelledby="film-climax-heading">
      <div className="mk-film-climax-fx" aria-hidden>
        <span className="mk-film-climax-glow" />
        <span className="mk-film-climax-grid" />
      </div>
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-24 md:py-32">
        <div className="text-center">
          <p className="mk-eyebrow">Final sahne</p>
          <h2 id="film-climax-heading" className="mk-film-climax-title">
            Buna çalışmak istememek imkânsız.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base text-[var(--mk-muted)] md:text-lg">
            Zayıf konu seçilir, koç notu yazılır, plan kilitlenir. Cortex Plus her
            oturumu ölçülebilir bir sahneye çevirir.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PremiumPrimaryCta
              href="/kayit"
              icon={<Play className="h-4 w-4 fill-current" />}
            >
              Plus ile başla
            </PremiumPrimaryCta>
            <PremiumGhostCta href="/kayit">Önce ücretsiz dene</PremiumGhostCta>
          </div>
        </div>

        <ul className="mk-trust-widgets">
          <li className="mk-trust-widget">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <div>
              <strong>Kart gerekmez</strong>
              <span>Ücretsiz başlangıç</span>
            </div>
          </li>
          <li className="mk-trust-widget">
            <Timer className="h-4 w-4" aria-hidden />
            <div>
              <strong>3 dakikada kurulum</strong>
              <span>Onboarding kısa</span>
            </div>
          </li>
          <li className="mk-trust-widget">
            <Sparkles className="h-4 w-4" aria-hidden />
            <div>
              <strong>TYT · AYT · LGS</strong>
              <span>Tek öğretmen akışı</span>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
