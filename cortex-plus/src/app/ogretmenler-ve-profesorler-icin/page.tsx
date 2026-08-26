import Link from "next/link";
import { MarketingCta, MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Öğretmenler ve profesörler için",
  description:
    "Sınıf yönetimi, ödev ve quiz paylaşımı — Cortex Plus okul öğretmeni paneli.",
};

export default function OgretmenlerPage() {
  return (
    <MarketingPage
      title="Öğretmenler ve profesörler için"
      description="Sınıflarını oluştur, öğrencilerini davet et, ilerlemeyi takip et. Kayıt sonrası doğrulama ile öğretmen paneli açılır."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <article className="mk-card p-6">
          <h2 className="text-lg font-semibold">Sınıf ve ödev</h2>
          <p className="mt-2 text-sm text-[var(--mk-muted)]">
            Katılım kodu ile öğrenci ekle; ödev ve quiz paylaş.
          </p>
        </article>
        <article className="mk-card p-6">
          <h2 className="text-lg font-semibold">AI destekli içerik</h2>
          <p className="mt-2 text-sm text-[var(--mk-muted)]">
            Quiz ve flashcard üret; öğrencilerin Cortex Plus ile çalışmasını
            destekle.
          </p>
        </article>
      </div>
      <p className="mt-6 text-sm text-[var(--mk-muted)]">
        Okul öğretmeni olarak kayıt olmak için{" "}
        <Link href="/kayit" className="underline text-[var(--mk-primary)]">
          kayıt sihirbazında &quot;Okul öğretmeniyim&quot;
        </Link>{" "}
        seçeneğini kullan.
      </p>
      <MarketingCta />
    </MarketingPage>
  );
}
