import { notFound } from "next/navigation";
import { EmailChangeCard } from "@/components/profile/email-change-card";
import { SectionCard } from "@/components/ui-kit/empty-state";

export const dynamic = "force-dynamic";

// /ayarlar e-posta kartı (giriş gerektirmeden): uzun adres 320 px'te sayfayı kaydırmamalı.
export default function E2eAyarlarPage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  return (
    <div className="cs-app cp-sor-root">
      <main className="cp-sor-main">
        <div className="cp-page">
          <div className="cp-page-head">
            <h1 className="cp-page-title">Ayarlar</h1>
          </div>
          <div className="space-y-6">
      <SectionCard title="E-posta ve şifre" description="Giriş yaptığın adres ve şifren.">
        <EmailChangeCard
          email="cok-uzun-bir-ogrenci-adresi+deneme12345@ornek-alan-adi.com.tr"
          pendingEmail={null}
          hasPasswordLogin
        />
      </SectionCard>
          </div>
        </div>
      </main>
    </div>
  );
}
