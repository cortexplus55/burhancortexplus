import { ParentPayShell, ParentPayNotice } from "@/components/billing/veli/parent-pay-shell";
import { ParentPayForm } from "@/components/billing/parent-pay-form";
import { formatTryWhole } from "@/lib/format";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { maskEmail, PARENT_LINK_EXPIRED_TEXT, verifyParentPayToken } from "@/lib/payments/parent-link";
import { parentPackageLabel, parentLinkPlanName } from "@/lib/payments/parent-link-plan";
import { PARENT_PAY_COPY } from "@/lib/payments/parent-pay-copy";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Veli ödemesi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Velinin herkese açık ödeme sayfası (Faz 5 §2, 19 Kasım 2026). Oturum istemez; bağlantıdaki HMAC imzası ve 48 saatlik
 * süre sunucuda doğrulanır. Sayfa öğrencinin yalnız adını ve maskeli e-postasını, paketin adını ve KDV dahil net
 * tutarını (veritabanındaki plandan) gösterir; güvence kutusu, sözleşme onay kutuları ve PayTR iFrame'i aynı sayfada.
 */
export default async function VeliOdemePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyParentPayToken(token);
  if (!verified.ok) {
    return (
      <ParentPayShell>
        <ParentPayNotice
          tone="warn"
          title={verified.reason === "expired" ? "Bağlantının süresi dolmuş" : "Bağlantı açılamadı"}
          body={verified.reason === "expired" ? PARENT_LINK_EXPIRED_TEXT : PARENT_PAY_COPY.invalid}
          testId={verified.reason === "expired" ? "veli-expired" : "veli-invalid"}
        />
      </ParentPayShell>
    );
  }

  const service = createServiceClient();
  const [{ data: plan }, { data: student }, account] = await Promise.all([
    service
      .from("plans")
      .select("id, name, price_try, billing_period, tier")
      .eq("id", verified.claims.planId)
      .eq("active", true)
      .maybeSingle(),
    service.from("profiles").select("full_name").eq("id", verified.claims.studentId).maybeSingle(),
    service.auth.admin.getUserById(verified.claims.studentId).catch(() => null),
  ]);
  if (!plan || !student) {
    return (
      <ParentPayShell>
        <ParentPayNotice tone="warn" title="Bağlantı açılamadı" body={PARENT_PAY_COPY.invalid} testId="veli-invalid" />
      </ParentPayShell>
    );
  }

  const studentFirst = String(student.full_name ?? "").trim().split(/\s+/)[0] || "Öğrenci";
  const maskedEmail = maskEmail(account?.data?.user?.email ?? null);
  const planName = parentLinkPlanName(plan);
  const priceLabel = formatTryWhole(plan.price_try as number);

  return (
    <ParentPayShell>
      <section className="vo-card vo-summary" aria-label="Ödeme özeti" data-testid="veli-summary">
        <div className="vo-student">
          <span className="vo-avatar" aria-hidden>
            {studentFirst.charAt(0).toLocaleUpperCase("tr")}
          </span>
          <div>
            <p className="vo-label">Öğrenci</p>
            <p className="vo-student-name" data-testid="veli-student">
              {studentFirst}
            </p>
            {maskedEmail ? (
              <p className="vo-muted" data-testid="veli-email">
                {maskedEmail}
              </p>
            ) : null}
          </div>
        </div>
        <div className="vo-plan">
          <div>
            <p className="vo-label">Paket</p>
            <p className="vo-plan-name" data-testid="veli-plan">
              {parentPackageLabel(planName)}
            </p>
          </div>
          <div className="vo-price">
            <p className="vo-price-value" data-testid="veli-price">
              {priceLabel}
            </p>
            <p className="vo-muted">{PARENT_PAY_COPY.vatNote}</p>
          </div>
        </div>
      </section>

      <section className="vo-card vo-assurance" aria-label="Güvence" data-testid="veli-assurance">
        <p className="vo-assurance-title">
          <span aria-hidden>🛡️</span> {PARENT_PAY_COPY.assurance}
        </p>
        <ul>
          {PARENT_PAY_COPY.assuranceDetail.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      {isPaytrConfigured() ? (
        <ParentPayForm token={token} studentName={studentFirst} planName={planName} priceLabel={priceLabel} />
      ) : (
        <ParentPayNotice tone="warn" title="Ödeme şu an kapalı" body="Ödeme altyapısı şu an kapalı. Daha sonra yeniden deneyin." />
      )}
    </ParentPayShell>
  );
}
