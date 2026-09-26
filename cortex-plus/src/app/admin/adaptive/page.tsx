import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate, formatNumber } from "@/lib/format";
import {
  ADAPTIVE_PILOT_METRICS,
  estimateTokenCostUsd,
  sessionAiCostReport,
} from "@/lib/adaptive/analytics";
import { decisionEngineStatus } from "@/lib/adaptive/jev/provider-mode";
import { env } from "@/lib/env";

export const metadata = { title: "Yönetim · Adaptive debug" };

const ADAPTIVE_USAGE_CODES = [
  "ADAPTIVE_JEV",
  "ADAPTIVE_DECISION",
  "ADAPTIVE_DECISION_ESCALATION",
  "ADAPTIVE_DECISION_FALLBACK",
  "ADAPTIVE_ACTION_CONTENT",
  "ADAPTIVE_ANSWER_EVAL",
] as const;

function DecisionEngineCard() {
  const status = decisionEngineStatus({
    mode: env.DECISION_PROVIDER,
    jevEnabledEnv: env.JEV_ENABLED,
    hasApiKey: Boolean(env.TYPESAFE_API_KEY?.trim()),
  });
  return (
    <AdminCard title="Decision engine">
      <p className="text-sm">Decision Engine: {status.decisionLabel}</p>
      <p className="mt-1 text-sm">Jev: {status.jevLabel}</p>
      <p className="mt-2 text-xs text-[var(--cs-muted)]">
        Provider mode {status.mode}. Bu ayrıntı öğrenci ekranında gösterilmez.
      </p>
    </AdminCard>
  );
}

const PILOT_FLAG_KEYS = [
  "adaptive_learning_enabled",
  "jev_enabled",
  "adaptive_daily_replan_enabled",
  "adaptive_model_router_enabled",
] as const;

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? null;
}

export default async function AdminAdaptivePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await requireAdmin();
  const { userId } = await searchParams;
  const service = createServiceClient();

  const { data: flagRows } = await service
    .from("feature_flags")
    .select("key, enabled, metadata")
    .in("key", [...PILOT_FLAG_KEYS]);

  const pilotIdSet = new Set<string>();
  for (const f of flagRows ?? []) {
    const meta = (f.metadata ?? {}) as { pilot_user_ids?: unknown };
    if (Array.isArray(meta.pilot_user_ids)) {
      for (const id of meta.pilot_user_ids) {
        if (typeof id === "string") pilotIdSet.add(id);
      }
    }
  }
  const pilotIds = [...pilotIdSet];

  if (!userId) {
    return (
      <AdminShell href="/admin/adaptive">
        <div className="space-y-6">
          <DecisionEngineCard />
          <AdminCard title="Adaptive pilot health">
            <p className="mb-3 text-sm text-[var(--cs-muted)]">
              Global flags kapalı kalmalı; yalnızca{" "}
              <code>metadata.pilot_user_ids</code> hedeflenir. Detay için{" "}
              <code>/admin/adaptive?userId=…</code>
            </p>
            <AdminTableFrame columns={["Flag", "Global", "Pilot sayısı"]}>
              <tbody>
                {(flagRows ?? []).map((f) => {
                  const meta = (f.metadata ?? {}) as {
                    pilot_user_ids?: string[];
                  };
                  const n = Array.isArray(meta.pilot_user_ids)
                    ? meta.pilot_user_ids.length
                    : 0;
                  return (
                    <tr key={f.key}>
                      <td>{f.key}</td>
                      <td>{f.enabled ? "ON" : "OFF"}</td>
                      <td>{n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTableFrame>
          </AdminCard>

          <AdminCard title="Pilot kullanıcılar">
            {pilotIds.length === 0 ? (
              <AdminEmpty title="Pilot yok" />
            ) : (
              <ul className="space-y-2 text-sm">
                {pilotIds.map((id) => (
                  <li key={id}>
                    <Link
                      className="underline"
                      href={`/admin/adaptive?userId=${id}`}
                    >
                      {id}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AdminCard>

          <AdminCard title="Pilot metrik tanımları">
            <ul className="space-y-2 text-xs text-[var(--cs-muted)]">
              {ADAPTIVE_PILOT_METRICS.map((m) => (
                <li key={m.key}>
                  <strong className="text-[var(--cs-text)]">{m.key}</strong>
                  {" — "}
                  {m.definition}
                </li>
              ))}
            </ul>
          </AdminCard>
        </div>
      </AdminShell>
    );
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(
    Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), 1),
  );

  const [
    { data: profile },
    { data: preps },
    { data: decisions },
    { data: sessions },
    { count: fallbackCount },
    { count: decisionCount },
    { data: usageRows },
    { data: masteryRows },
    { data: interventions },
    { data: errors },
  ] = await Promise.all([
    service
      .from("profiles")
      .select("id, full_name")
      .eq("id", userId)
      .maybeSingle(),
    service
      .from("exam_preps")
      .select("id, title, exam_date, adaptive_plan_version, adaptive_policy_version")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    service
      .from("adaptive_jev_decisions")
      .select(
        "id, provider, confidence, fallback_reason, latency_ms, created_at, exam_prep_id, normalized",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    service
      .from("adaptive_learning_sessions")
      .select("id, status, started_at, ended_at, completion_pct, exam_prep_id")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(10),
    service
      .from("adaptive_jev_decisions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(
        "provider.eq.openai_fallback,and(provider.eq.deterministic,fallback_reason.not.is.null)",
      ),
    service
      .from("adaptive_jev_decisions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    service
      .from("ai_usage_events")
      .select("action_code, model, tokens_in, tokens_out, created_at")
      .eq("user_id", userId)
      .in("action_code", [...ADAPTIVE_USAGE_CODES])
      .gte("created_at", monthStart.toISOString())
      .limit(2000),
    service
      .from("exam_prep_topic_mastery")
      .select("topic_key, mastery, mastery_confidence, status")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(12),
    service
      .from("adaptive_learning_events")
      .select("id, event_type, topic_key, created_at, payload")
      .eq("user_id", userId)
      .in("event_type", [
        "misconception_detected",
        "intervention_started",
        "mastery_updated",
      ])
      .order("created_at", { ascending: false })
      .limit(15),
    service
      .from("adaptive_jev_decisions")
      .select("id, fallback_reason, created_at, provider")
      .eq("user_id", userId)
      .not("fallback_reason", "is", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const fallbackRate =
    (decisionCount ?? 0) > 0
      ? Math.round(((fallbackCount ?? 0) / (decisionCount ?? 1)) * 100)
      : 0;

  let costDay = 0;
  let costMtd = 0;
  let miniCalls = 0;
  let fourOCalls = 0;
  let jevCalls = 0;
  for (const row of usageRows ?? []) {
    const cost = estimateTokenCostUsd(
      String(row.model ?? ""),
      Number(row.tokens_in ?? 0),
      Number(row.tokens_out ?? 0),
    );
    costMtd += cost;
    if (new Date(String(row.created_at)).getTime() >= dayStart.getTime()) {
      costDay += cost;
    }
    const model = String(row.model ?? "").toLowerCase();
    const code = String(row.action_code ?? "");
    if (code === "ADAPTIVE_JEV" || model === "jev") jevCalls += 1;
    else if (model.includes("gpt-4o") && !model.includes("mini")) fourOCalls += 1;
    else miniCalls += 1;
  }

  const openaiTotal = miniCalls + fourOCalls;
  const miniPct =
    openaiTotal > 0 ? Math.round((miniCalls / openaiTotal) * 100) : 0;
  const fourOPct =
    openaiTotal > 0 ? Math.round((fourOCalls / openaiTotal) * 100) : 0;

  const latencies = (decisions ?? [])
    .map((d) => Number(d.latency_ms ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  const completedSessions = (sessions ?? []).filter(
    (s) => s.status === "completed",
  ).length;
  const startedSessions = (sessions ?? []).length;
  const sessionCompletionRate =
    startedSessions > 0
      ? Math.round((completedSessions / startedSessions) * 100)
      : 0;
  const avgCostSession =
    completedSessions > 0 ? costMtd / completedSessions : costMtd;

  const activePrep = (preps ?? [])[0];
  const avgMastery =
    (masteryRows ?? []).length > 0
      ? (
          (masteryRows ?? []).reduce(
            (s, r) => s + Number(r.mastery ?? 0),
            0,
          ) / (masteryRows ?? []).length
        ).toFixed(2)
      : "—";

  const isPilot = pilotIdSet.has(userId);
  const sessionCosts = sessionAiCostReport(
    (sessions ?? []).map((s) => ({
      id: s.id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    })),
    (usageRows ?? []).map((row) => ({
      actionCode: String(row.action_code ?? ""),
      model: String(row.model ?? ""),
      tokensIn: Number(row.tokens_in ?? 0),
      tokensOut: Number(row.tokens_out ?? 0),
      createdAt: String(row.created_at),
    })),
  );

  return (
    <AdminShell href="/admin/adaptive">
      <div className="space-y-6">
        <DecisionEngineCard />
        <AdminCard
          title={profile?.full_name ?? userId}
          desc={`Pilot: ${isPilot ? "evet" : "hayır"} · Fallback %${fallbackRate}`}
        >
          <p className="text-sm">
            <Link href="/admin/adaptive" className="underline">
              Pilot listesi
            </Link>
            {" · "}
            <Link href="/admin/kullanicilar" className="underline">
              Kullanıcılar
            </Link>
            {" · "}
            Karar: {formatNumber(decisionCount ?? 0)} · Fallback:{" "}
            {formatNumber(fallbackCount ?? 0)}
          </p>
          {activePrep ? (
            <p className="mt-2 text-sm text-[var(--cs-muted)]">
              Aktif prep: {activePrep.title} · plan v
              {activePrep.adaptive_plan_version ?? 0} · sınav{" "}
              {activePrep.exam_date ?? "—"}
            </p>
          ) : null}
        </AdminCard>

        <AdminCard title="Maliyet ve model dağılımı">
          <AdminTableFrame columns={["Metrik", "Değer"]}>
            <tbody>
              <tr>
                <td>cost/student/day (USD tahmini)</td>
                <td>${costDay.toFixed(4)}</td>
              </tr>
              <tr>
                <td>cost/student/month-to-date</td>
                <td>${costMtd.toFixed(4)}</td>
              </tr>
              <tr>
                <td>GPT-4o-mini calls / %</td>
                <td>
                  {formatNumber(miniCalls)} · %{miniPct}
                </td>
              </tr>
              <tr>
                <td>GPT-4o calls / %</td>
                <td>
                  {formatNumber(fourOCalls)} · %{fourOPct}
                </td>
              </tr>
              <tr>
                <td>Jev calls</td>
                <td>{formatNumber(jevCalls)}</td>
              </tr>
              <tr>
                <td>Provider failure rate</td>
                <td>%{fallbackRate}</td>
              </tr>
              <tr>
                <td>avg AI cost/session</td>
                <td>${avgCostSession.toFixed(4)}</td>
              </tr>
              <tr>
                <td>session completion (son 10)</td>
                <td>%{sessionCompletionRate}</td>
              </tr>
              <tr>
                <td>next-action latency p50 / p95</td>
                <td>
                  {p50 != null ? `${p50}ms` : "—"} /{" "}
                  {p95 != null ? `${p95}ms` : "—"}
                </td>
              </tr>
              <tr>
                <td>mastery ort. (son konular)</td>
                <td>{avgMastery}</td>
              </tr>
            </tbody>
          </AdminTableFrame>
          <p className="mt-2 text-xs text-[var(--cs-muted)]">
            Öğrenci kredisi düşülmez; yalnızca iç telemetry. Kasıtlı OpenAI
            kararı failure sayılmaz.
          </p>
        </AdminCard>

        <AdminCard title="Oturum AI maliyeti">
          {sessionCosts.length === 0 ? (
            <AdminEmpty title="Oturum yok" />
          ) : (
            <AdminTableFrame
              columns={[
                "Oturum",
                "Mini karar token",
                "GPT-4o karar token",
                "İçerik token",
                "Karar USD",
                "İçerik USD",
                "Toplam USD",
              ]}
            >
              <tbody>
                {sessionCosts.map((row) => (
                  <tr key={row.sessionId}>
                    <td className="max-w-[120px] truncate">{row.sessionId}</td>
                    <td>{formatNumber(row.miniDecisionTokens)}</td>
                    <td>{formatNumber(row.escalationTokens)}</td>
                    <td>{formatNumber(row.contentTokens)}</td>
                    <td>${row.decisionCostUsd.toFixed(4)}</td>
                    <td>${row.contentCostUsd.toFixed(4)}</td>
                    <td>${row.totalUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Mastery özeti">
          {(masteryRows ?? []).length === 0 ? (
            <AdminEmpty title="Mastery yok" />
          ) : (
            <AdminTableFrame columns={["Konu", "Mastery", "Güven", "Durum"]}>
              <tbody>
                {(masteryRows ?? []).map((m) => (
                  <tr key={m.topic_key}>
                    <td className="max-w-[180px] truncate">{m.topic_key}</td>
                    <td>{Number(m.mastery ?? 0).toFixed(2)}</td>
                    <td>{Number(m.mastery_confidence ?? 0).toFixed(2)}</td>
                    <td>{m.status}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Sınav hazırlıkları">
          {(preps ?? []).length === 0 ? (
            <AdminEmpty title="Prep yok" />
          ) : (
            <AdminTableFrame columns={["Başlık", "Plan v", "Policy", "Tarih"]}>
              <tbody>
                {(preps ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>{p.adaptive_plan_version ?? 0}</td>
                    <td>{p.adaptive_policy_version ?? "—"}</td>
                    <td>{p.exam_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son oturumlar">
          {(sessions ?? []).length === 0 ? (
            <AdminEmpty title="Oturum yok" />
          ) : (
            <AdminTableFrame columns={["Durum", "%", "Başlangıç"]}>
              <tbody>
                {(sessions ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.status}</td>
                    <td>{Number(s.completion_pct ?? 0)}</td>
                    <td>{formatDate(s.started_at)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son müdahaleler">
          {(interventions ?? []).length === 0 ? (
            <AdminEmpty title="Müdahale yok" />
          ) : (
            <AdminTableFrame columns={["Olay", "Konu", "Zaman"]}>
              <tbody>
                {(interventions ?? []).map((e) => (
                  <tr key={e.id}>
                    <td>{e.event_type}</td>
                    <td className="max-w-[160px] truncate">
                      {e.topic_key ?? "—"}
                    </td>
                    <td>{formatDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son hatalar / fallback">
          {(errors ?? []).length === 0 ? (
            <AdminEmpty title="Fallback yok" />
          ) : (
            <AdminTableFrame columns={["Provider", "Neden", "Zaman"]}>
              <tbody>
                {(errors ?? []).map((e) => (
                  <tr key={e.id}>
                    <td>{e.provider}</td>
                    <td className="max-w-[200px] truncate">
                      {e.fallback_reason}
                    </td>
                    <td>{formatDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son kararlar">
          {(decisions ?? []).length === 0 ? (
            <AdminEmpty title="Karar yok" />
          ) : (
            <AdminTableFrame
              columns={["Provider", "Action", "Conf", "ms", "Fallback", "Zaman"]}
            >
              <tbody>
                {(decisions ?? []).map((d) => {
                  const norm = (d.normalized ?? {}) as { action?: string };
                  return (
                    <tr key={d.id}>
                      <td>{d.provider}</td>
                      <td>{norm.action ?? "—"}</td>
                      <td>
                        {typeof d.confidence === "number"
                          ? d.confidence.toFixed(2)
                          : "—"}
                      </td>
                      <td>{d.latency_ms ?? "—"}</td>
                      <td className="max-w-[140px] truncate">
                        {d.fallback_reason ?? "—"}
                      </td>
                      <td>{formatDate(d.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTableFrame>
          )}
        </AdminCard>
      </div>
    </AdminShell>
  );
}
