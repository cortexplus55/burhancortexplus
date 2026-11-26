import Link from "next/link";
import { DataDeletionButton } from "@/components/profile/data-deletion-button";
import {
  ACCOUNT_DELETION_COPY,
  DELETED_DATA,
  PUBLIC_DELETION_PATH,
  RETAINED_DATA,
} from "@/lib/privacy/account-deletion-copy";
import "@/styles/account-deletion.css";

/**
 * Ayarlar'daki "Hesabı sil" bölümünün içi (26 Kasım 2026, App Store 5.1.1(v) ve Google Play): neyin silindiği, neyin
 * mevzuat gereği kaldığı, mağaza aboneliği uyarısı ve "Hesabımı kalıcı olarak sil". Metin hesap silme sayfasıyla aynı
 * kaynaktan (`account-deletion-copy.ts`).
 */
export function AccountDeletionPanel({
  request,
  requestedAtLabel,
}: {
  request: { status: string | null } | null;
  requestedAtLabel: string | null;
}) {
  if (request) {
    return (
      <p className="cx-del-status" role="status">
        {request.status === "completed"
          ? "Silme talebin tamamlandı"
          : "Silme talebin işleniyor; yarım kalan adımlar her gün otomatik olarak yeniden deneniyor"}
        {requestedAtLabel ? ` · ${requestedAtLabel}` : ""}
      </p>
    );
  }
  return (
    <div className="cx-del">
      <div className="cx-del-cols">
        <div>
          <h3 className="cx-del-h">Silinenler</h3>
          <ul className="cx-del-list">
            {DELETED_DATA.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="cx-del-h">Mevzuat gereği kalanlar</h3>
          <ul className="cx-del-list">
            {RETAINED_DATA.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className="cx-del-warn" data-testid="account-delete-store-warning">
        {ACCOUNT_DELETION_COPY.storeWarning}
      </p>
      <DataDeletionButton />
      <p className="cx-del-foot">
        Uygulamaya giremediğin bir durumda da{" "}
        <Link href={PUBLIC_DELETION_PATH} className="cx-del-link">
          Hesap silme sayfasından
        </Link>{" "}
        e-postanla talep oluşturabilirsin.
      </p>
    </div>
  );
}
