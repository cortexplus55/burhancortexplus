import Link from "next/link";
import { MarketingPage } from "@/components/layout/marketing-page";
import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { DeletionRequestForm } from "@/components/privacy/deletion-request-form";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { loadOptionalStudentShell } from "@/lib/student/optional-shell";
import { storeManageUrl } from "@/lib/billing/store-products";
import {
  ACCOUNT_DELETION_COPY,
  DELETED_DATA,
  DELETION_LINK_TTL_HOURS,
  RETAINED_DATA,
} from "@/lib/privacy/account-deletion-copy";
import { sellerField } from "@/lib/legal/seller";
import { pageMetadata } from "@/lib/seo/page-metadata";
import "@/styles/account-deletion.css";

export const metadata = pageMetadata({
  title: "Hesap silme",
  description:
    "Cortex Plus hesabını ve kişisel verilerini uygulamaya girmeden nasıl silebileceğin, neyin silindiği ve neyin saklandığı.",
  path: "/hesap-silme",
});

const TITLE = "Hesap ve veri silme";
const DESCRIPTION = "Cortex Plus hesabını ve kişisel verilerini uygulamayı yeniden yüklemeden kalıcı olarak silebilirsin.";

/**
 * Herkese açık hesap silme sayfası (26 Kasım 2026, Google Play hesap silme politikası). Giriş gerektirmez, onay
 * kapısından muaftır; oturum açık öğrenci aynı içeriği uygulama kabuğunda görür. İki yol: Ayarlar'daki düğme ya da
 * e-postayla onay bağlantısı. Silinen ve saklanan veriler Ayarlar'daki bölümle aynı kaynaktan.
 */
export default async function HesapSilmePage() {
  const shell = await loadOptionalStudentShell().catch(() => null);
  if (shell) {
    return (
      <ParitySorShell {...shell}>
        <PageShell width="read" title={TITLE} lead={DESCRIPTION} className="cx-mk-body">
          <HesapSilmeContent signedIn />
        </PageShell>
      </ParitySorShell>
    );
  }
  return (
    <MarketingPage title={TITLE} description={DESCRIPTION} variant="legal">
      <HesapSilmeContent signedIn={false} />
    </MarketingPage>
  );
}

function HesapSilmeContent({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="cx-del" data-testid="public-account-deletion">
      <section className="cx-del-section" aria-labelledby="del-in-app">
        <h2 id="del-in-app">1. Uygulamadan ya da web sitesinden sil</h2>
        <ol className="cx-del-steps">
          <li>Cortex Plus&apos;a gir (mobil uygulama ya da cortexplus.app).</li>
          <li>Profil → Ayarlar → «Hesabı sil» bölümünü aç.</li>
          <li>«Hesabımı kalıcı olarak sil»e dokun ve onayla. Silme hemen başlar.</li>
        </ol>
        <p>
          {signedIn ? (
            <Link href="/ayarlar#hesabi-sil" className="cx-del-link">
              Ayarlar&apos;daki «Hesabı sil» bölümüne git
            </Link>
          ) : (
            <Link href="/giris?next=%2Fayarlar%23hesabi-sil" className="cx-del-link">
              Giriş yapıp Ayarlar&apos;a git
            </Link>
          )}
        </p>
      </section>

      <section className="cx-del-section" aria-labelledby="del-by-email">
        <h2 id="del-by-email">2. Giriş yapmadan sil</h2>
        <p>
          Uygulamaya giremiyorsan ya da uygulamayı sildiysen hesabının e-posta adresini yaz. Hesap varsa bu adrese bir onay
          bağlantısı göndeririz ({DELETION_LINK_TTL_HOURS} saat geçerli); bağlantıyı açıp «Kalıcı olarak sil»e bastığında
          hesabın silinir. Bağlantı yalnız hesabın kutusuna gittiği için başkası senin adına silme yapamaz.
        </p>
        <DeletionRequestForm />
      </section>

      <section className="cx-del-section" aria-labelledby="del-scope">
        <h2 id="del-scope">Neler silinir, neler kalır</h2>
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
        <p>
          Silme işlemi talep anında başlar; yarım kalan adımlar her gün kendiliğinden yeniden denenir. Silinen veriler geri
          getirilemez.
        </p>
      </section>

      <section className="cx-del-section" aria-labelledby="del-store">
        <h2 id="del-store">Mağaza aboneliği</h2>
        <p className="cx-del-warn">{ACCOUNT_DELETION_COPY.storeWarning}</p>
        <p>
          <ExternalAnchor href={storeManageUrl("ios")} className="cx-del-link">
            App Store aboneliklerini yönet
          </ExternalAnchor>
          {" · "}
          <ExternalAnchor href={storeManageUrl("android")} className="cx-del-link">
            Google Play aboneliklerini yönet
          </ExternalAnchor>
        </p>
      </section>

      <section className="cx-del-section" aria-labelledby="del-help">
        <h2 id="del-help">Yardım</h2>
        <p>
          Sorun yaşarsan {sellerField("email")} adresine hesabının e-posta adresinden yaz. Ayrıntılar{" "}
          <Link href="/gizlilik" className="cx-del-link">
            Gizlilik Politikası
          </Link>{" "}
          ve{" "}
          <Link href="/kvkk" className="cx-del-link">
            KVKK Aydınlatma Metni
          </Link>
          &apos;nde.
        </p>
      </section>
    </div>
  );
}
