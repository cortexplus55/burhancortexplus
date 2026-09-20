import { ParityMarketingPage } from "@/components/parity/marketing";
import { CinematicPageHero } from "@/components/marketing/cinematic-page-hero";
import { CinematicCtaRow } from "@/components/marketing/cinematic-cta";
import { ProductShowcase } from "@/components/marketing/product-showcase";
import Link from "next/link";

export const metadata = {
  title: "Sınav hazırlığı",
  description:
    "Zayıf konuyu gör, deneme analizi al, tek akışta kişisel AI öğretmenle ilerle.",
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
    body: "Yanlışlarından çıkan eksik konu listesi ilerleme sayfanda birikir.",
  },
  {
    title: "Planına dön",
    body: "Eksiklere göre haftalık planı güncelle ve görevleri işaretle.",
  },
];

export default function SinavHazirligiPage() {
  return (
    <ParityMarketingPage>
      <CinematicPageHero
        title="Sınav hazırlığı."
        description="Tek net mesaj: eksiğini gör, planını kilitle, netini büyüt."
      >
        <div className="mk-astra-cta-row mk-astra-cta-row--center">
          <Link href="/kayit" className="mk-astra-btn-primary">
            Ücretsiz dene
          </Link>
          <Link href="/ornek" className="mk-astra-btn-secondary">
            Ürünü gör
          </Link>
        </div>
      </CinematicPageHero>
      <ProductShowcase />
      <section className="mx-auto max-w-6xl px-4 pb-20" data-cinematic-reveal>
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
        <div className="mt-10">
          <CinematicCtaRow />
        </div>
      </section>
    </ParityMarketingPage>
  );
}
