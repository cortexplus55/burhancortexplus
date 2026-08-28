import Link from "next/link";
import type { TeacherEntitlements } from "@/lib/teacher/entitlements";
import { TeacherApplicationForm } from "@/components/profile/teacher-application-form";

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
    <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-50/95">
      <p className="font-medium">{statusLabel}</p>
      {entitlements.remainingTrialAssignments !== null ? (
        <p className="mt-2 text-xs text-amber-100/80">
          Deneme: ödev {entitlements.remainingTrialAssignments}/1 · quiz{" "}
          {entitlements.remainingTrialQuizzes}/1 · rapor{" "}
          {entitlements.remainingTrialReports}/1
        </p>
      ) : null}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-amber-200">
          Doğrulama belgesi yükle
        </summary>
        <div className="mt-3 rounded-xl bg-black/20 p-3">
          <TeacherApplicationForm />
        </div>
      </details>
      <Link
        href="/ogretmen-paneli/plus"
        className="mt-3 inline-block text-xs font-medium text-[var(--astra-primary)] underline"
      >
        Plus ile sınırsız sınıf ve rapor
      </Link>
    </div>
  );
}
