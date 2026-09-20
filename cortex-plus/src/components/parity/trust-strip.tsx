import Link from "next/link";
import { ShieldCheck, Phone, FileText } from "lucide-react";
import { SELLER } from "@/lib/legal/seller";

/**
 * Fiyat / ödeme yakınında kısa güven şeridi.
 * Mevcut yasal kural: anında ifa edilen dijital hizmette cayma yok;
 * hatalı/yetkisiz işlemler ayrıca incelenir.
 */
export function TrustStrip({ className = "" }: { className?: string }) {
  const phone = SELLER.phone?.trim();
  const digits = phone ? phone.replace(/\D/g, "") : "";
  const phoneHref = digits
    ? `tel:+90${digits.replace(/^0/, "")}`
    : null;

  return (
    <aside
      className={`cs-trust-strip ${className}`.trim()}
      aria-label="Güven ve ödeme bilgisi"
    >
      <div className="cs-trust-item">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
        <p>
          Güvenli ödeme <strong>PayTR</strong> ile alınır. Kart bilgisi Cortex&apos;e
          gelmez.
        </p>
      </div>
      <div className="cs-trust-item">
        <FileText className="h-4 w-4 shrink-0" aria-hidden />
        <p>
          Dijital hizmet satın alınca hemen açılır; yasaya göre{" "}
          <strong>cayma hakkı doğmaz</strong>. Hatalı veya yetkisiz işlemler{" "}
          <Link href="/iptal-iade">iptal ve iade</Link> sayfasındaki kuralla
          incelenir.
        </p>
      </div>
      {phone && phoneHref ? (
        <div className="cs-trust-item">
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <p>
            Destek: <a href={phoneHref}>{phone}</a>
            {" · "}
            <Link href="/iletisim">İletişim</Link>
          </p>
        </div>
      ) : (
        <div className="cs-trust-item">
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <p>
            Destek için <Link href="/iletisim">iletişim</Link>.
          </p>
        </div>
      )}
    </aside>
  );
}