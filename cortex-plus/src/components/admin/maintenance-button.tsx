"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { runSystemMaintenance, type MaintenanceResult } from "@/app/admin/sistem/actions";
import { MAINTENANCE_CONFIRM } from "@/lib/admin/maintenance";

/*
  Elle bakım düğmesi (6 Kasım 2026, yalnız kurucu). İki adım: önce ne silineceği ve neyin kalacağı yazılır,
  "Evet, şimdi temizle" ile onaylanır. Sunucu da onay sözcüğünü ister; yönetici bu bileşeni hiç görmez.
*/

export function MaintenanceButton({ founder }: { founder: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MaintenanceResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!founder) {
    return (
      <p className="text-sm text-[var(--adm-muted)]">
        🔒 Bu bakımı yalnız kurucu çalıştırabilir. Günlük bakım turu aynı işi her sabah kendiliğinden yapıyor.
      </p>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {confirming ? (
        <div className="space-y-3 rounded-lg border border-[var(--adm-line)] p-3">
          <p>
            <strong>Emin misin?</strong> 3 saatten eski, yarım kalmış yüklemelerin dosyaları silinir; sınavı 45 günden
            uzun süre önce geçmiş ve 30 gündür açılmayan hazırlıkların belgelerinden yalnız arama vektörleri boşaltılır
            (en çok 20 belge). Belgeler, dersler ve öğrenci kayıtları yerinde kalır; öğrenci hazırlığı açınca vektörler
            yeniden kurulur. Bu işlem denetim kaydına yazılır.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="adm-btn adm-btn--primary"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const outcome = await runSystemMaintenance(MAINTENANCE_CONFIRM);
                  setResult(outcome);
                  setConfirming(false);
                  if (outcome.ok) toast.success("Bakım tamamlandı.");
                  else toast.error(outcome.error);
                });
              }}
            >
              {pending ? "Temizleniyor… (bir dakikayı bulabilir)" : "Evet, şimdi temizle"}
            </button>
            <button type="button" className="adm-btn" disabled={pending} onClick={() => setConfirming(false)}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="adm-btn" onClick={() => { setResult(null); setConfirming(true); }}>
          🧹 Yetim yüklemeleri ve soğuk vektörleri temizle
        </button>
      )}
      {result ? (
        <p className={result.ok ? "text-[var(--adm-muted)]" : "text-[var(--adm-warn)]"} role="status">
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
    </div>
  );
}
