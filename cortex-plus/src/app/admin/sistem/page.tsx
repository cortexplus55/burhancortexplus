import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { SmtpTestButton } from "@/components/admin/smtp-test-button";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { SERVICE_NOTES } from "@/lib/admin/labels";

export const metadata = { title: "Yönetim · Sistem durumu" };

/**
 * `critical` olanlar eksikse ürünün bir parçası hiç çalışmaz; diğerleri
 * eksikse ürün çalışır ama körsün (ölçüm, hata takibi).
 */
const SERVICES = [
  { name: "Supabase", env: "NEXT_PUBLIC_SUPABASE_URL", critical: true },
  { name: "Supabase service key", env: "SUPABASE_SECRET_KEY", critical: true },
  { name: "OpenAI", env: "OPENAI_API_KEY", critical: true },
  { name: "Workspace SMTP", env: "SMTP_PASS", critical: true },
  { name: "PayTR", env: "PAYTR_MERCHANT_ID", critical: false },
  { name: "Upstash Redis", env: "UPSTASH_REDIS_REST_URL", critical: false },
  { name: "PostHog", env: "NEXT_PUBLIC_POSTHOG_KEY", critical: false },
  { name: "Sentry", env: "SENTRY_DSN", critical: false },
];

export default async function AdminSistemPage() {
  await requireAdmin();
  const service = createServiceClient();
  const pending = await countPendingApplications(service);

  const rows = SERVICES.map((item) => ({
    ...item,
    configured: Boolean(process.env[item.env]),
  }));

  const missingCritical = rows.filter((row) => row.critical && !row.configured);

  return (
    <AdminShell href="/admin/sistem" pendingApplications={pending}>
      <AdminNote tone="info">
        Burada yalnızca bir ayarın <strong>tanımlı olup olmadığı</strong>{" "}
        görünür; şifrelerin ve anahtarların kendisi asla gösterilmez. Bir satır
        eksik görünüyorsa ayar sunucuda (Vercel) tanımlanmalı.
      </AdminNote>

      {missingCritical.length ? (
        <AdminNote tone="warn">
          {missingCritical.length} zorunlu ayar eksik:{" "}
          <strong>{missingCritical.map((row) => row.name).join(", ")}</strong>.
          Bunlar olmadan ürünün bir kısmı çalışmaz.
        </AdminNote>
      ) : null}

      <AdminCard
        title="Bağlantılar"
        desc="Her satırın açıklaması, o ayar eksik olursa neyin bozulacağını söylüyor."
        bodyless
      >
        <AdminTableFrame columns={["Servis", "Ne işe yarar", "Durum"]}>
          {rows.map((row) => (
            <tr key={row.env}>
              <td>
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-[var(--adm-muted)]">{row.env}</div>
              </td>
              <td className="max-w-md whitespace-normal text-xs text-[var(--adm-muted)]">
                {SERVICE_NOTES[row.name] ?? "—"}
              </td>
              <td>
                {row.configured ? (
                  <AdminBadge tone="ok">Tanımlı</AdminBadge>
                ) : row.critical ? (
                  <AdminBadge tone="bad">Eksik</AdminBadge>
                ) : (
                  <AdminBadge tone="warn">Tanımsız</AdminBadge>
                )}
              </td>
            </tr>
          ))}
        </AdminTableFrame>
      </AdminCard>

      <AdminCard
        title="E-posta bağlantısını sına"
        desc="Kayıt ve doğrulama e-postalarının gidip gitmediğini kontrol eder. Kimseye e-posta göndermez, yalnızca bağlantıyı dener."
      >
        <SmtpTestButton />
      </AdminCard>
    </AdminShell>
  );
}
