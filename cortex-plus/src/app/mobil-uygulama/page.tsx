import { Flame, Camera, Wallet, Smartphone } from "lucide-react";
import { MarketingCta, MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Telefondan Cortex",
  description: "Cortex Plus’ı mobil tarayıcıdan kullan — mağaza uygulaması yok, web tam çalışır.",
};

const perks = [
  {
    icon: Flame,
    title: "Streak ve bildirimler",
    body: "Günlük seriyi koru; çalışma saatinde hatırlatma gelsin.",
  },
  {
    icon: Camera,
    title: "Fotoğraftan Çözüm",
    body: "Defterdeki soruyu telefonla çek, çözümü adım adım al.",
  },
  {
    icon: Wallet,
    title: "Tek hesap",
    body: "Ücretsiz ve Plus planların web ile aynı hesapta; kredin ortak.",
  },
];

export default function MobilUygulamaPage() {
  return (
    <MarketingPage
      title="Telefondan Cortex"
      description="AI Öğretmen, deneme sınavları ve çalışma araçları telefonunda."
    >
      <div className="mk-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex items-start gap-4">
          <span className="mk-icon shrink-0" aria-hidden>
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-[var(--mk-text)]">
              Mobilde Cortex — mağaza uygulaması yok
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
              Web sürümü telefonda tam çalışıyor. Ana ekrana ekleyip uygulama
              gibi kullanabilirsin.
            </p>
          </div>
        </div>
      </div>

      <p className="mk-eyebrow mt-12">Telefonda ne değişiyor</p>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {perks.map(({ icon: Icon, title, body }) => (
          <article key={title} className="mk-feature">
            <span className="mk-icon" aria-hidden>
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-[var(--mk-text)]">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--mk-muted)]">
              {body}
            </p>
          </article>
        ))}
      </div>

      <MarketingCta />
    </MarketingPage>
  );
}
