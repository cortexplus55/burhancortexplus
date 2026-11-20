import Link from "next/link";
import { notFound } from "next/navigation";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { ClassShareButton } from "@/components/parity/class-share-button";
import { SharedPrepCard } from "@/components/parity/shared-prep-card";
import { CLONE_BUTTON_LABEL, cloneLoginHref, cloneSignupHref } from "@/lib/learning/class-share";
import "@/styles/class-share.css";

export const dynamic = "force-dynamic";

const CODE = "abcdefghjk";

/**
 * Uçtan uca fikstür (Faz 7, 20 Kasım 2026): `?ekran=paylas` hazırlık sayfasının üst simgelerindeki "📲 Sınıfla Paylaş"
 * düğmesini (uç e2e'de `page.route` ile taklit edilir), varsayılan ekran misafirin gördüğü `/davet/<kod>` önizlemesini
 * gerçek bileşenlerle çizer. Veritabanısız; içerik yer tutucu (üretim koduna konu terimi girmez).
 */
export default async function E2eClassSharePage({ searchParams }: { searchParams: Promise<{ ekran?: string }> }) {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const { ekran } = await searchParams;
  if (ekran === "paylas") {
    return (
      <main className="dark" style={{ minHeight: "100vh", padding: "16px", background: "var(--cx-bg-0)" }}>
        <div className="cp-prep-actions" role="toolbar" aria-label="Hazırlık işlemleri">
          <ClassShareButton prepId="00000000-0000-4000-8000-0000000000a1" />
        </div>
      </main>
    );
  }
  const units = Array.from({ length: 14 }, (_, index) => `Ünite ${index + 1}: örnek konu başlığı ${index % 3 === 0 ? "biraz daha uzun bir adla" : ""}`.trim());
  return (
    <ParityMarketingPage variant="auth">
      <div className="cp-invite">
        <SharedPrepCard
          prep={{ title: "Örnek sınav hazırlığı", examType: "TYT", examDate: "2026-12-20", units, sharedBy: "Ay***" }}
          action={
            <div className="cp-invite-actions">
              <Link href={cloneSignupHref(CODE, "AB12CD34")} className="mk-btn-primary cp-invite-cta" data-testid="clone-signup">
                {CLONE_BUTTON_LABEL}
              </Link>
              <Link href={cloneLoginHref(CODE)} className="cp-invite-alt">
                Hesabın var mı? Giriş yap
              </Link>
            </div>
          }
        />
      </div>
    </ParityMarketingPage>
  );
}
