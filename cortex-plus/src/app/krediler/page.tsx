import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
            <div key={item.label} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold">
                {formatNumber(item.value)}
              </p>
            </div>
          ))}
        </div>

        <Link href="/paketler" className={cn(buttonVariants())}>
          Kredi yükle
        </Link>

        <SectionCard
          title="İşlem başına kredi"
          description="Fiyatlar sunucu tarafında tutulur; işlem öncesinde her zaman gösterilir."
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {(rules ?? []).map((rule) => (
              <li
                key={rule.action_code}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>{rule.description ?? rule.action_code}</span>
                <span className="font-medium">{rule.credit_cost}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Hareketler">
          {ledger?.length ? (
            <ul className="divide-y">
              {ledger.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span>
                    {entryLabels[entry.entry_type] ?? entry.entry_type}
                    {entry.action_code ? ` · ${entry.action_code}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={
                        entry.delta > 0 ? "text-primary" : "text-muted-foreground"
                      }
                    >
                      {entry.delta > 0 ? "+" : ""}
                      {entry.delta}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(entry.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Henüz hareket yok.</p>
          )}
        </SectionCard>
      </div>
    </AppShell>
  );
}
