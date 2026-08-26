import Link from "next/link";
import { cn } from "@/lib/utils";
import "@/styles/origin-marketing.css";
import { ArrowRight } from "lucide-react";
import { MARKETING_SUBJECTS } from "@/lib/parity/marketing-subjects";
import {
  ORIGIN_FEATURE_LABELS,
  ORIGIN_HERO_FEATURES,
  originFeatureBg,
} from "@/lib/origin/feature-colors";
import { OriginHeroAiPrompt } from "@/components/marketing/origin-hero-prompt";

const nav = [
  { href: "/sinav-hazirligi", label: "Sınav hazırlığı" },
  { href: "/ozellikler", label: "Özellikler" },
  { href: "/yardim", label: "Yardım" },
];

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

export function OriginSiteHeader() {
  return (
    <header className="origin-marketing-header sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 max-w-[var(--page-max-width)] items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="font-display text-lg font-light tracking-tight text-[var(--color-cloud)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Cortex Plus
        </Link>
        <nav className="hidden items-center gap-2 md:flex">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="mk-btn-ghost-nav">
              {item.label.toUpperCase()}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/giris"
            className="hidden px-3 py-1.5 text-sm text-[var(--color-ash)] hover:text-[var(--color-cloud)] sm:inline"
          >
            Giriş yap
          </Link>
          <Link href="/kayit" className="mk-btn-primary hidden px-4 py-2 text-sm sm:inline-flex">
            Ücretsiz dene
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export function OriginSiteFooter() {
  return (
    <footer className="border-t border-[var(--mk-border)] py-12 text-sm text-[var(--mk-muted)]">
      <div className="mx-auto grid max-w-[var(--page-max-width)] gap-8 px-4 md:grid-cols-4">
        <div>
          <p
            className="text-[var(--mk-text)]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}
          >
            Cortex Plus
          </p>
          <p className="mt-2">Çalışma ve sınav hazırlığı için AI öğretmen.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/sinav-hazirligi">Sınav hazırlığı</Link>
          <Link href="/mobil-uygulama">Mobil uygulama</Link>
          <Link href="/ogretmenler-ve-profesorler-icin">Öğretmenler</Link>
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

export function OriginMarketingHero() {
  return (
    <section className="mk-hero-atmosphere px-4 pb-20 pt-16 md:pt-24">
      <div className="mx-auto max-w-4xl text-center">
        <p className="mk-mono-eyebrow inline-flex rounded-full border border-white/15 bg-white/[0.12] px-8 py-2.5">
          Tüm dersler · AI öğretmen
        </p>
        <h1
          className="mk-display mt-8 text-[clamp(2.5rem,8vw,5rem)] leading-[0.95] md:text-[5rem]"
        >
          <span className="italic">Çalış</span> ve sınav hazırlığında
          <br className="hidden sm:block" /> iki kat hızlı öğren
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-lg font-light leading-relaxed text-[var(--color-ash)]">
          Fotoğraftan soru çözümü, deneme sınavları, sözlü pratik ve onlarca
          interaktif uygulama — hepsi Cortex Plus&apos;ta.
        </p>
        <OriginHeroAiPrompt />
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/kayit" className="mk-btn-primary px-8 py-3.5 text-sm">
            Ücretsiz dene
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/fiyatlandirma" className="mk-btn-outline px-8 py-3.5 text-sm">
            Plus satın al
          </Link>
        </div>
      </div>
    </section>
  );
}

export function OriginFeatureStrip() {
  return (
    <section className="py-16">
      <div className="mx-auto grid max-w-[var(--page-max-width)] gap-3 px-4 md:grid-cols-3">
        {ORIGIN_HERO_FEATURES.map((key) => {
          const item = ORIGIN_FEATURE_LABELS[key];
          return (
            <Link
              key={key}
              href={item.href}
              className="mk-feature-tile block"
              style={{ backgroundColor: originFeatureBg(key) }}
            >
              <h3>{item.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-white/90">{item.body}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function OriginSubjectGrid() {
  return (
    <section className="border-t border-[var(--mk-border)] py-16">
      <div className="mx-auto max-w-[var(--page-max-width)] px-4">
        <h2
          className="mk-display text-center text-3xl md:text-[2.375rem]"
        >
          Her ders için AI desteği
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--mk-muted)]">
          Matematikten felsefeye — anlaşılır adımlar ve gerçek sınav pratiği.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MARKETING_SUBJECTS.map((s) => (
            <Link
              key={s.slug}
              href={`/kayit?ders=${s.slug}`}
              className="mk-card group p-5 transition-colors hover:bg-[var(--color-steel)]"
            >
              <span className="text-2xl" aria-hidden>
                {s.emoji}
              </span>
              <h3 className="mt-3 font-normal text-[var(--color-cloud)]">{s.label}</h3>
              <p className="mt-1 text-sm text-[var(--mk-muted)]">{s.blurb}</p>
            </Link>
          ))}
          <Link
            href="/kayit"
            className="mk-card flex flex-col justify-center border-dashed p-5 text-center hover:bg-[var(--color-steel)]"
          >
            <p className="font-normal text-[var(--color-cloud)]">Aradığın ders yok mu?</p>
            <p className="mt-1 text-sm text-[var(--mk-muted)]">
              İstediğin dersi kendin oluştur — tıkla.
            </p>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function OriginStatBand() {
  return (
    <section className="px-4 py-12">
      <div className="mx-auto grid max-w-[var(--page-max-width)] gap-3 md:grid-cols-2">
        <div className="mk-stat-inverted">
          <p className="mk-mono-eyebrow text-[var(--color-void)]/70">Adım adım</p>
          <h3
            className="mt-2 text-[2.375rem] leading-[0.9]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}
          >
            Sınav odaklı çözüm
          </h3>
          <p className="mt-3 text-base text-[var(--color-void)]/80">
            Genel sohbet botu değil; müfredata uygun açıklama ve deneme analizi.
          </p>
        </div>
        <div className="mk-stat-inverted">
          <p className="mk-mono-eyebrow text-[var(--color-void)]/70">Şeffaf kredi</p>
          <h3
            className="mt-2 text-[2.375rem] leading-[0.9]"
            style={{ fontFamily: "var(--font-display)", fontWeight: 300 }}
          >
            Her işlem öncesi görünür
          </h3>
          <p className="mt-3 text-base text-[var(--color-void)]/80">
            Harcanacak kredi gösterilir; işlem başarısızsa iade edilir.
          </p>
        </div>
      </div>
    </section>
  );
}

export function OriginFaqSection() {
  return (
    <section className="border-t border-[var(--mk-border)] py-16">
      <div className="mx-auto max-w-2xl px-4">
        <h2 className="mk-display text-center text-3xl">Sık sorulanlar</h2>
        <div className="mt-8 space-y-3">
          {faqs.map((item) => (
            <details key={item.q} className="mk-card group p-4">
              <summary className="cursor-pointer list-none font-normal text-[var(--color-cloud)] marker:content-none [&::-webkit-details-marker]:hidden">
                {item.q}
              </summary>
              <p className="mt-3 text-sm text-[var(--mk-muted)]">{item.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/kayit" className={cn("mk-btn-primary inline-flex px-8 py-3 text-sm")}>
            Ücretsiz dene
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function OriginMarketingPage({
  children,
  title,
}: {
  children?: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="origin-marketing flex min-h-screen flex-col">
      <OriginSiteHeader />
      <main className="flex-1">
        {title ? (
          <div className="mx-auto max-w-[var(--page-max-width)] px-4 py-10">
            <h1
              className="mk-display text-4xl md:text-5xl"
            >
              {title}
            </h1>
          </div>
        ) : null}
        {children}
      </main>
      <OriginSiteFooter />
    </div>
  );
}

/** @deprecated Use Origin* exports — thin aliases for migration */
export const AstraSiteHeader = OriginSiteHeader;
export const AstraSiteFooter = OriginSiteFooter;
export const AstraMarketingHero = OriginMarketingHero;
export const AstraFeatureStrip = OriginFeatureStrip;
export const AstraSubjectGrid = OriginSubjectGrid;
export const AstraFaqSection = OriginFaqSection;
export const AstraMarketingPage = OriginMarketingPage;
