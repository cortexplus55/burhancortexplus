import { AppShell } from "@/components/layout/app-shell";
import { CreditRuleRow } from "@/components/admin/credit-rule-row";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Kredi kuralları" };

export default async function AdminKrediKurallariPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: rules } = await service
    .from("credit_rules")
    .select("action_code, credit_cost, model_tier, description")
    .order("action_code");

  return (
    <AppShell variant="admin" title="Kredi kuralları">
      <p className="mb-4 text-sm text-muted-foreground">
        Fiyatlar veritabanından okunur; kodda sabit fiyat bulunmaz. Değişiklikler
        audit log&apos;a yazılır.
      </p>
      <ul className="divide-y rounded-lg border">
        {(rules ?? []).map((rule) => (
          <CreditRuleRow
            key={rule.action_code}
            actionCode={rule.action_code}
            creditCost={rule.credit_cost}
            modelTier={rule.model_tier}
            description={rule.description}
          />
        ))}
      </ul>
    </AppShell>
  );
}
