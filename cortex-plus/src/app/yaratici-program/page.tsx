import { MarketingCta, MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Yaratıcı program",
  description: "Okullar ve içerik üreticileri için Cortex Plus iş birlikleri.",
};

export default function YaraticiProgramPage() {
  return (
    <MarketingPage
      title="Yaratıcı program"
      description="Eğitim kanalları ve okullar Cortex Plus ile öğrencilerine özel deneyim sunabilir."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <article className="mk-card p-6">
          <h2 className="font-semibold">Okul lisansı</h2>
          <p className="mt-2 text-sm text-[var(--mk-muted)]">
            Toplu Plus lisansı ve okul içi ilerleme raporları.
          </p>
        </article>
        <article className="mk-card p-6">
          <h2 className="font-semibold">İçerik ortaklığı</h2>
          <p className="mt-2 text-sm text-[var(--mk-muted)]">
            Lab uygulamaları ve deneme paketlerini birlikte üretelim.
          </p>
        </article>
      </div>
      <p className="mt-6 text-sm text-[var(--mk-muted)]">
        Başvuru için{" "}
        <a href="/iletisim" className="underline">
          iletişim
        </a>{" "}
        formunu kullanın.
      </p>
      <MarketingCta />
    </MarketingPage>
  );
}
