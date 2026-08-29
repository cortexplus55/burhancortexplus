import Link from "next/link";
import { cn } from "@/lib/utils";
import "@/styles/astra-marketing.css";
import "@/styles/cinematic-home.css";
import { ArrowRight } from "lucide-react";
import { AstraSiteHeader } from "@/components/marketing/astra-site-header";
import { CinematicPrimaryCta } from "@/components/marketing/cinematic-cta";
import { MARKETING_SUBJECTS } from "@/lib/parity/marketing-subjects";
import { CinematicPageHero } from "@/components/marketing/cinematic-page-hero";
import { CinematicScrollReveal } from "@/components/marketing/cinematic-scroll-reveal";

const faqs = [
  {
    q: "Cortex Plus nedir?",
    a: "Tüm dersler için kişisel AI öğretmenin. Soru çöz, deneme üret, eksiklerini gör.",
  },
  {
    q: "Ücretsiz deneyebilir miyim?",
    a: "Evet. Kayıt olmadan marketing sayfalarını gezebilir; uygulama için ücretsiz haklarla başlarsın.",
  },
  {
    q: "ChatGPT'den farkı ne?",
    a: "Sınav odaklı adım adım çözüm, deneme analizi ve çalışma planı tek uygulamada.",
  },
];

export { AstraSiteHeader } from "@/components/marketing/astra-site-header";

export function AstraSiteFooter() {
  return (
    <footer className="astra-marketing border-t border-[var(--mk-border)] py-12 text-sm text-[var(--mk-muted)]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-4">
        <div>
          <p className="font-semibold text-[var(--mk-text)]">Cortex Plus</p>
          <p className="mt-2">Çalışma ve sınav hazırlığı için AI öğretmen.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/sinav-hazirligi">Sınav hazırlığı</Link>
          <Link href="/mobil-uygulama">Mobil uygulama</Link>
          <Link href="/ozellikler">Özellikler</Link>
          <Link href="/yaratici-program">Yaratıcı program</Link>
          <Link href="/fiyatlandirma">Fiyatlandırma</Link>
          <Link href="/yardim">Yardım</Link>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/gizlilik">Gizlilik</Link>
          <Link href="/kvkk">KVKK</Link>
          <Link href="/kullanim-kosullari">Kullanım koşulları</Link>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/iletisim">Bize ulaşın</Link>
          <Link href="/hakkimizda">Künye</Link>
        </div>
      </div>
    </footer>
  );
}

export function AstraMarketingHero() {
  return (
    <section className="mk-hero-gradient px-4 pb-20 pt-16 md:pt-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="text-sm font-medium text-[var(--mk-primary)]">
          Tüm dersler için AI öğretmen
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Çalışma ve sınav hazırlığında 2 kat hızlı öğren
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--mk-muted)]">
          Fotoğraftan soru çözümü, deneme sınavları, sözlü pratik ve onlarca
          interaktif uygulama — hepsi Cortex Plus&apos;ta.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/kayit" className="mk-btn-primary inline-flex px-8 py-3.5 text-sm">
            ÜCRETSİZ DENE
          </Link>
          <Link
            href="/fiyatlandirma"
            className="mk-btn-outline inline-flex items-center gap-2 px-8 py-3.5 text-sm font-medium"
          >
            CORTEX PLUS SATIN AL
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function AstraSubjectGrid() {
  return (
    <section className="border-t border-[var(--mk-border)] py-16" data-cinematic-reveal>
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-2xl font-bold md:text-3xl">
          Her ders için AI desteği
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--mk-muted)]">
          Matematikten felsefeye — anlaşılır adımlar ve gerçek sınav pratiği.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MARKETING_SUBJECTS.map((s) => (
            <Link
              key={s.slug}
              href={`/kayit?ders=${s.slug}`}
              className="mk-card group p-5 transition-colors hover:border-[var(--mk-primary)]"
            >
              <span className="text-2xl" aria-hidden>
                {s.emoji}
              </span>
              <h3 className="mt-3 font-semibold">{s.label}</h3>
              <p className="mt-1 text-sm text-[var(--mk-muted)]">{s.blurb}</p>
            </Link>
          ))}
          <Link
            href="/kayit"
            className="mk-card flex flex-col justify-center border-dashed p-5 text-center hover:border-[var(--mk-primary)]"
          >
            <p className="font-semibold">Aradığın ders yok mu?</p>
            <p className="mt-1 text-sm text-[var(--mk-muted)]">
              İstediğin dersi kendin oluştur — tıkla.
            </p>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function AstraFeatureStrip() {
  const items = [
    {
      title: "Sözlü sınav",
      body: "Soruları sesli yanıtla, ek soruları yönet, sonunda not al.",
      href: "/ogretmen",
    },
    {
      title: "Deneme sınavı",
      body: "Süre dolmadan yazılı yanıtla; AI notlandırır ve zayıf noktalarını gösterir.",
      href: "/sinav-hazirligi",
    },
    {
      title: "Fotoğraftan çözüm",
      body: "Sorunun fotoğrafını çek; adım adım açıklama al.",
      href: "/soru-coz",
    },
  ];
  return (
    <section className="py-16" data-cinematic-reveal>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 md:grid-cols-3">
        {items.map((item) => (
          <Link key={item.title} href={item.href} className="mk-card block p-6">
            <h3 className="text-lg font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm text-[var(--mk-muted)]">{item.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function AstraFaqSection() {
  return (
    <section className="border-t border-[var(--mk-border)] py-16" data-cinematic-reveal>
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="text-center text-2xl font-bold">Sık sorulanlar</h2>
        <div className="mt-8 space-y-3">
          {faqs.map((item) => (
            <details key={item.q} className="mk-card group p-4">
              <summary className="cursor-pointer list-none font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-[var(--mk-muted)]">{item.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <CinematicPrimaryCta label="Başla" />
        </div>
      </div>
    </section>
  );
}

export function AstraMarketingPage({
  children,
  title,
  description,
  className,
  variant = "marketing",
}: {
  children?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  variant?: "marketing" | "auth" | "legal" | "home";
}) {
  const shellClass = cn(
    "astra-marketing cinematic-marketing flex min-h-screen flex-col",
    variant === "home" && "cinematic-home",
    variant === "auth" && "cinematic-auth",
    className,
  );

  return (
    <div className={shellClass}>
      <AstraSiteHeader />
      <CinematicScrollReveal>
        <main className="flex-1">
          {title && variant === "marketing" ? (
            <CinematicPageHero title={title} description={description} />
          ) : null}
          {variant === "auth" ? (
            <div className="mk-auth-stack">
              {title ? (
                <div className="mb-6 text-center" data-cinematic-reveal>
                  <h1 className="mk-display text-3xl">{title}</h1>
                  {description ? (
                    <p className="mt-2 text-sm text-[var(--mk-muted)]">
                      {description}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {children}
            </div>
          ) : variant === "legal" ? (
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-10" data-cinematic-reveal>
              <h1 className="mk-display text-3xl md:text-4xl">{title}</h1>
              {description ? (
                <p className="mt-3 max-w-2xl text-[var(--mk-muted)]">
                  {description}
                </p>
              ) : null}
              <div className="mt-8">{children}</div>
            </div>
          ) : (
            children
          )}
        </main>
      </CinematicScrollReveal>
      <AstraSiteFooter />
    </div>
  );
}
