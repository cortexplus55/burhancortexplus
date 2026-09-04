import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatTry } from "@/lib/format";

export const metadata = { title: "Yönetim · Giderler" };

const SAMPLE = 1000;

export default async function AdminGiderlerPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: prices }, { data: usage }, { data: payments }, pending] =
    await Promise.all([
      service.from("ai_model_prices").select("model, input_per_1k, output_per_1k"),
      service
        .from("ai_usage_events")
        .select("model, tokens_in, tokens_out")
        .order("created_at", { ascending: false })
        .limit(SAMPLE),
      service.from("payments").select("amount_try").eq("status", "paid"),
      countPendingApplications(service),
    ]);

  const priceMap = new Map(
    (prices ?? []).map((price) => [
      price.model,
      { input: Number(price.input_per_1k), output: Number(price.output_per_1k) },
    ]),
  );

  const costByModel = new Map<string, { cost: number; calls: number }>();
  let unpriced = 0;

  for (const event of usage ?? []) {
    const price = priceMap.get(event.model);
    if (!price) {
      unpriced += 1;
      continue;
    }
    const cost =
      ((event.tokens_in ?? 0) / 1000) * price.input +
      ((event.tokens_out ?? 0) / 1000) * price.output;
    const entry = costByModel.get(event.model) ?? { cost: 0, calls: 0 };
    entry.cost += cost;
    entry.calls += 1;
    costByModel.set(event.model, entry);
  }

  const rows = [...costByModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const totalCost = rows.reduce((sum, [, entry]) => sum + entry.cost, 0);
  const revenue = (payments ?? []).reduce(
    (sum, payment) => sum + (payment.amount_try ?? 0),
    0,
  );

  return (
    <AdminShell href="/admin/maliyetler" pendingApplications={pending}>
      <AdminNote tone="info">
        Buradaki tutar <strong>tahmindir</strong>, fatura değil. Son{" "}
        {SAMPLE.toLocaleString("tr-TR")} işlem, tanımlı model fiyatlarıyla
        çarpılarak hesaplanıyor. Gerçek fatura sağlayıcının panelinde görünür;
        bu sayfa &ldquo;gelir gideri karşılıyor mu&rdquo; sorusuna hızlı bir
        cevap vermek için var.
      </AdminNote>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-label">Toplam gelir</span>
          <span className="adm-stat-value">{formatTry(revenue)}</span>
          <span className="adm-stat-hint">Tüm zamanlar, ödenmiş satışlar</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Tahmini AI gideri</span>
          <span className="adm-stat-value">${totalCost.toFixed(2)}</span>
          <span className="adm-stat-hint">Son {SAMPLE.toLocaleString("tr-TR")} işlem</span>
        </div>
      </div>

      <AdminCard title="Modele göre gider" desc="En pahalı model en üstte." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["Model", "Kaç işlem", "Tahmini gider"]}>
            {rows.map(([model, entry]) => (
              <tr key={model}>
                <td className="font-medium">{model}</td>
                <td className="adm-num">{entry.calls.toLocaleString("tr-TR")}</td>
                <td className="adm-num">${entry.cost.toFixed(4)}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Gider hesaplanamıyor">
            Model fiyatları tanımlı değil. Hesabın çalışması için
            `ai_model_prices` tablosuna kullanılan modellerin bin birim başına
            fiyatı girilmeli.
          </AdminEmpty>
        )}
      </AdminCard>

      {unpriced > 0 ? (
        <AdminNote tone="warn">
          {unpriced.toLocaleString("tr-TR")} işlemin modeli için fiyat tanımlı
          değil; bunlar toplama katılmadı, yani gerçek gider gösterilenden
          yüksek.
        </AdminNote>
      ) : null}
    </AdminShell>
  );
}
