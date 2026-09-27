"use client";

import { useState, useTransition } from "react";
import {
  addSelfToAdaptivePilots,
  listJevModelsAction,
  testJevConnection,
  updateAdaptivePilotUser,
} from "@/app/admin/adaptive/actions";

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
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() =>
            start(async () => {
              const r = await testJevConnection();
              setProbe(
                r.ok
                  ? `OK · ${r.latencyMs}ms · ${r.model} · in=${r.inputTokens} out=${r.outputTokens} · ~$${r.estimatedCostUsd.toFixed(6)} · ${r.access} · ${r.summary}`
                  : `Hata: ${r.error}${r.latencyMs != null ? ` (${r.latencyMs}ms)` : ""}`,
              );
            })
          }
        >
          Jev bağlantısını test et
        </button>
        <button
          type="button"
          disabled={pending}
          className="rounded border px-3 py-1.5 text-sm"
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
      <p className="text-xs text-[var(--cs-muted)]">
        Gerçek API çağrısı yapar (yaklaşık kuruşun binde biri). Anahtar
        gösterilmez.
      </p>
      {probe ? <p className="text-sm break-all">{probe}</p> : null}
      {models ? <p className="text-sm break-all">{models}</p> : null}
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
        <label className="block">
          <span className="text-xs text-[var(--cs-muted)]">Bayrak</span>
          <select
            className="mt-1 block rounded border bg-transparent px-2 py-1"
            value={flagKey}
            onChange={(e) =>
              setFlagKey(e.target.value as (typeof PILOT_FLAGS)[number])
            }
          >
            {PILOT_FLAGS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[280px] flex-1">
          <span className="text-xs text-[var(--cs-muted)]">Kullanıcı UUID</span>
          <input
            className="mt-1 w-full rounded border bg-transparent px-2 py-1 font-mono text-xs"
            value={userId}
            onChange={(e) => setUserId(e.target.value.trim())}
            placeholder="9d79106a-…"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          className="rounded border px-3 py-1.5"
          onClick={() =>
            start(async () => {
              const r = await updateAdaptivePilotUser({
                flagKey,
                userId,
                op: "add",
              });
              setMsg(
                r.ok
                  ? `Eklendi · ${flagKey} pilot=${r.pilotIds.length}`
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
          className="rounded border px-3 py-1.5"
          onClick={() =>
            start(async () => {
              const r = await updateAdaptivePilotUser({
                flagKey,
                userId,
                op: "remove",
              });
              setMsg(
                r.ok
                  ? `Çıkarıldı · ${flagKey} pilot=${r.pilotIds.length}`
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
          className="rounded border px-3 py-1.5"
          onClick={() =>
            start(async () => {
              const r = await addSelfToAdaptivePilots();
              setMsg(r.ok ? "Oturumdaki admin tüm adaptive bayraklara eklendi." : r.error);
            })
          }
        >
          Beni ekle
        </button>
      </div>
      {msg ? <p className="text-xs">{msg}</p> : null}
      <ul className="space-y-1 text-xs text-[var(--cs-muted)]">
        {flagRows.map((f) => (
          <li key={f.key}>
            <strong className="text-[var(--cs-text)]">{f.key}</strong>:{" "}
            {f.pilotIds.length ? f.pilotIds.join(", ") : "(boş)"}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--cs-muted)]">
        Global açma/kapama bu formda yok —{" "}
        <code>/admin/feature-flags</code>. Satır yoksa oluşturulmaz.
      </p>
    </div>
  );
}
