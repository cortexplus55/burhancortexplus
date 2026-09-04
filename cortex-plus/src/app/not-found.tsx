import Link from "next/link";
import { Compass } from "lucide-react";
import { MarketingPage } from "@/components/layout/marketing-page";

/**
 * 404 daha önce çıplak bir sayfaydı: başlık, bir cümle, tek düğme — üstelik
 * uygulama temasının `text-muted-foreground` değişkeniyle, ki bu sayfada o
 * tema hiç yüklü değil. En önemlisi başlık ve altbilgi yoktu: yanlış adrese
 * düşen kişinin gidebileceği tek yer ana sayfaydı.
 *
 * Şimdi pazarlama kabuğunun içinde; menü ve altbilgi bağlantıları geri geldi,
 * ayrıca en çok aranan üç yer doğrudan veriliyor.
 */
export default function NotFound() {
  return (
    <MarketingPage
      variant="auth"
      title="Sayfa bulunamadı"
      description="Aradığın sayfa taşınmış ya da hiç var olmamış olabilir."
    >
      <div className="mk-card mx-auto max-w-md p-8 text-center">
        <span className="mk-icon mx-auto" aria-hidden>
          <Compass className="h-5 w-5" />
        </span>

        <p className="mt-5 text-sm leading-relaxed text-[var(--mk-muted)]">
          Adresi elle yazdıysan bir harf eksik olabilir. Aşağıdakiler en çok
          gidilen yerler.
        </p>

        <Link
          href="/"
          className="mk-btn-primary mt-6 inline-flex w-full items-center justify-center px-6 py-3 text-sm"
        >
          Ana sayfaya dön
        </Link>

        <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
          <Link
            href="/ozellikler"
            className="text-[var(--mk-muted)] underline underline-offset-4 hover:text-[var(--mk-text)]"
          >
            Özellikler
          </Link>
          <Link
            href="/fiyatlandirma"
            className="text-[var(--mk-muted)] underline underline-offset-4 hover:text-[var(--mk-text)]"
          >
            Fiyatlandırma
          </Link>
          <Link
            href="/yardim"
            className="text-[var(--mk-muted)] underline underline-offset-4 hover:text-[var(--mk-text)]"
          >
            Yardım
          </Link>
        </div>
      </div>
    </MarketingPage>
  );
}
