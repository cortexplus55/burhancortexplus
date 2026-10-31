import Link from "next/link";
import { redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepInviteJoinButton } from "@/components/parity/prep-invite-join-button";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { prepInviteSignupHref } from "@/lib/learning/prep-invite";
import { findJoinedCopy, inviterReferralCode, loadInviteSource } from "@/lib/learning/prep-invite-store";
import { formatDayLong } from "@/lib/format";
import "@/styles/cram-sheet.css";

export const metadata = { title: "Hazırlığa katıl", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Sınıf davet bağlantısı (31 Ekim 2026, Paket J3 #14). Herkese açık adres: misafir kayda gider (davet edenin kodu ve
 * bu adres `next` olarak korunur; kurulum bitince buraya döner). Oturumlu öğrenci hazırlığın başlığını, sınav
 * tarihini ve konu sayısını görür, "Hazırlığa katıl" ile kendi kopyasını alır. Davet edenin adı, ilerlemesi ya da
 * sonuçları gösterilmez. Bekleme kutusu (Suspense, loading.tsx) yok.
 */
export default async function PrepInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const service = createServiceClient();
  const found = await loadInviteSource(service, token);

  if (!found.ok) {
    const message =
      found.reason === "expired"
        ? "Bu davet bağlantısının süresi dolmuş. Arkadaşından yeni bir bağlantı iste."
        : found.reason === "not_found"
          ? "Bu hazırlık artık yok. Arkadaşından yeni bir bağlantı iste."
          : "Bu davet bağlantısı açılamadı. Arkadaşından yeni bir bağlantı iste.";
    return (
      <main className="cp-cram">
        <div className="cp-cram-empty" role="status">
          <p>{message}</p>
          <Link href="/" className="cp-cram-go">
            Cortex Plus&apos;a git
          </Link>
        </div>
      </main>
    );
  }

  const { source } = found;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(prepInviteSignupHref(token, await inviterReferralCode(service, source.userId)));
  if ((await accountActiveOrUnknown(supabase)) === false) redirect("/giris");
  if (user.id === source.userId) redirect(examPrepHomeHref(source.id));

  const existing = await findJoinedCopy(service, { sourceId: source.id, userId: user.id });
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const examDay = formatDayLong(source.examDate);

  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari">
      <article className="cp-cram" aria-labelledby="invite-title">
        <section className="cp-exam-result">
          {source.examType && source.examType !== "Serbest" ? <p className="cp-cram-kicker">{source.examType}</p> : null}
          <h1 id="invite-title" className="cp-exam-result-title">
            {source.title}
          </h1>
          <p className="cp-exam-result-note">
            {source.topicCount > 0 ? `${source.topicCount} konu` : "Konu listesi"}
            {examDay ? ` · Sınav ${examDay}` : ""}
          </p>
          <p className="cp-exam-result-note">
            Sınıf arkadaşın bu hazırlığı seninle paylaştı. Katılınca aynı konu sırasıyla kendi hazırlığın açılır;
            ilerleme ve sonuçlar kimseyle paylaşılmaz.
          </p>
          {existing ? (
            <Link href={examPrepHomeHref(existing)} className="cp-cram-go">
              Hazırlığını aç
            </Link>
          ) : (
            <PrepInviteJoinButton token={token} />
          )}
        </section>
      </article>
    </ParitySorShell>
  );
}
