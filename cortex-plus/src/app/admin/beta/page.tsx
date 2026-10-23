import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { collectBetaMetrics, evaluateBetaCriteria, type CriterionStatus } from "@/lib/admin/beta-metrics";
import { REVIEW_REASK_TARGET, collectReviewMetrics, percentLabel } from "@/lib/admin/review-metrics";
import { collectLearningSignals } from "@/lib/admin/learning-signals";

export const metadata = { title: "Yönetim · Beta ölçütleri" };
export const dynamic = "force-dynamic";

const STATUS: Record<CriterionStatus, { label: string; tone: "ok" | "bad" | "mute" | "gold" }> = {
  pass: { label: "Geçti", tone: "ok" },
  fail: { label: "Kaldı", tone: "bad" },
  nodata: { label: "Veri yok", tone: "mute" },
  manual: { label: "Elle bak", tone: "gold" },
};

/**
 * Kapalı beta çıkış ölçütleri (19 Ekim 2026, satışa hazırlık plan Faz 5.3). Altı ölçüt, son 7 ve
 * 30 gün yan yana. Hepsi "Geçti" (Sentry elle) olunca lansmana geçilir. Hedefler ve ölçüm tek
 * yerde: `src/lib/admin/beta-metrics.ts`.
 */
export default async function AdminBetaPage() {
  await requireAdmin();
  const service = createServiceClient();
  const now = new Date();
  const [week, month, pending, reviewWeek, reviewMonth, signalsWeek, signalsMonth] = await Promise.all([
    collectBetaMetrics(service, { now, days: 7 }),
    collectBetaMetrics(service, { now, days: 30 }),
    countPendingApplications(service),
    collectReviewMetrics(service, { now, days: 7 }),
    collectReviewMetrics(service, { now, days: 30 }),
    collectLearningSignals(service, { now, days: 7 }),
    collectLearningSignals(service, { now, days: 30 }),
  ]);
  const signals = [signalsWeek, signalsMonth];
  const score = (value: number | null, digits = 0) => (value == null ? "Veri yok" : value.toFixed(digits).replace(".", ","));
  const reviewStatus = (share: number | null) =>
    share == null ? STATUS.nodata : share >= REVIEW_REASK_TARGET ? STATUS.pass : STATUS.fail;
  const rowsWeek = evaluateBetaCriteria(week);
  const rowsMonth = evaluateBetaCriteria(month);
  const passing = rowsWeek.filter((row) => row.status === "pass").length;

  return (
    <AdminShell href="/admin/beta" pendingApplications={pending}>
      <AdminNote tone="info">
        Son 7 gün: {passing} / {rowsWeek.filter((row) => row.status !== "manual").length} ölçüt geçiyor. Lansman için
        altısının da geçmesi gerekir; Sentry satırı panelden elle bakılır. Açılış süreleri 19 Ekim 2026&apos;dan beri
        kaydediliyor (önce yalnız 3 günlük sunucu günlüğündeydi).
      </AdminNote>

      <AdminCard title="Çıkış ölçütleri" desc="Değer · hedef · durum; ikinci satırda son 30 gün." bodyless>
        <AdminTableFrame columns={["Ölçüt", "Hedef", "Son 7 gün", "Son 30 gün", "Not"]}>
          {rowsWeek.map((row, index) => {
            const monthRow = rowsMonth[index]!;
            return (
              <tr key={row.id}>
                <td className="font-medium">{row.label}</td>
                <td className="adm-num">{row.target}</td>
                <td className="text-xs">
                  <AdminBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</AdminBadge>
                  <span className="mt-1 block">{row.value}</span>
                </td>
                <td className="text-xs">
                  <AdminBadge tone={STATUS[monthRow.status].tone}>{STATUS[monthRow.status].label}</AdminBadge>
                  <span className="mt-1 block">{monthRow.value}</span>
                </td>
                <td className="text-xs">{row.note}</td>
              </tr>
            );
          })}
        </AdminTableFrame>
      </AdminCard>

      {/* Günü gelen tekrar (20 Ekim 2026): çıkış ölçütlerinden ayrı; yalnız 7 günü dolmuş yanlışlar. */}
      <AdminCard
        title="Aralıklı tekrar"
        desc="Yalnız tekrar kaydına düşen yanlışlar; sayısal / açıklama ders soruları ve yazılı deneme kayda girmez."
        bodyless
      >
        <AdminTableFrame columns={["Ölçüt", "Hedef", "Son 7 gün", "Son 30 gün"]}>
          <tr>
            <td className="font-medium">Yanlışın 7 gün içinde yeniden sorulma payı</td>
            <td className="adm-num">≥ %{Math.round(REVIEW_REASK_TARGET * 100)}</td>
            {[reviewWeek, reviewMonth].map((metrics) => (
              <td key={metrics.days} className="text-xs">
                <AdminBadge tone={reviewStatus(metrics.share).tone}>{reviewStatus(metrics.share).label}</AdminBadge>
                <span className="mt-1 block">
                  {percentLabel(metrics.share)} · {metrics.reasked} / {metrics.cohort}
                </span>
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-medium">İlk tekrarda doğru</td>
            <td className="adm-num">—</td>
            {[reviewWeek, reviewMonth].map((metrics) => (
              <td key={metrics.days} className="text-xs">
                {percentLabel(metrics.accuracy)} · {metrics.reaskCorrect} / {metrics.reasked}
              </td>
            ))}
          </tr>
        </AdminTableFrame>
      </AdminCard>

      {/* Gerçek öğrenme ölçüleri (23 Ekim 2026, ürün sahibinin kararı): tekrar doğruluğu, ders anketi, kalite örneği. */}
      <AdminCard
        title="Tekrar doğruluğu"
        desc="Günü gelen tekrarda cevap anındaki basamağa göre doğru oranı. Öğrencinin bir hafta sonra hatırladığı, dersin gerçekten öğretip öğretmediğini söyler."
        bodyless
      >
        <AdminTableFrame columns={["Basamak", "Son 7 gün", "Son 30 gün"]}>
          {signalsWeek.steps.map((step, index) => (
            <tr key={step.step}>
              <td className="font-medium">{step.label}</td>
              {signals.map((metrics) => {
                const row = metrics.steps[index]!;
                return (
                  <td key={metrics.days} className="text-xs">
                    {percentLabel(row.share)} · {row.correct} / {row.answered}
                  </td>
                );
              })}
            </tr>
          ))}
        </AdminTableFrame>
        {signalsMonth.weakTopics.length ? (
          <AdminTableFrame columns={["En zayıf konular (30 gün, en az 5 cevap)", "Doğru", "Cevap"]}>
            {signalsMonth.weakTopics.map((topic) => (
              <tr key={topic.topic}>
                <td className="text-xs">{topic.topic}</td>
                <td className="adm-num">{percentLabel(topic.share)}</td>
                <td className="adm-num">{topic.answered}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : null}
      </AdminCard>

      <AdminCard title="Ders anketi" desc="Sonuç ekranındaki “Bu dersi nasıl buldun?” cevapları." bodyless>
        <AdminTableFrame columns={["Cevap", "Son 7 gün", "Son 30 gün"]}>
          {signalsWeek.ratings.counts.map((row, index) => (
            <tr key={row.id}>
              <td className="font-medium">{row.label}</td>
              {signals.map((metrics) => (
                <td key={metrics.days} className="adm-num">
                  {metrics.ratings.counts[index]!.count}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td className="font-medium">Anlaşılmadı payı (Mantıklı değildi + Başka bir şey)</td>
            {signals.map((metrics) => (
              <td key={metrics.days} className="adm-num">
                {percentLabel(metrics.ratings.unclear)} · {metrics.ratings.total} cevap
              </td>
            ))}
          </tr>
        </AdminTableFrame>
        {signalsMonth.unclearLessons.length ? (
          <AdminTableFrame columns={["Anlaşılmadı denen etkinlik (30 gün)", "Cevap"]}>
            {signalsMonth.unclearLessons.map((row, index) => (
              <tr key={`${row.title}-${index}`}>
                <td className="text-xs">{row.title}</td>
                <td className="text-xs">{row.rating}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : null}
      </AdminCard>

      <AdminCard
        title="Ders kalitesi örneği"
        desc="Her sabah önceki günün derslerinden üçü bağımsız bir yargıca puanlatılır (0-100: açıklık, neden-nasıl, örnek, tekrar yok, soru, akılda kalma). Denetçinin öğretim puanı yazım sırasında, 1-5."
        bodyless
      >
        <AdminTableFrame columns={["Ölçü", "Son 7 gün", "Son 30 gün"]}>
          <tr>
            <td className="font-medium">Yargıç ortalaması (0-100)</td>
            {signals.map((metrics) => (
              <td key={metrics.days} className="adm-num">
                {score(metrics.quality.judgeAverage, 1)} · {metrics.quality.judged} ders
              </td>
            ))}
          </tr>
          <tr>
            <td className="font-medium">Denetçinin öğretim puanı (1-5)</td>
            {signals.map((metrics) => (
              <td key={metrics.days} className="adm-num">
                {score(metrics.quality.verifierAverage, 2)} · {metrics.quality.scored} ders
              </td>
            ))}
          </tr>
        </AdminTableFrame>
        {signalsMonth.quality.latest.length ? (
          <AdminTableFrame columns={["Gün", "Ders", "Puan", "En çok iyileştirecek değişiklik"]}>
            {signalsMonth.quality.latest.map((row, index) => (
              <tr key={`${row.day}-${index}`}>
                <td className="text-xs">{row.day}</td>
                <td className="text-xs">{row.topic}</td>
                <td className="adm-num">{score(row.total, 1)}</td>
                <td className="text-xs">{row.note}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : null}
      </AdminCard>
    </AdminShell>
  );
}
