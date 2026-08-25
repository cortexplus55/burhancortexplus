import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatNumber, formatTry } from "@/lib/format";

export const metadata = { title: "Admin" };

const links = [
  { href: "/admin/kullanicilar", label: "Kullanıcılar" },
  { href: "/admin/ogretmen-basvurulari", label: "Öğretmen başvuruları" },
  { href: "/admin/paketler", label: "Paketler" },
  { href: "/admin/kredi-kurallari", label: "Kredi kuralları" },
  { href: "/admin/odemeler", label: "Ödemeler" },
  { href: "/admin/promosyonlar", label: "Promosyonlar" },
  { href: "/admin/ai-kullanimi", label: "AI kullanımı" },
  { href: "/admin/maliyetler", label: "Maliyetler" },
  { href: "/admin/promptlar", label: "Promptlar" },
  { href: "/admin/feature-flags", label: "Feature flag" },
  { href: "/admin/audit-log", label: "Audit log" },
  { href: "/admin/sistem", label: "Sistem" },
];

export default async function AdminPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [users, pending, payments, usage] = await Promise.all([
    service.from("profiles").select("id", { count: "exact", head: true }),
    service
      .from("teacher_applications")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    service.from("payments").select("amount_try").eq("status", "paid"),
    service.from("ai_usage_events").select("id", { count: "exact", head: true }),
  ]);

  const revenue = (payments.data ?? []).reduce(
    (sum, payment) => sum + (payment.amount_try ?? 0),
    0,
  );

  const stats = [
    { label: "Kullanıcı", value: formatNumber(users.count ?? 0) },
    { label: "Bekleyen başvuru", value: formatNumber(pending.count ?? 0) },
    { label: "Toplam gelir", value: formatTry(revenue) },
    { label: "AI işlemi", value: formatNumber(usage.count ?? 0) },
  ];

  return (
    <AppShell variant="admin" title="Yönetim paneli">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md border px-4 py-3 text-sm hover:bg-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </AppShell>
  );
}
