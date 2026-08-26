import { MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "İletişim",
  description: "Cortex Plus destek ve iletişim bilgileri.",
};

export default function IletisimPage() {
  return (
    <MarketingPage
      title="İletişim"
      description="Sorularını, geri bildirimlerini ve iş birliği taleplerini bekliyoruz."
    >
      <div className="max-w-xl space-y-3">
        <div className="mk-card p-4">
          <p className="mk-prose-heading text-sm">E-posta</p>
          <p className="mk-prose mt-1">destek@cortexplus.app</p>
        </div>
        <div className="mk-card p-4">
          <p className="mk-prose-heading text-sm">KVKK ve veri talepleri</p>
          <p className="mk-prose mt-1">kvkk@cortexplus.app</p>
        </div>
        <div className="mk-card p-4">
          <p className="mk-prose-heading text-sm">Hesabın varsa</p>
          <p className="mk-prose mt-1">
            Uygulama içindeki Destek sayfasından talep açtığında geçmişini takip
            edebilirsin.
          </p>
        </div>
      </div>
    </MarketingPage>
  );
}

