"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { activatePromptVersion, toggleFeatureFlag, updateCreditRule } from "@/app/admin/actions";

/**
 * Bu satırlar eskiden shadcn bileşenleriyle çiziliyordu; yeni yönetim
 * kabuğunda o stiller yüklü değil ve kutular biçimsiz kalıyordu. Aynı işi
 * panelin kendi sınıflarıyla yapıyorlar.
 */

/** Bir işlemin kaç kredi yaktığı. */
export function CreditRuleRow({
  actionCode,
  label,
  creditCost,
  modelTier,
}: {
  actionCode: string;
  label: string;
  creditCost: number;
  modelTier: string;
}) {
  const [value, setValue] = useState(String(creditCost));
  const [pending, startTransition] = useTransition();

  const next = Number(value);
  const valid = Number.isInteger(next) && next >= 0 && next !== creditCost;

  return (
    <tr>
      <td>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-[var(--adm-muted)]">{actionCode}</div>
      </td>
      <td>
        <span className="adm-badge adm-badge--mute">
          {modelTier === "advanced" ? "Gelişmiş model" : "Standart model"}
        </span>
      </td>
      <td className="adm-num">{creditCost} kredi</td>
      <td>
        <div className="flex justify-end gap-2">
          <input
            type="number"
            min={0}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={`${label} için yeni kredi bedeli`}
            className="adm-input w-24"
          />
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={pending || !valid}
            onClick={() =>
              startTransition(async () => {
                const result = await updateCreditRule({ actionCode, creditCost: next });
                if (result.ok) toast.success("Kredi bedeli güncellendi.");
                else toast.error(result.error ?? "Güncellenemedi.");
              })
            }
          >
            {pending ? "…" : "Kaydet"}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Bir özelliği herkese açıp kapatan anahtar. */
export function FeatureFlagRow({
  flagKey,
  label,
  description,
  enabled,
}: {
  flagKey: string;
  label: string;
  description: string;
  enabled: boolean;
}) {
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  return (
    <tr>
      <td>
        <div className="font-medium">{label}</div>
        <div className="whitespace-normal text-xs text-[var(--adm-muted)]">{description}</div>
      </td>
      <td>
        <span className={`adm-badge adm-badge--${checked ? "ok" : "mute"}`}>
          {checked ? "Açık" : "Kapalı"}
        </span>
      </td>
      <td className="text-xs text-[var(--adm-muted)]">{flagKey}</td>
      <td>
        <div className="flex justify-end">
          <button
            type="button"
            className="adm-btn"
            disabled={pending}
            onClick={() => {
              const nextValue = !checked;
              setChecked(nextValue);
              startTransition(async () => {
                const result = await toggleFeatureFlag(flagKey, nextValue);
                if (result.ok) {
                  toast.success(nextValue ? "Özellik açıldı." : "Özellik kapatıldı.");
                } else {
                  // Sunucu reddettiyse anahtarı eski hâline döndür; ekranda
                  // açık görünüp aslında kapalı kalması en kötüsü.
                  setChecked(!nextValue);
                  toast.error("Değiştirilemedi.");
                }
              });
            }}
          >
            {pending ? "…" : checked ? "Kapat" : "Aç"}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Bir AI talimatı sürümünü yayına alma. */
export function PromptActivate({ promptId, active }: { promptId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();

  if (active) return <span className="adm-badge adm-badge--ok">Yayında</span>;

  return (
    <button
      type="button"
      className="adm-btn"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await activatePromptVersion(promptId);
          if (result.ok) toast.success(result.message ?? "Yayına alındı.");
          else toast.error(result.error ?? "Yapılamadı.");
        })
      }
    >
      {pending ? "…" : "Yayına al"}
    </button>
  );
}
