import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { SmtpTestButton } from "@/components/admin/smtp-test-button";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Sistem" };

const services = [
  { name: "Supabase", env: "NEXT_PUBLIC_SUPABASE_URL" },
  { name: "Supabase service key", env: "SUPABASE_SECRET_KEY" },
  { name: "OpenAI", env: "OPENAI_API_KEY" },
  { name: "PayTR", env: "PAYTR_MERCHANT_ID" },
  { name: "Workspace SMTP", env: "SMTP_PASS" },
  { name: "Upstash Redis", env: "UPSTASH_REDIS_REST_URL" },
  { name: "PostHog", env: "NEXT_PUBLIC_POSTHOG_KEY" },
  { name: "Sentry", env: "SENTRY_DSN" },
];

export default async function AdminSistemPage() {
  await requireAdmin();

  const rows = services.map((service) => [
    service.name,
    service.env,
    process.env[service.env] ? "Yapılandırıldı" : "Eksik",
  ]);

  return (
    <AppShell variant="admin" title="Sistem durumu">
      <p className="mb-4 text-sm text-muted-foreground">
        Yalnızca değişkenin tanımlı olup olmadığı gösterilir; değerler asla
        görüntülenmez.
      </p>
      <AdminTable columns={["Servis", "Değişken", "Durum"]} rows={rows} />
      <div className="mt-8 border-t pt-6">
        <h2 className="mb-2 text-sm font-medium">Workspace SMTP</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Gmail uygulama şifresi ile Vercel&apos;de SMTP_* tanımlı olmalı. Kurulum:{" "}
          <code className="text-xs">docs/delivery/WORKSPACE-EMAIL.md</code>
        </p>
        <SmtpTestButton />
      </div>
    </AppShell>
  );
}
