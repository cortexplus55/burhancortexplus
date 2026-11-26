"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/*
  Kurucu Kokpiti düğmeleri (Faz 13). Her biri kendi ucunu çağırır, sonucu bildirimle söyler ve sayfayı yeniler.
  Uç yanıtı Türkçe `message` taşır; ağ düşerse sabit bir cümle.
*/

async function call(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; message?: string; body?: Record<string, unknown> }> {
  try {
    const response = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return {
      ok: response.ok,
      message: typeof body.message === "string" ? body.message : undefined,
      body,
    };
  } catch {
    return { ok: false, message: "Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip yeniden dene." };
  }
}

export function CheckNowButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="adm-btn adm-btn--primary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await call("/api/admin/kokpit/check", {
            method: "POST",
          });
          if (!result.ok) {
            toast.error(result.message ?? "Kontrol çalıştırılamadı.");
            return;
          }
          toast.success("Kontrol tamamlandı.");
          router.refresh();
        })
      }
    >
      {pending ? "Kontrol ediliyor…" : "Şimdi kontrol et"}
    </button>
  );
}

export function BreakerResetButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="adm-btn adm-btn--danger"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await call("/api/admin/kokpit/breaker-reset", {
            method: "POST",
          });
          if (!result.ok) {
            toast.error(result.message ?? "Koruma modu kaldırılamadı.");
            return;
          }
          toast.success(
            "Koruma modu kaldırıldı: canlı sesli öğretmen ve video üretimi açıldı.",
          );
          router.refresh();
        })
      }
    >
      {pending ? "Kaldırılıyor…" : "Korumayı kaldır"}
    </button>
  );
}

export function TestAlertButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="adm-btn"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await call("/api/admin/kokpit/test-alert", {
            method: "POST",
          });
          if (!result.ok) {
            toast.error(result.message ?? "Deneme e-postası gönderilemedi.");
            return;
          }
          toast.success(
            `Deneme e-postası gönderildi: ${String(result.body?.to ?? "alarm adresi")}.`,
          );
          router.refresh();
        })
      }
    >
      {pending ? "Gönderiliyor…" : "Test alarm e-postası gönder"}
    </button>
  );
}

export function MonthPicker({
  month,
  options,
}: {
  month: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
      Ay
      <select
        className="adm-select"
        value={month}
        aria-label="Ay seç"
        onChange={(event) =>
          router.push(
            `/admin/kokpit?ay=${encodeURIComponent(event.target.value)}`,
          )
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export { call as kokpitCall };
