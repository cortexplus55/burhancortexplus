import { Flame, Camera, Wallet, Smartphone } from "lucide-react";
import { MarketingCta, MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Telefondan Cortex",
  description: "Cortex Plus’ı mobil tarayıcıdan kullan — mağaza uygulaması yok, web tam çalışır.",
};

const perks = [
  {
    icon: Flame,
    title: "Seri ve hatırlatma",
    body: "Günlük seriyi koru; sınavın varken o gün çalışmadıysan akşam hatırlatma gelir. E-postasını istersen kapatırsın.",
  },
  {
    icon: Camera,
    title: "Podcast ve kâğıtta çöz",
    body: "Podcast'i yolda dinle; yazılı denemeyi kâğıda çözüp telefonla fotoğrafını gönder.",
  },
  {
    icon: Wallet,
    title: "Tek hesap",
    body: "Telefonda ve bilgisayarda aynı hesap; yarım kalan hazırlığın kaldığın yerden açılır.",
  },
];

export default function MobilUygulamaPage() {
  return (
    <MarketingPage
      title="Telefondan Cortex"
      description="Ders, podcast, test ve AI öğretmen telefonunun tarayıcısında."
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
