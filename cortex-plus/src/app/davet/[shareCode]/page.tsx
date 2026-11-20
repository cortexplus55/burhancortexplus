import Link from "next/link";
import { redirect } from "next/navigation";
import { ParityMarketingPage } from "@/components/parity/marketing";
import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ClonePrepButton } from "@/components/parity/clone-prep-button";
import { SharedPrepCard } from "@/components/parity/shared-prep-card";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { findJoinedCopy } from "@/lib/learning/prep-invite-store";
import { loadSharedPrep, sharerReferralCode, type SharedPrepLookup } from "@/lib/learning/prep-share-code";
import {
  CLONE_BUTTON_LABEL,
  cloneLoginHref,
  cloneSignupHref,
  inactiveShareCopy,
  isSampleShareCode,
  normalizeShareCode,
} from "@/lib/learning/class-share";
import "@/styles/class-share.css";

export const metadata = { title: "Çalışma yolunu klonla", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Paylaşılan çalışma yolu (Faz 7, 20 Kasım 2026). Herkese açık adres (middleware `publicUnderProtected`): misafir
 * önizlemeyi görür, "Klonla" kayda gider (paylaşanın davet kodu ve `?otomatik=1`'li dönüş adresi korunur; kayıt
 * bitince sayfa kopyayı kendiliğinden kurar). Oturum açık öğrenci aynı kartı uygulama kabuğunda görür; sahibi kendi
 * hazırlığına, daha önce klonlayan kendi kopyasına gider. Bekleme kutusu (Suspense, loading.tsx) yok.
 */
export default async function SharedPrepPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareCode: string }>;
  searchParams: Promise<{ otomatik?: string | string[] }>;
}) {
  const [{ shareCode }, query] = await Promise.all([params, searchParams]);
  const code = normalizeShareCode(shareCode);
  const service = createServiceClient();
  const found: SharedPrepLookup = code ? await loadSharedPrep(service, code) : { ok: false, reason: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user) && (await accountActiveOrUnknown(supabase)) !== false;

  if (found.ok && user && signedIn) {
    if (user.id === found.prep.userId) redirect(examPrepHomeHref(found.prep.id));
    const existing = await findJoinedCopy(service, { sourceId: found.prep.id, userId: user.id });
    if (existing) redirect(examPrepHomeHref(existing));
  }

  const auto = (Array.isArray(query.otomatik) ? query.otomatik[0] : query.otomatik) === "1";
  const body = found.ok && code ? (
    <SharedPrepCard
      prep={found.prep}
      action={
        signedIn ? (
          <ClonePrepButton shareCode={code} auto={auto} />
        ) : (
          <div className="cp-invite-actions">
            <Link
              href={cloneSignupHref(code, await sharerReferralCode(service, found.prep.userId))}
              className="mk-btn-primary cp-invite-cta"
              data-testid="clone-signup"
            >
              {CLONE_BUTTON_LABEL}
            </Link>
            <Link href={cloneLoginHref(code)} className="cp-invite-alt">
              Hesabın var mı? Giriş yap
            </Link>
          </div>
        )
      }
    />
  ) : (
    // Bilinmeyen, geçersiz ya da paylaşımı kapalı kod 404 değil, dostça bir kart (ana sayfadaki örnek QR `ORNEK`'e gider).
    <InactiveShareCard
      copy={inactiveShareCopy(
        isSampleShareCode(shareCode) ? "sample" : !found.ok && found.reason === "unavailable" ? "unavailable" : "inactive",
      )}
      signedIn={signedIn}
    />
  );

  if (user && signedIn) {
    const shell = await loadParityShellProps(supabase, user.id, user.email);
    return (
      <ParitySorShell {...shell}>
        <PageShell width="read" className="cx-mk-body">
          <div className="cp-invite">{body}</div>
        </PageShell>
      </ParitySorShell>
    );
  }
  return (
    <ParityMarketingPage variant="auth">
      <div className="cp-invite">{body}</div>
    </ParityMarketingPage>
  );
}

/** Etkin olmayan bağlantının kartı: ne olduğu ve iki yol (ücretsiz başla, örnek ders). Oturum açık öğrenci sınavlarına döner. */
function InactiveShareCard({ copy, signedIn }: { copy: { title: string; note: string }; signedIn: boolean }) {
  return (
    <section className="mk-card cp-invite-card" role="status" data-testid="share-inactive">
      <h1 className="cp-invite-title">{copy.title}</h1>
      <p className="cp-invite-note">{copy.note}</p>
      <div className="cp-invite-actions">
        {signedIn ? (
          <Link href="/deneme-sinavlari" className="mk-btn-primary cp-invite-cta">
            Sınavlarıma git
          </Link>
        ) : (
          <Link href="/kayit" className="mk-btn-primary cp-invite-cta" data-testid="share-inactive-signup">
            Ücretsiz başla
          </Link>
        )}
        <Link href="/ornek" className="cp-invite-alt" data-testid="share-inactive-sample">
          Örnek dersi gör
        </Link>
      </div>
    </section>
  );
}
