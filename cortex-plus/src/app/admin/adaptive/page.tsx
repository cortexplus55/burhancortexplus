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
import { getJevCircuitSnapshot } from "@/lib/adaptive/jev/circuit-breaker";
import { resolveJevAccessSync, resolveJevModelName } from "@/lib/adaptive/jev/access";
import { env } from "@/lib/env";
import {
  JevProbeButtons,
  PilotManageForm,
} from "@/app/admin/adaptive/jev-admin-controls";

export const metadata = { title: "Yönetim · Adaptive debug" };

const ADAPTIVE_USAGE_CODES = [
  "ADAPTIVE_JEV",
  "ADAPTIVE_DECISION",
  "ADAPTIVE_DECISION_ESCALATION",
  "ADAPTIVE_DECISION_FALLBACK",
  "ADAPTIVE_ACTION_CONTENT",
  "ADAPTIVE_ANSWER_EVAL",
] as const;

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

async function safeQuery<T>(
  label: string,
  fn: () => PromiseLike<{ data: T; error: { message?: string } | null }>,
): Promise<{ data: T | null; missing: boolean; error?: string }> {
  try {
    const { data, error } = await fn();
    if (error) {
      const msg = error.message ?? String(error);
      const missing = /does not exist|relation|42P01|not find/i.test(msg);
      return { data: null, missing, error: msg };
    }
    return { data, missing: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const missing = /does not exist|relation|42P01|not find/i.test(msg);
    return { data: null, missing, error: `${label}: ${msg}` };
  }
}

function DecisionEngineCard() {
  const syncCred = resolveJevAccessSync({
    mode: env.JEV_ACCESS,
    typesafeKey: env.TYPESAFE_API_KEY,
    gatewayKey: env.AI_GATEWAY_API_KEY,
    baseUrlOverride: env.JEV_BASE_URL,
    modelOverride: env.JEV_MODEL,
    oidcAvailable: false,
  });
  const hasCred = syncCred.access !== null;
  const accessLabel = syncCred.access ?? "yok";
  const model = syncCred.access
    ? syncCred.model
    : resolveJevModelName({ access: "typesafe", configured: env.JEV_MODEL });
  const status = decisionEngineStatus({
    mode: env.DECISION_PROVIDER,
    jevEnabledEnv: env.JEV_ENABLED === true,
    hasJevCredential: hasCred,
    shadowMode: env.JEV_SHADOW_MODE === true,
    accessLabel,
  });
  const circuit = getJevCircuitSnapshot();

  return (
    <AdminCard title="Decision engine">
      <p className="text-sm">Decision Engine: {status.decisionLabel}</p>
      <p className="mt-1 text-sm">Jev: {status.jevLabel}</p>
      <AdminTableFrame columns={["Alan", "Değer"]}>
        <tbody>
          <tr>
            <td>Erişim yolu</td>
            <td>{accessLabel}</td>
          </tr>
          <tr>
            <td>Model</td>
            <td>{model}</td>
          </tr>
          <tr>
            <td>Kimlik var</td>
            <td>{hasCred ? "evet" : "hayır"}</td>
          </tr>
          <tr>
            <td>JEV_ENABLED</td>
            <td>{env.JEV_ENABLED === true ? "true" : "false"}</td>
          </tr>
          <tr>
            <td>JEV_SHADOW_MODE</td>
            <td>{env.JEV_SHADOW_MODE === true ? "true" : "false"}</td>
          </tr>
          <tr>
            <td>DECISION_PROVIDER</td>
            <td>{env.DECISION_PROVIDER}</td>
          </tr>
          <tr>
            <td>JEV_TIMEOUT_MS</td>
            <td>{env.JEV_TIMEOUT_MS}</td>
          </tr>
          <tr>
            <td>JEV_MIN_CONFIDENCE</td>
            <td>{env.JEV_MIN_CONFIDENCE}</td>
          </tr>
          <tr>
            <td>Circuit (instance)</td>
            <td>
              {circuit.open ? "OPEN" : "closed"}
              {circuit.lastError
                ? ` · son hata ${circuit.lastError}${circuit.lastErrorAt ? ` @ ${circuit.lastErrorAt}` : ""}`
                : ""}
            </td>
          </tr>
        </tbody>
      </AdminTableFrame>
      <p className="mt-2 text-xs text-[var(--cs-muted)]">
        Circuit durumu bu Vercel instance&apos;ına aittir; instance&apos;lar
        paylaşılmaz. Anahtar asla gösterilmez. Bu ayrıntı öğrenci ekranında
        yoktur.
      </p>
      <JevProbeButtons />
    </AdminCard>
  );
}

export default async function AdminAdaptivePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await requireAdmin();
  const { userId } = await searchParams;
  const service = createServiceClient();

  const flagsResult = await safeQuery("feature_flags", () =>
    service
      .from("feature_flags")
      .select("key, enabled, metadata")
      .in("key", [...PILOT_FLAG_KEYS]),
  );
  const flagRows = flagsResult.data ?? [];

  const pilotIdSet = new Set<string>();
  const flagPilotLists: { key: string; pilotIds: string[] }[] = [];
  for (const f of flagRows) {
    const meta = (f.metadata ?? {}) as { pilot_user_ids?: unknown };
    const ids = Array.isArray(meta.pilot_user_ids)
      ? meta.pilot_user_ids.filter((id): id is string => typeof id === "string")
      : [];
    flagPilotLists.push({ key: f.key, pilotIds: ids });
    for (const id of ids) pilotIdSet.add(id);
  }
  const pilotIds = [...pilotIdSet];

  if (!userId) {
    return (
      <AdminShell href="/admin/adaptive">
        <div className="space-y-6">
          <DecisionEngineCard />
          {flagsResult.missing ? (
            <AdminCard title="Adaptive pilot health">
              <AdminEmpty title="Tablo bulunamadı / veri yok" />
              <p className="mt-2 text-xs text-[var(--cs-muted)]">
                {flagsResult.error}
              </p>
            </AdminCard>
          ) : (
            <>
              <AdminCard title="Adaptive pilot health">
                <p className="mb-3 text-sm text-[var(--cs-muted)]">
                  Global flags kapalı kalmalı; yalnızca{" "}
                  <code>metadata.pilot_user_ids</code> hedeflenir. Detay için{" "}
                  <code>/admin/adaptive?userId=…</code>
                </p>
                <AdminTableFrame columns={["Flag", "Global", "Pilot sayısı"]}>
                  <tbody>
                    {flagRows.map((f) => {
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

              <AdminCard title="Pilot yönetimi">
                <PilotManageForm flagRows={flagPilotLists} />
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
            </>
          )}

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
    profileR,
    prepsR,
    decisionsR,
    sessionsR,
    usageR,
    masteryR,
    interventionsR,
    errorsR,
    jevDecisionsR,
  ] = await Promise.all([
    safeQuery("profiles", () =>
      service
        .from("profiles")
        .select("id, full_name")
        .eq("id", userId)
        .maybeSingle(),
    ),
    safeQuery("exam_preps", () =>
      service
        .from("exam_preps")
        .select(
          "id, title, exam_date, adaptive_plan_version, adaptive_policy_version",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ),
    safeQuery("adaptive_jev_decisions", () =>
      service
        .from("adaptive_jev_decisions")
        .select(
          "id, provider, confidence, fallback_reason, latency_ms, created_at, exam_prep_id, normalized, usage",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
    ),
    safeQuery("adaptive_learning_sessions", () =>
      service
        .from("adaptive_learning_sessions")
        .select("id, status, started_at, ended_at, completion_pct, exam_prep_id")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(10),
    ),
    safeQuery("ai_usage_events", () =>
      service
        .from("ai_usage_events")
        .select("action_code, model, tokens_in, tokens_out, created_at")
        .eq("user_id", userId)
        .in("action_code", [...ADAPTIVE_USAGE_CODES])
        .gte("created_at", monthStart.toISOString())
        .limit(2000),
    ),
    safeQuery("exam_prep_topic_mastery", () =>
      service
        .from("exam_prep_topic_mastery")
        .select("topic_key, mastery, mastery_confidence, status")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(12),
    ),
    safeQuery("adaptive_learning_events", () =>
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
    ),
    safeQuery("decision_errors", () =>
      service
        .from("adaptive_jev_decisions")
        .select("id, fallback_reason, created_at, provider")
        .eq("user_id", userId)
        .not("fallback_reason", "is", null)
        .order("created_at", { ascending: false })
        .limit(10),
    ),
    safeQuery("jev_only_decisions", () =>
      service
        .from("adaptive_jev_decisions")
        .select(
          "id, provider, latency_ms, usage, created_at, normalized, confidence, fallback_reason",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
    ),
  ]);

  const profile = profileR.data;
  const preps = prepsR.data ?? [];
  const decisions = decisionsR.data ?? [];
  const sessions = sessionsR.data ?? [];
  const usageRows = usageR.data ?? [];
  const masteryRows = masteryR.data ?? [];
  const interventions = interventionsR.data ?? [];
  const errors = errorsR.data ?? [];
  const allDecisions = jevDecisionsR.data ?? decisions;

  const tableMissing =
    decisionsR.missing || sessionsR.missing || usageR.missing;

  const decisionCount = allDecisions.length;
  const fallbackRateFromRows = allDecisions.filter(
    (d) =>
      d.provider === "openai_fallback" ||
      (d.provider === "deterministic" && d.fallback_reason),
  ).length;
  const fallbackRate =
    decisionCount > 0
      ? Math.round((fallbackRateFromRows / decisionCount) * 100)
      : 0;

  let costDay = 0;
  let costMtd = 0;
  let miniCalls = 0;
  let fourOCalls = 0;
  let jevCalls = 0;
  let jevCostDay = 0;
  let jevCostMtd = 0;
  for (const row of usageRows) {
    const model = String(row.model ?? "");
    const cost = estimateTokenCostUsd(
      model,
      Number(row.tokens_in ?? 0),
      Number(row.tokens_out ?? 0),
    );
    costMtd += cost;
    const isJev =
      String(row.action_code ?? "") === "ADAPTIVE_JEV" ||
      model.toLowerCase().startsWith("jev") ||
      model.toLowerCase().includes("typesafe");
    if (isJev) {
      jevCalls += 1;
      jevCostMtd += cost;
    }
    if (new Date(String(row.created_at)).getTime() >= dayStart.getTime()) {
      costDay += cost;
      if (isJev) jevCostDay += cost;
    }
    const m = model.toLowerCase();
    const code = String(row.action_code ?? "");
    if (code === "ADAPTIVE_JEV" || m.startsWith("jev") || m.includes("typesafe")) {
      /* already counted */
    } else if (m.includes("gpt-4o") && !m.includes("mini")) fourOCalls += 1;
    else miniCalls += 1;
  }

  const openaiTotal = miniCalls + fourOCalls;
  const miniPct =
    openaiTotal > 0 ? Math.round((miniCalls / openaiTotal) * 100) : 0;
  const fourOPct =
    openaiTotal > 0 ? Math.round((fourOCalls / openaiTotal) * 100) : 0;

  const jevLatencies = allDecisions
    .filter((d) => d.provider === "jev")
    .map((d) => Number(d.latency_ms ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const openaiLatencies = allDecisions
    .filter(
      (d) =>
        d.provider === "openai_decision" || d.provider === "openai_fallback",
    )
    .map((d) => Number(d.latency_ms ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const jevP50 = percentile(jevLatencies, 50);
  const jevP95 = percentile(jevLatencies, 95);
  const openaiP50 = percentile(openaiLatencies, 50);
  const openaiP95 = percentile(openaiLatencies, 95);

  let lowConfCount = 0;
  let jevFailCount = 0;
  const failReasons = new Map<string, number>();
  let shadowAgree = 0;
  let shadowTotal = 0;
  const shadowRows: {
    openai: string;
    jev: string;
    conf: number;
    ms: number;
    agree: boolean;
  }[] = [];

  for (const d of allDecisions) {
    const usage = (d.usage ?? {}) as Record<string, unknown>;
    if (usage.jev_low_confidence === true) lowConfCount += 1;
    if (d.provider === "openai_fallback" || d.provider === "deterministic") {
      if (d.fallback_reason) {
        jevFailCount += 1;
        const key = String(d.fallback_reason).slice(0, 80);
        failReasons.set(key, (failReasons.get(key) ?? 0) + 1);
      }
    }
    const shadow = usage.jev_shadow as
      | {
          action?: string;
          confidence?: number;
          agree?: boolean;
          latency_ms?: number;
        }
      | null
      | undefined;
    if (shadow && typeof shadow === "object") {
      shadowTotal += 1;
      if (shadow.agree) shadowAgree += 1;
      if (shadowRows.length < 20) {
        const norm = (d.normalized ?? {}) as { action?: string };
        shadowRows.push({
          openai: String(norm.action ?? "—"),
          jev: String(shadow.action ?? "—"),
          conf: Number(shadow.confidence ?? 0),
          ms: Number(shadow.latency_ms ?? 0),
          agree: Boolean(shadow.agree),
        });
      }
    }
  }

  const latencies = decisions
    .map((d) => Number(d.latency_ms ?? 0))
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);

  const completedSessions = sessions.filter(
    (s) => s.status === "completed",
  ).length;
  const startedSessions = sessions.length;
  const sessionCompletionRate =
    startedSessions > 0
      ? Math.round((completedSessions / startedSessions) * 100)
      : 0;
  const avgCostSession =
    completedSessions > 0 ? costMtd / completedSessions : costMtd;

  const activePrep = preps[0];
  const avgMastery =
    masteryRows.length > 0
      ? (
          masteryRows.reduce((s, r) => s + Number(r.mastery ?? 0), 0) /
          masteryRows.length
        ).toFixed(2)
      : "—";

  const isPilot = pilotIdSet.has(userId);
  const sessionCosts = sessionAiCostReport(
    sessions.map((s) => ({
      id: s.id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    })),
    usageRows.map((row) => ({
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
        {tableMissing ? (
          <AdminCard title="Uyarı">
            <AdminEmpty title="veri yok / tablo bulunamadı" />
            <p className="mt-2 text-xs text-[var(--cs-muted)]">
              {[decisionsR.error, sessionsR.error, usageR.error]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </AdminCard>
        ) : null}
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
            Karar: {formatNumber(decisionCount)} · Fallback:{" "}
            {formatNumber(fallbackRateFromRows)}
          </p>
          {activePrep ? (
            <p className="mt-2 text-sm text-[var(--cs-muted)]">
              Aktif prep: {activePrep.title} · plan v
              {activePrep.adaptive_plan_version ?? 0} · sınav{" "}
              {activePrep.exam_date ?? "—"}
            </p>
          ) : null}
        </AdminCard>

        <AdminCard title="Jev metrikleri">
          <AdminTableFrame columns={["Metrik", "Değer"]}>
            <tbody>
              <tr>
                <td>Jev karar sayısı (provider=jev)</td>
                <td>{formatNumber(jevLatencies.length)}</td>
              </tr>
              <tr>
                <td>Jev p50 / p95 gecikme</td>
                <td>
                  {jevP50 != null ? `${jevP50}ms` : "—"} /{" "}
                  {jevP95 != null ? `${jevP95}ms` : "—"}
                </td>
              </tr>
              <tr>
                <td>OpenAI karar p50 / p95</td>
                <td>
                  {openaiP50 != null ? `${openaiP50}ms` : "—"} /{" "}
                  {openaiP95 != null ? `${openaiP95}ms` : "—"}
                </td>
              </tr>
              <tr>
                <td>Jev maliyeti (gün / ay)</td>
                <td>
                  ${jevCostDay.toFixed(5)} / ${jevCostMtd.toFixed(5)}
                </td>
              </tr>
              <tr>
                <td>Düşük güven → OpenAI</td>
                <td>{formatNumber(lowConfCount)}</td>
              </tr>
              <tr>
                <td>Jev arıza (fallback satırları)</td>
                <td>{formatNumber(jevFailCount)}</td>
              </tr>
              <tr>
                <td>Gölge uyum oranı</td>
                <td>
                  {shadowTotal > 0
                    ? `%${Math.round((shadowAgree / shadowTotal) * 100)} (${shadowAgree}/${shadowTotal})`
                    : "—"}
                </td>
              </tr>
            </tbody>
          </AdminTableFrame>
          {failReasons.size > 0 ? (
            <ul className="mt-2 text-xs text-[var(--cs-muted)]">
              {[...failReasons.entries()].map(([k, n]) => (
                <li key={k}>
                  {k}: {n}
                </li>
              ))}
            </ul>
          ) : null}
        </AdminCard>

        <AdminCard title="Son gölge karşılaştırmaları">
          {shadowRows.length === 0 ? (
            <AdminEmpty title="Gölge kaydı yok" />
          ) : (
            <AdminTableFrame
              columns={["OpenAI", "Jev", "Conf", "ms", "Agree"]}
            >
              <tbody>
                {shadowRows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.openai}</td>
                    <td>{r.jev}</td>
                    <td>{r.conf.toFixed(2)}</td>
                    <td>{r.ms}</td>
                    <td>{r.agree ? "evet" : "hayır"}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTableFrame>
          )}
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
                <td>Jev calls (ADAPTIVE_JEV)</td>
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
            kararı ve düşük-güven geçişi failure sayılmaz.
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
          {masteryRows.length === 0 ? (
            <AdminEmpty title="Mastery yok" />
          ) : (
            <AdminTableFrame columns={["Konu", "Mastery", "Güven", "Durum"]}>
              <tbody>
                {masteryRows.map((m) => (
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
          {preps.length === 0 ? (
            <AdminEmpty title="Prep yok" />
          ) : (
            <AdminTableFrame columns={["Başlık", "Plan v", "Policy", "Tarih"]}>
              <tbody>
                {preps.map((p) => (
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
          {sessions.length === 0 ? (
            <AdminEmpty title="Oturum yok" />
          ) : (
            <AdminTableFrame columns={["Durum", "%", "Başlangıç"]}>
              <tbody>
                {sessions.map((s) => (
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
          {interventions.length === 0 ? (
            <AdminEmpty title="Müdahale yok" />
          ) : (
            <AdminTableFrame columns={["Olay", "Konu", "Zaman"]}>
              <tbody>
                {interventions.map((e) => (
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
          {errors.length === 0 ? (
            <AdminEmpty title="Fallback yok" />
          ) : (
            <AdminTableFrame columns={["Provider", "Neden", "Zaman"]}>
              <tbody>
                {errors.map((e) => (
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
          {decisions.length === 0 ? (
            <AdminEmpty title="Karar yok" />
          ) : (
            <AdminTableFrame
              columns={["Provider", "Action", "Conf", "ms", "Fallback", "Zaman"]}
            >
              <tbody>
                {decisions.slice(0, 20).map((d) => {
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
