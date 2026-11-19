"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PARENT_PAY_COPY, parentPaidLine } from "@/lib/payments/parent-pay-copy";

/** Yoklama: geri çağrı genelde 5-15 sn; 2 dk sonra sakin "onay biraz uzadı" satırı (ödeme asla "başarısız" denmez). */
const POLL_MS = 2000;
const WINDOW_MS = 120_000;

/**
 * Velinin onay ekranı (Faz 5 §2). PayTR dönüş sayfası iFrame'in içinde açılırsa üst pencereye taşınır. Bağlantının
 * ödemesi geri çağrıyla "paid" olunca "Ödemeniz onaylandı" der; aynı anda öğrenciye bildirim düşer.
 */
export function ParentPayConfirm({ token, studentFirst, planName }: { token: string | null; studentFirst: string; planName: string }) {
  const [state, setState] = useState<"waiting" | "paid" | "slow">(token ? "waiting" : "paid");

  useEffect(() => {
    try {
      if (window.top && window.top !== window.self) window.top.location.href = window.location.href;
    } catch {
      /* farklı köken: üst pencereye erişilemez, ekran yine çalışır */
    }
  }, []);

  useEffect(() => {
    if (!token || state !== "waiting") return;
    const started = Date.now();
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/billing/parent-link/status?token=${encodeURIComponent(token as string)}`, { cache: "no-store" });
        const body = (await res.json().catch(() => ({}))) as { paid?: boolean };
        if (body.paid) {
          setState("paid");
          return;
        }
      } catch {
        /* sıradaki yoklama dener */
      }
      if (Date.now() - started > WINDOW_MS) {
        setState("slow");
        return;
      }
      setTimeout(() => void tick(), POLL_MS);
    }
    void tick();
    return () => {
      stopped = true;
    };
  }, [token, state]);

  if (state === "paid") {
    return (
      <section className="vo-card vo-notice vo-notice--ok" role="status" data-testid="veli-paid">
        <CheckCircle2 className="vo-confirm-icon" aria-hidden />
        <h1 className="vo-notice-title">{PARENT_PAY_COPY.paidTitle}</h1>
        <p className="vo-notice-body">{parentPaidLine(studentFirst, planName)}</p>
        <p className="vo-muted">{PARENT_PAY_COPY.assurance}.</p>
      </section>
    );
  }

  return (
    <section className="vo-card vo-notice" role="status" data-testid="veli-waiting">
      <Loader2 className="vo-confirm-icon vo-spin" aria-hidden />
      <h1 className="vo-notice-title">{state === "slow" ? "Banka onayı biraz uzadı" : "Ödemeniz doğrulanıyor…"}</h1>
      <p className="vo-notice-body">
        {state === "slow"
          ? "Bankanızın onayı birkaç dakika sürebilir. Onay gelince paket öğrencinin hesabına kendiliğinden tanımlanır ve makbuz e-postanıza gelir; bu sayfayı kapatabilirsiniz."
          : "Bankanızdan gelen onayı bekliyoruz; bu birkaç saniye sürer."}
      </p>
    </section>
  );
}
