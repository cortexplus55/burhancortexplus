import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminNote } from "@/components/admin/admin-ui";
import { AdminGateForm } from "@/components/admin/admin-gate-form";
import { requireAdminPage } from "@/lib/auth/admin-guard";

export const metadata = { title: "Yönetim · Kurucu Yönetim Girişi" };
export const dynamic = "force-dynamic";

/** "🔐 Kurucu Yönetim Girişi": panelin PIN kapısı. Yönetici olmayan 404 alır; kapı açıksa panele döner. */
export default async function AdminGatePage() {
  const { gate } = await requireAdminPage({ skipGate: true });
  if (gate.passed) redirect("/admin");

  return (
    <AdminShell href="/admin/kapi">
      {gate.state === "misconfigured" ? (
        <AdminNote tone="warn">
          {gate.reason === "secret_missing"
            ? "PIN tanımlı ama imza anahtarı (APP_SECRET) yok; kapı açılamıyor. Vercel'de APP_SECRET'i tanımla."
            : "ADMIN_GATE_PIN_HASH okunamadı; kapı açılamıyor. Değeri `node scripts/admin-pin-hash.mjs` ile yeniden üret."}
        </AdminNote>
      ) : (
        <AdminCard title="PIN'i gir" desc="Yanlış PIN 10 dakikada en çok 5 kez denenebilir; her deneme işlem kayıtlarına yazılır.">
          <AdminGateForm />
        </AdminCard>
      )}
    </AdminShell>
  );
}
