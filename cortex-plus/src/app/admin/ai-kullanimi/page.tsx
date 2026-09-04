import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { actionLabel } from "@/lib/admin/labels";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Yönetim · AI kullanımı" };

const SAMPLE = 500;

export default async function AdminAiKullanimiPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: events }, pending] = await Promise.all([
    service
      .from("ai_usage_events")
      .select("action_code, model, tokens_in, tokens_out")
      .order("created_at", { ascending: false })
      .limit(SAMPLE),
    countPendingApplications(service),
  ]);

  const byAction = new Map<
    string,
    { action: string; model: string; count: number; tokensIn: number; tokensOut: number }
  >();

  for (const event of events ?? []) {
    const key = `${event.action_code}|${event.model}`;
    const entry = byAction.get(key) ?? {
      action: event.action_code,
      model: event.model,
      count: 0,
      tokensIn: 0,
      tokensOut: 0,
    };
    entry.count += 1;
    entry.tokensIn += event.tokens_in ?? 0;
    entry.tokensOut += event.tokens_out ?? 0;
    byAction.set(key, entry);
  }

  const rows = [...byAction.values()].sort((a, b) => b.count - a.count);
  const totalCalls = rows.reduce((sum, row) => sum + row.count, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.tokensIn + row.tokensOut, 0);

  return (
    <AdminShell href="/admin/ai-kullanimi" pendingApplications={pending}>
      <AdminNote tone="info">
        <strong>Kelime birimi</strong> (token), yapay zekânın metni ölçme
        biçimi — kabaca bir kelime bir buçuk birime denk gelir. Fatura bu
        birimlerden hesaplanır, o yüzden en çok birim yakan işlem en pahalı
        işlemdir. Bu tabloda son {formatNumber(SAMPLE)} işlem var.
      </AdminNote>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-label">İncelenen işlem</span>
          <span className="adm-stat-value">{formatNumber(totalCalls)}</span>
          <span className="adm-stat-hint">En son yapılanlar</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">Toplam kelime birimi</span>
          <span className="adm-stat-value">{formatNumber(totalTokens)}</span>
          <span className="adm-stat-hint">Giren ve çıkan metin toplamı</span>
        </div>
      </div>

      <AdminCard
        title="İşleme göre kullanım"
        desc="En çok çalışan işlem en üstte."
        bodyless
      >
        {rows.length ? (
          <AdminTableFrame
            columns={["İşlem", "Model", "Kaç kez", "Giren birim", "Çıkan birim"]}
          >
            {rows.map((row) => (
              <tr key={`${row.action}-${row.model}`}>
                <td>
                  <div className="font-medium">{actionLabel(row.action)}</div>
                  <div className="text-xs text-[var(--adm-muted)]">{row.action}</div>
                </td>
                <td className="text-xs">{row.model}</td>
                <td className="adm-num">{formatNumber(row.count)}</td>
                <td className="adm-num">{formatNumber(row.tokensIn)}</td>
                <td className="adm-num">{formatNumber(row.tokensOut)}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz AI kullanımı yok">
            Öğrenciler yapay zekâyı kullanmaya başladığında burada dolar.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
