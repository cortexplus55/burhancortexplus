import { MarketingCta, MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Mobil uygulama",
  description: "Cortex Plus iOS ve Android — çalışmaya her yerden devam et.",
};

export default function MobilUygulamaPage() {
  return (
    <MarketingPage
      title="Mobil uygulama"
      description="AI öğretmen, deneme sınavları ve çalışma araçları telefonunda. Web sürümü şimdiden mobil tarayıcıda optimize; mağaza sürümü yakında."
    >
      <ul className="mk-card max-w-xl space-y-3 p-6 text-sm text-[var(--mk-muted)]">
        <li>· Streak ve bildirimlerle düzenli çalışma</li>
        <li>· Fotoğraftan soru çözümü</li>
        <li>· Ücretsiz ve Plus planları aynı hesapta</li>
      </ul>
      <MarketingCta />
    </MarketingPage>
  );
}
