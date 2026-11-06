import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { usageActionLabel } from "@/lib/admin/labels";
import { modelLabel } from "@/lib/admin/finance-math";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Yönetim · AI Kullanımı" };
export const dynamic = "force-dynamic";

const SAMPLE = 500;

export default async function AdminAiKullanimiPage() {
  await requireAdminPage();
  const service = createServiceClient();

  const { data: events, error } = await service
    .from("ai_usage_events")
    .select("action_code, model, tokens_in, tokens_out")
    .order("created_at", { ascending: false })
    .limit(SAMPLE);

  const byAction = new Map<string, { label: string; model: string; count: number; tokensIn: number; tokensOut: number }>();

  for (const event of events ?? []) {
    const label = usageActionLabel(event.action_code);
    const key = `${label}|${event.model}`;
    const entry = byAction.get(key) ?? { label, model: event.model, count: 0, tokensIn: 0, tokensOut: 0 };
    entry.count += 1;
    entry.tokensIn += event.tokens_in ?? 0;
    entry.tokensOut += event.tokens_out ?? 0;
    byAction.set(key, entry);
  }

  const rows = [...byAction.values()].sort((a, b) => b.count - a.count);
  const totalCalls = rows.reduce((sum, row) => sum + row.count, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.tokensIn + row.tokensOut, 0);

  return (
    <AdminShell href="/admin/ai-kullanimi">
      <AdminNote tone="info">
        <strong>Jeton</strong>, yapay zekânın metni ölçme birimi; kabaca bir kelime bir buçuk jetona denk gelir. Fatura
        jetondan hesaplanır, o yüzden en çok jeton yakan işlem en pahalı işlemdir. Bu tabloda son{" "}
        {formatNumber(SAMPLE)} çağrı var; tutar karşılığı için{" "}
        <Link href="/admin/maliyetler" className="underline">
          Birim Ekonomisi & Maliyetler
        </Link>
        .
      </AdminNote>

      {error ? <AdminNote tone="warn">Kullanım kaydı okunamadı; tablo boş görünebilir.</AdminNote> : null}

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-label">İncelenen çağrı</span>
          <span className="adm-stat-value">{formatNumber(totalCalls)}</span>
          <span className="adm-stat-hint">En son yapılanlar</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Toplam jeton</span>
          <span className="adm-stat-value">{formatNumber(totalTokens)}</span>
          <span className="adm-stat-hint">Giren ve çıkan metin toplamı</span>
        </div>
      </div>

      <AdminCard title="İşleme göre kullanım" desc="En çok çalışan işlem en üstte. Hızlı işlem, öğrenci beklerken açılan pahalı yoldur." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["İşlem", "Model", "Çağrı", "Giren jeton", "Çıkan jeton"]}>
            {rows.map((row) => (
              <tr key={`${row.label}-${row.model}`}>
                <td className="font-medium">{row.label}</td>
                <td className="text-xs">{modelLabel(row.model)}</td>
                <td className="adm-num">{formatNumber(row.count)}</td>
                <td className="adm-num">{formatNumber(row.tokensIn)}</td>
                <td className="adm-num">{formatNumber(row.tokensOut)}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz yapay zekâ kullanımı yok">Öğrenciler yapay zekâyı kullanmaya başladığında burada dolar.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
