import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/format";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Limitler" };

const entryLabels: Record<string, string> = {
  grant: "Hediye",
  reserve: "Rezerve",
  commit: "Kullanıldı",
  refund: "İade",
  purchase: "Satın alma",
  adjustment: "Düzeltme",
};

function LimitBar({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="ap-limit-row">
      <div className="ap-limit-head">
        <span>{label}</span>
        <strong>
          {formatNumber(value)} / {formatNumber(max)}
        </strong>
      </div>
      <div className="ap-limit-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="ap-limit-fill" style={{ width: `${pct}%` }} />
      </div>
      <p>{hint}</p>
    </div>
  );
}

export default async function KredilerPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

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

  const balance = wallet?.balance ?? 0;
  const reserved = wallet?.reserved ?? 0;
  const free = wallet?.free_allowance_remaining ?? 0;
  const creditCap = Math.max(balance + reserved, 100);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Kullanım ve limitler</h1>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Kredin, ücretsiz hakkın ve günlük serin tek yerde.
          </p>
        </div>

        <div className="ap-limit-card">
          <LimitBar
            label="Kredi bakiyesi"
            value={balance}
            max={creditCap}
            hint={reserved ? `${formatNumber(reserved)} kredi şu an rezerve` : "Kullanılabilir kredi"}
          />
          <LimitBar
            label="Ücretsiz hak"
            value={free}
            max={Math.max(free, 50)}
            hint="Aylık ücretsiz çözüm hakkı"
          />
          <LimitBar
            label="Çalışma serisi"
            value={shell.streak ?? 0}
            max={7}
            hint="Son 7 günde üst üste çalışma"
          />
        </div>

        <Link href="/pay" className="ap-exam-continue inline-flex">
          Plus’a yükselt
        </Link>

        <SectionCard
          variant="astra"
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

        <SectionCard variant="astra" title="Hareketler">
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
    </AstraParitySorShell>
  );
}
