import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTry } from "@/lib/format";

export const metadata = { title: "Maliyetler" };

export default async function AdminMaliyetlerPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: prices }, { data: usage }, { data: payments }] = await Promise.all([
    service.from("ai_model_prices").select("model, input_per_1k, output_per_1k"),
    service.from("ai_usage_events").select("model, tokens_in, tokens_out").limit(1000),
    service.from("payments").select("amount_try").eq("status", "paid"),
  ]);

  const priceMap = new Map(
    (prices ?? []).map((price) => [
      price.model,
      { input: Number(price.input_per_1k), output: Number(price.output_per_1k) },
    ]),
  );

  const costByModel = new Map<string, number>();
  for (const event of usage ?? []) {
    const price = priceMap.get(event.model);
    if (!price) continue;
    const cost =
      ((event.tokens_in ?? 0) / 1000) * price.input +
      ((event.tokens_out ?? 0) / 1000) * price.output;
    costByModel.set(event.model, (costByModel.get(event.model) ?? 0) + cost);
  }

  const revenue = (payments ?? []).reduce(
    (sum, payment) => sum + (payment.amount_try ?? 0),
    0,
  );

  return (
    <AppShell variant="admin" title="Maliyetler">
      <div className="space-y-6">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">Toplam gelir</p>
          <p className="mt-1 text-2xl font-semibold">{formatTry(revenue)}</p>
        </div>

        <AdminTable
          columns={["Model", "Tahmini maliyet (USD)"]}
          rows={[...costByModel.entries()].map(([model, cost]) => [
            model,
            cost.toFixed(4),
          ])}
          emptyMessage="Model fiyatları tanımlanmadığı için maliyet hesaplanamadı. ai_model_prices tablosuna kayıt ekleyin."
        />
      </div>
    </AppShell>
  );
}
