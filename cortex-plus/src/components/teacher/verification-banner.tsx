import Link from "next/link";
import type { TeacherEntitlements } from "@/lib/teacher/entitlements";
import { TeacherApplicationForm } from "@/components/profile/teacher-application-form";
import "@/styles/cortex-premium.css";

export function TeacherVerificationBanner({
  applicationStatus,
  entitlements,
}: {
  applicationStatus: string | null;
  entitlements: TeacherEntitlements;
}) {
  if (entitlements.isPremium || entitlements.isVerified) return null;

  const statusLabel =
    applicationStatus === "rejected"
      ? "Başvurun reddedildi — belgeyi güncelleyip tekrar gönderebilirsin."
      : applicationStatus === "approved"
        ? "Onaylandı — sayfayı yenile."
        : "Hesabın inceleniyor. Bu süreçte sınıf açabilir, ödev/quiz/raporu birer kez deneyebilirsin.";

  return (
    <div className="cortex-premium mb-4 rounded-2xl border border-[var(--cx-border-gold)] bg-gradient-to-r from-[rgba(232,168,56,0.12)] to-transparent p-4 text-sm">
      <p className="font-medium text-[var(--cx-text)]">{statusLabel}</p>
      {entitlements.remainingTrialAssignments !== null ? (
        <p className="mt-1 text-xs text-[var(--cx-muted)]">
          Deneme: ödev {entitlements.remainingTrialAssignments}/1 · quiz{" "}
          {entitlements.remainingTrialQuizzes}/1 · rapor{" "}
          {entitlements.remainingTrialReports}/1
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--cx-gold-hover)]">
          Doğrulama belgesi yükle
        </summary>
        <div className="mt-3 rounded-xl border border-[var(--cx-border)] bg-black/30 p-3">
          <TeacherApplicationForm />
        </div>
      </details>
      <Link
        href="/ogretmen-paneli/plus"
        className="mt-2 inline-block text-xs font-medium text-[var(--cx-gold-hover)] underline"
      >
        Plus ile sınırsız sınıf ve rapor
      </Link>
    </div>
  );
}
