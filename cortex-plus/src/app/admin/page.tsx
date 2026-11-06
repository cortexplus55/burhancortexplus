import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { CockpitQuarantine } from "@/components/admin/cockpit-quarantine";
import { CockpitSuperseded } from "@/components/admin/cockpit-superseded";
import { FreePreviewToggle } from "@/components/admin/free-preview-toggle";
import { FxRateForm } from "@/components/admin/fx-rate-form";
import { SpendCapForm } from "@/components/admin/spend-cap-form";
import { AdminBadge, AdminCard, AdminEmpty, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { loadCockpit } from "@/lib/admin/cockpit";
import { spendKurus, WINDOW_KEYS, WINDOW_LABEL, type WindowCounts } from "@/lib/admin/cockpit-math";
import { formatDate, formatNumber, formatTry } from "@/lib/format";
import { reportReasonLabel, type ReportReason } from "@/lib/learning/question-report/copy";
import { statusLabel as rawStatusLabel } from "@/lib/admin/status-labels";

export const metadata = { title: "Yönetim · Ana Kokpit" };
/** "Reddet ve yeniden ürettir" bir model çağrısı yapar (~20 sn); Hobby planının tavanı. */
export const maxDuration = 60;

function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: number | null): string {
  return value == null ? "—" : `%${value}`;
}

function CountRow({ label, counts, format = formatNumber }: { label: string; counts: WindowCounts; format?: (value: number) => string }) {
  return (
    <tr>
      <td>{label}</td>
      {WINDOW_KEYS.map((key) => (
        <td key={key} className="adm-num">
          {format(counts[key])}
        </td>
      ))}
    </tr>
  );
}

export default async function AdminPage() {
  const { user, role } = await requireAdminPage();
  const isFounder = role === "founder";
  const service = createServiceClient();

  const [cockpit, pending, recentPayments, preview] = await Promise.all([
    loadCockpit(service),
    countPendingApplications(service),
    service
      .from("payments")
      .select("id, amount_try, status, created_at, profiles!payments_user_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(5),
    service.from("admin_free_preview").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);

  const { growth, conversions, economics, reports, quarantine, superseded, breaker, failed } = cockpit;
  const spendTodayKurus = spendKurus(economics.spendToday?.usd ?? null, economics.usdTry.rate);
  const spendMonthKurus = spendKurus(economics.spendMonth?.usd ?? null, economics.usdTry.rate);

  const stats = [
    { label: "Bugün yeni kayıt", value: formatNumber(growth.signups.today), hint: `Toplam ${formatNumber(growth.totalUsers)} kullanıcı · son 7 günde ${formatNumber(growth.signups.week)}` },
    { label: "Bugün aktif öğrenci", value: formatNumber(growth.activeStudents.today), hint: `Son 30 günde ${formatNumber(growth.activeStudents.month)} farklı öğrenci etkinlik açtı` },
    { label: "Son 30 gün gelir", value: formatTry(conversions.revenueKurus.month), hint: `Bugün ${formatTry(conversions.revenueKurus.today)} · ${formatNumber(conversions.paid.month)} başarılı ödeme` },
    {
      label: "Bugün OpenAI gideri",
      value: economics.spendToday ? usd(economics.spendToday.usd) : "okunamadı",
      hint: economics.spendMonth ? `Son 30 gün ${usd(economics.spendMonth.usd)} · ${formatNumber(economics.spendMonth.calls)} çağrı` : "Son 30 gün okunamadı",
    },
  ];

  const statusTone = { paid: "ok", pending: "warn", failed: "bad", refunded: "mute" } as const;
  const statusLabel = { paid: "Ödendi", pending: "Bekliyor", failed: "Başarısız", refunded: "İade edildi" } as const;
  const pendingReports = reports.filter((row) => row.verdict === "pending").length;

  return (
    <AdminShell href="/admin" pendingApplications={pending}>
      <div className="adm-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="adm-stat">
            <span className="adm-stat-label">{stat.label}</span>
            <span className="adm-stat-value">{stat.value}</span>
            <span className="adm-stat-hint">{stat.hint}</span>
          </div>
        ))}
      </div>

      {failed.length ? (
        <div className="adm-note adm-note--warn">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <div>Şu kaynaklar okunamadı, kutuları eksik olabilir: {failed.join(", ")}.</div>
        </div>
      ) : null}

      <AdminCard title="Büyüme ve dönüşüm" desc="Üç pencere aynı sorgudan; Türkiye günüyle. Dönüşüm = başarılı ödeme; 'ilk kez ödeyen' ücretsizden ücretliye geçiştir." bodyless>
        <AdminTableFrame columns={["Ölçü", ...WINDOW_KEYS.map((key) => WINDOW_LABEL[key])]}>
          <CountRow label="Yeni kayıt" counts={growth.signups} />
          <CountRow label="Aktif öğrenci (etkinlik açan)" counts={growth.activeStudents} />
          <CountRow label="Başarılı ödeme" counts={conversions.paid} />
          <CountRow label="İlk kez ödeyen (ücretsiz → ücretli)" counts={conversions.firstTime} />
          {conversions.byPlan.map((plan) => (
            <CountRow key={plan.slug} label={`· ${plan.label}`} counts={plan.counts} />
          ))}
          <CountRow label="Velime ödeme linkiyle ödeme" counts={conversions.parentLink} />
          <CountRow label="Gelir" counts={conversions.revenueKurus} format={formatTry} />
        </AdminTableFrame>
      </AdminCard>

      <AdminCard
        title="Birim ekonomisi (kâr / zarar)"
        desc="OpenAI gideri kullanım kayıtları ve model fiyat tablosundan hesaplanır; gelir başarılı ödemelerden. Marj için kur gerekir."
        actions={isFounder ? <FxRateForm current={economics.usdTry.rate} isDefault={economics.usdTry.source === "default"} /> : undefined}
        bodyless
      >
        <AdminTableFrame columns={["", "Bugün", "Son 30 gün"]}>
          <tr>
            <td>OpenAI gideri</td>
            <td className="adm-num">{economics.spendToday ? usd(economics.spendToday.usd) : "—"}</td>
            <td className="adm-num">{economics.spendMonth ? usd(economics.spendMonth.usd) : "—"}</td>
          </tr>
          <tr>
            <td>Gider (TL, kurla)</td>
            <td className="adm-num">{spendTodayKurus == null ? "—" : formatTry(spendTodayKurus)}</td>
            <td className="adm-num">{spendMonthKurus == null ? "—" : formatTry(spendMonthKurus)}</td>
          </tr>
          <tr>
            <td>Gelir (TL)</td>
            <td className="adm-num">{formatTry(conversions.revenueKurus.today)}</td>
            <td className="adm-num">{formatTry(conversions.revenueKurus.month)}</td>
          </tr>
          <tr>
            <td>Net kâr marjı</td>
            <td className="adm-num">{pct(economics.marginToday)}</td>
            <td className="adm-num">{pct(economics.marginMonth)}</td>
          </tr>
          {economics.spendMonth?.byModel.slice(0, 4).map((model) => (
            <tr key={model.model}>
              <td className="text-[var(--adm-muted)]">· {model.model}</td>
              <td className="adm-num text-[var(--adm-muted)]">{formatNumber(economics.spendToday?.byModel.find((row) => row.model === model.model)?.calls ?? 0)} çağrı</td>
              <td className="adm-num text-[var(--adm-muted)]">{usd(model.usd)} · {formatNumber(model.calls)} çağrı</td>
            </tr>
          ))}
        </AdminTableFrame>
        {economics.usdTry.source === "default" ? (
          <p className="px-5 py-3 text-xs text-[var(--adm-muted)]">
            Kur girilmedi: marj varsayılan 1 USD = {economics.usdTry.rate} TL ile hesaplanıyor. Güncel kuru yukarıdaki kutuya yazınca bu satır kalkar.
          </p>
        ) : null}
        {economics.spendMonth?.unpricedCalls ? (
          <p className="px-5 py-3 text-xs text-[var(--adm-muted)]">
            {formatNumber(economics.spendMonth.unpricedCalls)} çağrının modeli fiyat tablosunda yok; gider o kadar eksik. <Link href="/admin/maliyetler" className="underline">Maliyetler</Link>
          </p>
        ) : null}
        <div className="border-t border-[var(--adm-line)] px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Günlük harcama sigortası</span>
            {breaker ? (
              <AdminBadge tone={!breaker.enabled ? "mute" : breaker.tripped ? "bad" : "ok"}>
                {!breaker.enabled ? "Kapalı (yerel)" : breaker.tripped ? "Devreye girdi · ücretsiz üretim durdu" : "Açık"}
              </AdminBadge>
            ) : (
              <AdminBadge tone="mute">okunamadı</AdminBadge>
            )}
            {breaker ? (
              <span className="text-xs text-[var(--adm-muted)]">
                Bugün {usd(breaker.spentUsd ?? 0)} / tavan {usd(breaker.cap.capUsd)} · tavan aşılınca ücretsiz hesapların model çağrısı durur, hazır müfredat ve Plus sürer
              </span>
            ) : null}
          </div>
          {isFounder ? (
            <SpendCapForm current={breaker?.cap.capUsd ?? 25} source={breaker?.cap.source ?? "default"} />
          ) : (
            <p className="text-xs text-[var(--adm-muted)]">Kur ve harcama tavanını yalnız kurucu değiştirir.</p>
          )}
        </div>
      </AdminCard>

      <AdminCard
        id="karantina"
        title="Canlı kalite · Karantina kuyruğu"
        desc="Saatlik denetim; doğru oranı düşük, çok bildirilen ya da güçlü öğrencilerin aynı yanlışı seçtiği havuz sorusunu karantinaya alır. Burada okur, karar verirsin."
      >
        <CockpitQuarantine rows={quarantine} />
      </AdminCard>

      <AdminCard
        title="Eski sürüm soruları"
        desc="Ünite yeniden yazılınca (kayıt defteri değişti ya da ders yeniden kuyruğa alındı) eski içeriğin soruları kenarda bekler (Yenilenecek); öğrenciye sunulmaz. Yeni sürüm doğrulandıysa tek tıkla arşivlenir; satır silinmez."
      >
        <CockpitSuperseded rows={superseded} />
      </AdminCard>

      <AdminCard
        title="🚩 Soruda hata bildirimleri"
        desc={`Son ${reports.length} bildirim; ${pendingReports} tanesi denetim bekliyor. Karar modelden (soruyu kendisi çözer); geçerli bulunan soru öğrenciye tam puan, kayıt düzeltilir.`}
        bodyless
      >
        {reports.length ? (
          <AdminTableFrame columns={["Tarih", "Kaynak", "Sebep", "Karar", "Soru"]}>
            {reports.map((row) => (
              <tr key={row.id}>
                <td className="adm-num">{formatDate(row.createdAt)}</td>
                <td>{row.source === "mock" ? "Yazılı deneme" : "Yol testi"}</td>
                <td>
                  {reportReasonLabel(row.reason as ReportReason)}
                  {row.note ? <span className="block text-xs text-[var(--adm-muted)]">{row.note}</span> : null}
                </td>
                <td>
                  <AdminBadge tone={row.verdict === "valid" ? "warn" : row.verdict === "invalid" ? "ok" : row.verdict === "error" ? "bad" : "mute"}>{row.verdictLabel}</AdminBadge>
                  {row.explanation ? <span className="block text-xs text-[var(--adm-muted)]">{row.explanation}</span> : null}
                </td>
                <td className="max-w-md">
                  {row.question ? (
                    <details>
                      <summary className="cursor-pointer text-xs">{row.question.text.slice(0, 90)}{row.question.text.length > 90 ? "…" : ""}</summary>
                      <p className="mt-1 whitespace-pre-line text-xs">{row.question.text}</p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {row.question.options.map((option, index) => (
                          <li key={`${row.id}-${index}`} className={row.question?.correct.includes(option) ? "font-semibold text-[var(--adm-ok)]" : ""}>
                            {option}
                            {row.question?.correct.includes(option) ? " ✓" : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span className="text-xs text-[var(--adm-muted)]">Soru metni kayıtta yok</span>
                  )}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz bildirim yok">Öğrenci &quot;🚩 Soruda hata bildir&quot; dediğinde burada görünür.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Ücretsiz gibi gör"
        desc="Kendi hesabında ücretsiz öğrencinin sınırlarını dene."
        actions={<FreePreviewToggle on={Boolean(preview.data)} className="adm-btn adm-btn--primary" />}
      >
        <p className="text-sm text-[var(--adm-muted)]">
          Açıkken ilk hazırlıkta yalnız 1. konu açık (haftada 3 ders), günde 3 mesaj ve 1 fotoğraf, 1 sınav hazırlığı ve toplam 25 sayfa belge geçerli; yükseltme
          kapıları ücretsiz hesaptaki gibi çıkar. Kredin düşmez, eski belge ve hazırlıkların sayılmaz. Kapatmak için öğrenci ekranlarının üstündeki şeridi kullan.
        </p>
      </AdminCard>

      {pending > 0 ? (
        <AdminCard
          title="Seni bekleyen iş var"
          desc={`${pending} öğretmen başvurusu cevap bekliyor.`}
          actions={
            <Link href="/admin/ogretmen-basvurulari" className="adm-btn adm-btn--primary">
              Başvurulara git
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        >
          <p className="text-sm text-[var(--adm-muted)]">Başvuran kişi onay gelene kadar öğretmen özelliklerini kullanamıyor.</p>
        </AdminCard>
      ) : (
        <div className="adm-note adm-note--info">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <div>Bekleyen başvuru yok. Başvuru geldiğinde burada ve soldaki menüde görünür.</div>
        </div>
      )}

      <AdminCard
        title="Son ödemeler"
        desc="En yeni beş işlem."
        bodyless
        actions={
          <Link href="/admin/odemeler" className="adm-btn">
            Hepsini gör
          </Link>
        }
      >
        {recentPayments.data?.length ? (
          <AdminTableFrame columns={["Kişi", "Tutar", "Durum", "Tarih"]}>
            {recentPayments.data.map((payment) => {
              const person = payment.profiles as { full_name?: string } | null;
              const status = payment.status as keyof typeof statusLabel;
              return (
                <tr key={payment.id}>
                  <td>{person?.full_name || "İsimsiz kullanıcı"}</td>
                  <td className="adm-num">{formatTry(payment.amount_try ?? 0)}</td>
                  <td>
                    <AdminBadge tone={statusTone[status] ?? "mute"}>{statusLabel[status] ?? rawStatusLabel(status)}</AdminBadge>
                  </td>
                  <td className="adm-num">{formatDate(payment.created_at)}</td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz ödeme yok">İlk satış gerçekleştiğinde işlemler burada listelenir.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Ders üretim hataları"
        desc="Kaynak, kalite kapısı ve sağlayıcı düşüşleri."
        actions={
          <Link href="/admin/ders-hatalari" className="adm-btn">
            Hatalara bak
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      >
        <p className="text-sm text-[var(--adm-muted)]">Her başarısız ders üretimi sebep kodu ve kaynak çözücü iziyle kayda geçer. Zamanlar Türkiye saatiyle.</p>
      </AdminCard>
    </AdminShell>
  );
}
