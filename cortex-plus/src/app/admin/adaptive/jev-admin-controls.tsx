"use client";

import { useState, useTransition } from "react";
import {
  addSelfToAdaptivePilots,
  listJevModelsAction,
  testJevConnection,
  updateAdaptivePilotUser,
} from "@/app/admin/adaptive/actions";
import { settingKeyLabel, shortId } from "@/lib/admin/status-labels";

const PILOT_FLAGS = [
  "adaptive_learning_enabled",
  "jev_enabled",
  "adaptive_daily_replan_enabled",
  "adaptive_model_router_enabled",
] as const;

export function JevProbeButtons() {
  const [pending, start] = useTransition();
  const [probe, setProbe] = useState<string | null>(null);
  const [models, setModels] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="adm-btn"
          onClick={() =>
            start(async () => {
              const r = await testJevConnection();
              setProbe(
                r.ok
                  ? `Bağlantı tamam · ${r.latencyMs} ms · ${r.model} · girdi ${r.inputTokens} / çıktı ${r.outputTokens} jeton · ~$${r.estimatedCostUsd.toFixed(6)} · ${r.access} · ${r.summary}`
                  : `Hata: ${r.error}${r.latencyMs != null ? ` (${r.latencyMs} ms)` : ""}`,
              );
            })
          }
        >
          Jev bağlantısını dene
        </button>
        <button
          type="button"
          disabled={pending}
          className="adm-btn"
          onClick={() =>
            start(async () => {
              const r = await listJevModelsAction();
              setModels(
                r.ok
                  ? `${r.access}: ${r.names.join(", ") || "(boş)"}`
                  : `Hata: ${r.error}`,
              );
            })
          }
        >
          Modelleri listele
        </button>
      </div>
      <p className="text-xs text-[var(--adm-muted)]">
        Gerçek bir çağrı yapar (yaklaşık kuruşun binde biri). Anahtar
        gösterilmez.
      </p>
      {probe ? <p role="status" className="text-sm break-all">{probe}</p> : null}
      {models ? <p role="status" className="text-sm break-all">{models}</p> : null}
    </div>
  );
}

export function PilotManageForm({
  flagRows,
}: {
  flagRows: { key: string; pilotIds: string[] }[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [flagKey, setFlagKey] =
    useState<(typeof PILOT_FLAGS)[number]>("jev_enabled");

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-[var(--adm-muted)]">
          Özellik anahtarı
          <select
            className="adm-select"
            value={flagKey}
            onChange={(e) =>
              setFlagKey(e.target.value as (typeof PILOT_FLAGS)[number])
            }
          >
            {PILOT_FLAGS.map((k) => (
              <option key={k} value={k}>
                {settingKeyLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-[280px] flex-1 gap-1 text-xs text-[var(--adm-muted)]">
          Kullanıcı kimliği
          <input
            className="adm-input font-mono text-xs"
            value={userId}
            onChange={(e) => setUserId(e.target.value.trim())}
            placeholder="9d79106a-…"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          className="adm-btn adm-btn--primary"
          onClick={() =>
            start(async () => {
              const r = await updateAdaptivePilotUser({
                flagKey,
                userId,
                op: "add",
              });
              setMsg(
                r.ok
                  ? `Eklendi · ${settingKeyLabel(flagKey)}: ${r.pilotIds.length} pilot`
                  : r.error,
              );
            })
          }
        >
          Ekle
        </button>
        <button
          type="button"
          disabled={pending}
          className="adm-btn"
          onClick={() =>
            start(async () => {
              const r = await updateAdaptivePilotUser({
                flagKey,
                userId,
                op: "remove",
              });
              setMsg(
                r.ok
                  ? `Çıkarıldı · ${settingKeyLabel(flagKey)}: ${r.pilotIds.length} pilot`
                  : r.error,
              );
            })
          }
        >
          Çıkar
        </button>
        <button
          type="button"
          disabled={pending}
          className="adm-btn"
          onClick={() =>
            start(async () => {
              const r = await addSelfToAdaptivePilots();
              setMsg(r.ok ? "Hesabın bütün uyarlamalı öğrenme anahtarlarına pilot olarak eklendi." : r.error);
            })
          }
        >
          Beni ekle
        </button>
      </div>
      {msg ? <p role="status" className="text-xs">{msg}</p> : null}
      <ul className="space-y-1 text-xs text-[var(--adm-muted)]">
        {flagRows.map((f) => (
          <li key={f.key}>
            <strong className="text-[var(--adm-text)]">{settingKeyLabel(f.key)}</strong>:{" "}
            {f.pilotIds.length ? f.pilotIds.map(shortId).join(", ") : "(boş)"}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--adm-muted)]">
        Herkese açıp kapatmak bu formda yok: Özellik Anahtarları sayfası. Anahtar
        kaydı yoksa burada oluşturulmaz.
      </p>
    </div>
  );
}
