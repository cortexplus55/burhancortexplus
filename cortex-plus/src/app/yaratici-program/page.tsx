import Link from "next/link";
import { BarChart3, Handshake, School } from "lucide-react";
import { MarketingCta, MarketingPage } from "@/components/layout/marketing-page";

export const metadata = {
  title: "Yaratıcı program",
  description: "Okullar ve içerik üreticileri için Cortex Plus iş birlikleri.",
};

const tracks = [
  {
    icon: School,
    title: "Okul lisansı",
    body: "Sınıf veya kurum düzeyinde toplu Plus lisansı. Öğrenciler kendi hesaplarıyla girer, kota kurumdan düşer.",
  },
  {
    icon: BarChart3,
    title: "İlerleme raporları",
    body: "Okul içi ilerleme özetleri: hangi konu zayıf, hangi sınıf nerede takılıyor. Sohbet içerikleri paylaşılmaz.",
  },
  {
    icon: Handshake,
    title: "İçerik ortaklığı",
    body: "Ders içeriği ve deneme paketlerini birlikte üretelim; kendi öğrencilerine özel bir deneyim kur.",
  },
];

export default function YaraticiProgramPage() {
  return (
    <MarketingPage
      title="Yaratıcı program"
      description="Eğitim kanalları ve okullar Cortex Plus ile öğrencilerine özel deneyim sunabilir."
    >
      <p className="mk-eyebrow">İş birliği yolları</p>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {tracks.map(({ icon: Icon, title, body }) => (
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

      <div className="mk-card mt-10 p-6 sm:p-8">
        <h2 className="text-lg font-semibold text-[var(--mk-text)]">
          Nasıl başlıyoruz
        </h2>
        <ul className="mk-list mt-5">
          <li>
            <strong>Yaz</strong>
            Kurumunu, öğrenci sayını ve ne yapmak istediğini{" "}
            <Link
              href="/iletisim"
              className="text-[var(--mk-primary)] underline underline-offset-4"
            >
              iletişim sayfasından
            </Link>{" "}
            ilet.
          </li>
          <li>
            <strong>Konuşalım</strong>
            İhtiyacına göre lisans mı, içerik ortaklığı mı, ikisi mi — birlikte
            netleştirelim.
          </li>
          <li>
            <strong>Kur</strong>
            Hesaplar açılır, kota tanımlanır, öğrenciler ilk gün kullanmaya başlar.
          </li>
        </ul>
      </div>

      <MarketingCta />
    </MarketingPage>
  );
}
