import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { CreditRuleRow } from "@/components/admin/admin-rows";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { actionLabel } from "@/lib/admin/labels";

export const metadata = { title: "Yönetim · Kredi bedelleri" };

export default async function AdminKrediBedelleriPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: rules }, pending] = await Promise.all([
    service
      .from("credit_rules")
      .select("action_code, credit_cost, model_tier, description, active")
      .order("action_code"),
    countPendingApplications(service),
  ]);

  const rows = rules ?? [];

  return (
    <AdminShell href="/admin/kredi-kurallari" pendingApplications={pending}>
      <AdminNote tone="warn">
        Bu sayıları <strong>düşürmek işletme maliyetini artırır</strong>:
        öğrenci aynı krediyle daha çok işlem yapar, yapay zekâ faturası büyür.
        Yükseltmek ise öğrencinin hakkını erken bitirir. Değişiklik anında
        geçerli olur ve <strong>İşlem geçmişi</strong>ne yazılır.
      </AdminNote>

      <AdminCard
        title="İşlem başına kredi"
        desc="Bir öğrenci şu işlemi yaptığında hesabından kaç kredi düşeceğini belirler."
        bodyless
      >
        {rows.length ? (
          <AdminTableFrame columns={["İşlem", "Model", "Şu anki bedel", "Değiştir"]}>
            {rows.map((rule) => (
              <CreditRuleRow
                key={rule.action_code}
                actionCode={rule.action_code}
                label={rule.description || actionLabel(rule.action_code)}
                creditCost={rule.credit_cost}
                modelTier={rule.model_tier}
              />
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Tanımlı kural yok">
            Kurallar veritabanına eklendiğinde burada listelenir.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
