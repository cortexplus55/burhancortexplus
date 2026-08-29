import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Krediler" };

const entryLabels: Record<string, string> = {
  grant: "Hediye",
  reserve: "Rezerve",
  commit: "Kullanıldı",
  refund: "İade",
  purchase: "Satın alma",
  adjustment: "Düzeltme",
};

export default async function KredilerPage() {
  const { supabase, user } = await requireUser();

  const [{ data: wallet }, { data: ledger }, { data: rules }] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select("balance, reserved, free_allowance_remaining")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select("id, delta, entry_type, action_code, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("credit_rules")
      .select("action_code, credit_cost, description")
      .eq("active", true)
      .order("credit_cost"),
  ]);

  return (
    <AppShell title="Krediler" accountStrip={false}>
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Kullanılabilir kredi", value: wallet?.balance ?? 0 },
            { label: "Rezerve", value: wallet?.reserved ?? 0 },
            {
              label: "Ücretsiz hak",
              value: wallet?.free_allowance_remaining ?? 0,
            },
          ].map((item) => (
            <div key={item.label} className="cortex-premium-stat-tile">
              <p className="cortex-premium-stat-tile__label">{item.label}</p>
              <p className="cortex-premium-stat-tile__value">
                {formatNumber(item.value)}
              </p>
            </div>
          ))}
        </div>

        <Link href="/pay" className="cortex-premium-btn-primary inline-flex w-auto px-8">
          Kredi yükle
        </Link>

        <SectionCard
          title="İşlem başına kredi"
          description="Fiyatlar sunucu tarafında tutulur; işlem öncesinde her zaman gösterilir."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {(rules ?? []).map((rule) => (
              <li key={rule.action_code} className="cortex-premium-inset-row">
                <span>{rule.description ?? rule.action_code}</span>
                <span className="font-medium text-[var(--astra-primary)]">
                  {rule.credit_cost}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Hareketler">
          {ledger?.length ? (
            <ul className="cortex-premium-inset-list divide-y">
              {ledger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span className="text-[var(--astra-text)]">
                    {entryLabels[entry.entry_type] ?? entry.entry_type}
                    {entry.action_code ? ` · ${entry.action_code}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        entry.delta > 0
                          ? "font-medium text-[var(--astra-primary)]"
                          : "text-[var(--astra-muted)]"
                      }
                    >
                      {entry.delta > 0 ? "+" : ""}
                      {entry.delta}
                    </span>
                    <span className="text-xs text-[var(--astra-muted)]">
                      {formatDate(entry.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--astra-muted)]">Henüz hareket yok.</p>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
