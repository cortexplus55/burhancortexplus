"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Sparkles,
  CheckCircle2,
  Command,
  ArrowUpRight,
} from "lucide-react";
import {
  PremiumPrimaryCta,
  PremiumGhostCta,
} from "@/components/marketing/premium-cta";

const TOPICS = [
  {
    id: "olasilik",
    label: "Olasılık",
    weak: 34,
    tip: "Bu hafta 3 kısa olasılık seti: kombinasyon → koşullu → deneme tipi.",
  },
  {
    id: "fonksiyon",
    label: "Fonksiyon",
    weak: 41,
    tip: "Grafik okuma + ters fonksiyon; yarım saatlik mikro testlerle kilidi aç.",
  },
  {
    id: "problem",
    label: "Problemler",
    weak: 48,
    tip: "İşçi-havuz yerine hız-zaman yoğunluğu: 12 soruluk sprint önerilir.",
  },
  {
    id: "turev",
    label: "Türev",
    weak: 55,
    tip: "Zincir kuralı eksik; 20 dakikalık flash + 8 soruluk kontrol.",
  },
] as const;

function greetingForNow(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return "Gece çalışması";
  if (h < 12) return "Günaydın, odak zamanı";
  if (h < 18) return "Öğleden sonra sprinti";
  return "Akşam mesaisi";
}

/**
 * Misafir hero — etkileşimli widget’lı premium sahne.
 * Konu chip’leri koç notunu ve net halkasını günceller.
 */
export function CinematicHero() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [active, setActive] = useState<(typeof TOPICS)[number]["id"]>("olasilik");
  const [greet, setGreet] = useState("Odak zamanı");
  const [ring, setRing] = useState(0);

  const topic = useMemo(
    () => TOPICS.find((t) => t.id === active) ?? TOPICS[0],
    [active],
  );

  useEffect(() => {
    setGreet(greetingForNow());
  }, []);

  useEffect(() => {
    const target = topic.weak;
    let frame = 0;
    const start = ring;
    const t0 = performance.now();
    const dur = 500;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setRing(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      frame++;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate from previous visual value
  }, [topic.weak]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const q = prompt.trim();
    if (!q) {
      router.push("/kayit");
      return;
    }
    router.push(`/kayit?prompt=${encodeURIComponent(q)}`);
  }

  return (
    <section className="mk-film-hero mk-studio-hero relative flex min-h-[min(100dvh,960px)] flex-col justify-center overflow-hidden pb-16 pt-24 md:pb-24 md:pt-28">
      <div className="mk-film-hero-fx" aria-hidden>
        <span className="mk-film-beam mk-film-beam--a" />
        <span className="mk-film-beam mk-film-beam--b" />
        <span className="mk-film-orb mk-film-orb--gold" />
        <span className="mk-film-orb mk-film-orb--violet" />
        <span className="mk-film-orb mk-film-orb--core" />
        <span className="mk-film-vignette" />
        <span className="mk-film-grain" />
        <span className="mk-film-scan" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-4 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div className="text-center lg:text-left">
          <p className="mk-film-kicker mk-section-reveal">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {greet} · TYT · AYT · LGS
          </p>
          <h1 className="mk-film-title mk-section-reveal mk-section-reveal-delay-1 mt-5">
            Zayıf konunu seç.
            <span className="mk-film-title-line">Planı izle.</span>
          </h1>
          <p className="mk-section-reveal mx-auto mt-5 max-w-xl text-base leading-relaxed text-[var(--mk-muted)] md:mx-0 md:text-lg">
            Aşağıdaki chip’lere dokun — koç notu ve net halkası anında değişir.
            Kayıt olunca aynı zekâ senin denemene bağlanır.
          </p>

          <div
            className="mk-section-reveal mk-section-reveal-delay-2 mk-topic-chip-row mx-auto mt-7 lg:mx-0"
            role="listbox"
            aria-label="Zayıf konu seç"
          >
            {TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={active === t.id}
                className={
                  active === t.id
                    ? "mk-topic-chip mk-topic-chip--on"
                    : "mk-topic-chip"
                }
                onClick={() => setActive(t.id)}
              >
                {t.label}
                <em>%{t.weak}</em>
              </button>
            ))}
          </div>

          <form
            onSubmit={onSubmit}
            className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-7 max-w-xl lg:mx-0"
          >
            <label htmlFor="hero-prompt" className="sr-only">
              AI öğretmene komut
            </label>
            <div className="mk-command-bar">
              <Command className="mk-command-bar-ico" aria-hidden />
              <input
                id="hero-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={`${topic.label} için bu hafta ne yapmalıyım?`}
                autoComplete="off"
              />
              <kbd className="mk-command-kbd" aria-hidden>
                ⌘↵
              </kbd>
              <button type="submit" className="mk-command-go" aria-label="Gönder">
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </form>

          <ul className="mk-section-reveal mk-section-reveal-delay-2 mx-auto mt-5 flex max-w-xl flex-col gap-2 text-sm text-[var(--mk-muted)] lg:mx-0">
            {[
              "Kart gerekmez — hemen başla",
              "Seçtiğin konu kayda taşınır",
              "Plus ile daha derin model",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center justify-center gap-2 lg:justify-start"
              >
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-[var(--mk-primary)]"
                  aria-hidden
                />
                {item}
              </li>
            ))}
          </ul>

          <div className="mk-section-reveal mk-section-reveal-delay-2 mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <PremiumPrimaryCta
              href="/kayit"
              icon={<Play className="h-4 w-4 fill-current" />}
            >
              Ücretsiz dene
            </PremiumPrimaryCta>
            <PremiumGhostCta href="/ornek">Canlı örneği aç</PremiumGhostCta>
          </div>
        </div>

        <div className="mk-section-reveal mk-section-reveal-delay-2 mk-studio-stack mx-auto w-full max-w-lg lg:mx-0 lg:max-w-none">
          <div className="mk-studio-stack-glow" aria-hidden />

          <article className="mk-glass-widget mk-glass-widget--ring">
            <div className="mk-net-ring" style={{ ["--p" as string]: String(ring) }}>
              <strong>%{ring}</strong>
              <span>hazırlık</span>
            </div>
            <div>
              <p className="mk-glass-widget-kicker">Canlı net tahmini</p>
              <h2>{topic.label}</h2>
              <p>
                Seçiminle güncellenir. Kayıt sonrası deneme verine bağlanır —
                tahmin değil, senin eğrin.
              </p>
            </div>
          </article>

          <article className="mk-glass-widget mk-glass-widget--coach">
            <p className="mk-glass-widget-kicker">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              AI koç notu
            </p>
            <p className="mk-coach-tip">{topic.tip}</p>
            <div className="mk-widget-actions">
              <PremiumPrimaryCta href={`/kayit?topic=${topic.id}`}>
                Bu planla başla
              </PremiumPrimaryCta>
              <PremiumGhostCta href="/ornek">Önce izle</PremiumGhostCta>
            </div>
          </article>

          <article className="mk-glass-widget mk-glass-widget--mini" aria-hidden>
            <div className="mk-mini-chrome">
              <span />
              <span />
              <span />
              <em>Soru çözücü</em>
            </div>
            <p className="mk-mini-q">log₂(x) + log₂(x−2) = 3</p>
            <ol>
              <li>Tanım: x &gt; 2</li>
              <li>log₂[x(x−2)] = 3</li>
              <li>x = 4 ✓</li>
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}
