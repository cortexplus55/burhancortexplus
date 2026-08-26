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
      <div className="max-w-xl space-y-4 text-sm">
        <div className="rounded-lg border p-4">
          <p className="font-medium">E-posta</p>
          <p className="mt-1 text-muted-foreground">destek@cortexplus.app</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="font-medium">KVKK ve veri talepleri</p>
          <p className="mt-1 text-muted-foreground">kvkk@cortexplus.app</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="font-medium">Hesabın varsa</p>
          <p className="mt-1 text-muted-foreground">
            Uygulama içindeki Destek sayfasından talep açtığında geçmişini takip
            edebilirsin.
          </p>
        </div>
      </div>
    </MarketingPage>
  );
}
