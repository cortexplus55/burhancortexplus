import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { DeletionConfirmButton } from "@/components/privacy/deletion-confirm-button";
import { createServiceClient } from "@/lib/supabase/server";
import { previewDeletionToken } from "@/lib/privacy/public-deletion";
import { ACCOUNT_DELETION_COPY, PUBLIC_DELETION_PATH } from "@/lib/privacy/account-deletion-copy";
import "@/styles/account-deletion.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hesap silme onayı",
  robots: { index: false, follow: false },
};

const REASONS = {
  invalid: "Bu bağlantı geçersiz.",
  expired: "Bu bağlantının süresi doldu.",
  unconfigured: "Silme şu an başlatılamıyor. Biraz sonra yeniden dene.",
  already_deleted: "Bu hesap zaten silinmiş.",
} as const;

/**
 * E-postadaki onay bağlantısının açtığı sayfa (26 Kasım 2026). Sayfa yalnız okur (bağlantı geçerli mi, hesap var mı);
 * silme "Kalıcı olarak sil" düğmesinin POST isteğiyle olur.
 */
export default async function HesapSilmeOnayPage({ searchParams }: { searchParams: Promise<{ t?: string | string[] }> }) {
  const raw = (await searchParams).t;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const preview = await (async () => {
    try {
      return await previewDeletionToken(createServiceClient(), token);
    } catch {
      return { ok: false as const, reason: "unconfigured" as const };
    }
  })();

  return (
    <MarketingPage title="Hesap silme onayı" variant="legal">
      {preview.ok ? (
        <div className="cx-del" data-testid="deletion-confirm">
          <p className="cx-del-status">
            {preview.maskedEmail ? `${preview.maskedEmail} adresli hesap ` : "Bu hesap "}
            ve kişisel verileri kalıcı olarak silinecek. Bu işlem geri alınamaz.
          </p>
          <p className="cx-del-warn">{ACCOUNT_DELETION_COPY.storeWarning}</p>
          <DeletionConfirmButton token={token} />
        </div>
      ) : (
        <div className="cx-del" data-testid="deletion-confirm-invalid">
          <p className="cx-del-status" role="status">
            {REASONS[preview.reason]}
          </p>
          {preview.reason === "already_deleted" ? null : (
            <Link href={PUBLIC_DELETION_PATH} className="cx-del-link">
              Hesap silme sayfasından yeni bağlantı iste
            </Link>
          )}
        </div>
      )}
    </MarketingPage>
  );
}
