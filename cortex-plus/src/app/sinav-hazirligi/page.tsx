import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { CinematicPageHero } from "@/components/marketing/cinematic-page-hero";
import { CinematicCtaRow } from "@/components/marketing/cinematic-cta";

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
    <AstraMarketingPage>
      <CinematicPageHero
        title="Sınav hazırlığı — kişisel öğrenme yolun"
        description="Dağınık kaynak yerine tek akış: ölç, analiz et, planla, tekrar et."
      >
        <CinematicCtaRow />
      </CinematicPageHero>

      <section className="mx-auto max-w-6xl px-4 py-16" data-cinematic-reveal>
        <ol className="grid gap-4 md:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title} className="mk-card p-6">
              <span className="text-sm font-bold text-[var(--mk-primary)]">
                {i + 1}
              </span>
              <h2 className="mt-2 text-lg font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm text-[var(--mk-muted)]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-[var(--mk-border)] py-16" data-cinematic-reveal>
        <div className="mx-auto max-w-2xl px-4">
          <h2 className="mk-display text-center text-2xl md:text-3xl">SSS</h2>
          <div className="mt-8 space-y-2">
            {faq.map((q) => (
              <details key={q} className="mk-card p-4">
                <summary className="cursor-pointer font-medium">{q}</summary>
                <p className="mt-2 text-sm text-[var(--mk-muted)]">
                  Cortex Plus sınav odaklı AI ile adım adım çalışmanı ve deneme
                  analizini tek yerde toplar.
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </AstraMarketingPage>
  );
}
