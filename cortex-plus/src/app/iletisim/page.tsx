import Link from "next/link";
import { LifeBuoy, ListChecks, Mail, ShieldCheck } from "lucide-react";
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
      <p className="mk-eyebrow">Bize ulaş</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {/* Tek adres kullanıyoruz; bu kart bu yüzden diğerinden büyük ve
            adres tıklanabilir — telefonda posta uygulamasını açıyor. */}
        <article className="mk-feature">
          <span className="mk-icon" aria-hidden>
            <Mail className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[var(--mk-text)]">
            E-posta
          </h2>
          <a
            href="mailto:cortexplus@cortexplus.app"
            className="mt-2 inline-block text-base font-medium text-[var(--mk-primary)] underline underline-offset-4"
          >
            cortexplus@cortexplus.app
          </a>
          <p className="mt-3 text-sm leading-relaxed text-[var(--mk-muted)]">
            Destek, geri bildirim, iş birliği ve KVKK talepleri için aynı adres.
          </p>
        </article>

        <article className="mk-feature">
          <span className="mk-icon" aria-hidden>
            <LifeBuoy className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-[var(--mk-text)]">
            Hesabın varsa
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--mk-muted)]">
            Uygulama içindeki <strong className="text-[var(--mk-text)]">Destek</strong>{" "}
            sayfasından talep açtığında yazışmanın geçmişi tek yerde birikir ve
            durumunu takip edebilirsin.
          </p>
          <Link
            href="/giris?next=%2Fdestek"
            className="mt-4 inline-block text-sm font-medium text-[var(--mk-primary)] underline underline-offset-4"
          >
            Destek sayfasına git
          </Link>
        </article>
      </div>

      <div className="mk-card mt-6 grid gap-6 p-6 sm:grid-cols-2 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="mk-icon shrink-0" aria-hidden>
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-[var(--mk-text)]">
              Daha hızlı çözelim
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
              Yazarken hesabının e-postasını, hangi ekranda olduğunu ve varsa
              ekran görüntüsünü ekle — çoğu soru tek yazışmada kapanır.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <span className="mk-icon shrink-0" aria-hidden>
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-[var(--mk-text)]">KVKK talepleri</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--mk-muted)]">
              Verilerine dair talepler için{" "}
              <Link
                href="/kvkk"
                className="text-[var(--mk-primary)] underline underline-offset-4"
              >
                KVKK sayfasındaki
              </Link>{" "}
              süreç geçerlidir.
            </p>
          </div>
        </div>
      </div>
    </MarketingPage>
  );
}
