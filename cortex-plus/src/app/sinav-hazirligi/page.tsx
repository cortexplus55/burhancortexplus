import Link from "next/link";
import { OriginMarketingPage } from "@/components/marketing/origin-marketing";
import "@/styles/origin-marketing.css";

export const metadata = {
  title: "Sınav hazırlığı",
  description:
    "Deneme sınavı, eksik konu analizi ve kişisel çalışma planıyla sınavına hazırlan.",
};

const steps = [
  {
    title: "Seviyeni belirle",
    body: "Kısa onboarding ile sınıfını, odak dersini ve hedefini kaydet.",
  },
  {
    title: "Deneme çöz",
    body: "Konu bazlı deneme üret, süreyi takip et, puanını anında gör.",
  },
  {
    title: "Eksiklerini gör",
    body: "Yanlışlarından çıkarılan eksik konu listesi ilerleme sayfanda birikir.",
  },
  {
    title: "Planına dön",
    body: "Eksiklere göre haftalık çalışma planını güncelle ve görevleri işaretle.",
  },
];

const faq = [
  '"Sınav Hazırlığı" nedir?',
  "Kullanmanın temel faydaları nelerdir?",
  "ChatGPT ile öğrenmekten neden daha iyidir?",
  "Hangi dersler için çalışabilirim?",
];

export default function SinavHazirligiPage() {
  return (
    <OriginMarketingPage>
      <section className="mk-hero-atmosphere px-4 py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mk-mono-eyebrow">Deneme · analiz · plan</p>
          <h1 className="mk-display mt-6 text-4xl md:text-[3.5rem]">
            Sınav hazırlığı — kişisel öğrenme yolun
          </h1>
          <p className="mt-4 text-lg font-light text-[var(--mk-muted)]">
            Dağınık kaynak yerine tek akış: ölç, analiz et, planla, tekrar et.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/kayit" className="mk-btn-primary px-8 py-3 text-sm">
              Ücretsiz dene
            </Link>
            <Link href="/fiyatlandirma" className="mk-btn-outline px-8 py-3 text-sm">
              Plus satın al
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[var(--page-max-width)] px-4 py-16">
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title} className="mk-card p-6">
              <span className="mk-mono-eyebrow text-[var(--color-cyan-signal)]">
                Adım {i + 1}
              </span>
              <h2 className="mt-2 text-lg font-normal text-[var(--color-cloud)]">
                {step.title}
              </h2>
              <p className="mt-2 text-sm text-[var(--mk-muted)]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-[var(--mk-border)] py-16">
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="mk-display text-center text-3xl">SSS</h2>
          <div className="mt-8 space-y-2">
            {faq.map((q) => (
              <details key={q} className="mk-card p-4">
                <summary className="cursor-pointer font-normal text-[var(--color-cloud)]">
                  {q}
                </summary>
                <p className="mt-2 text-sm text-[var(--mk-muted)]">
                  Cortex Plus sınav odaklı AI ile adım adım çalışmanı ve deneme
                  analizini tek yerde toplar.
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </OriginMarketingPage>
  );
}
