import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Sistem" };

const services = [
  { name: "Supabase", env: "NEXT_PUBLIC_SUPABASE_URL" },
  { name: "Supabase service key", env: "SUPABASE_SECRET_KEY" },
  { name: "OpenAI", env: "OPENAI_API_KEY" },
  { name: "PayTR", env: "PAYTR_MERCHANT_ID" },
  { name: "Resend", env: "RESEND_API_KEY" },
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
    </AppShell>
  );
}
