import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminTableFrame } from "@/components/admin/admin-ui";
import {
  decisionProviderLabel,
  learningActionLabel,
  learningEventLabel,
  settingKeyLabel,
  shortId,
  statusLabel,
  topicStatusLabel,
} from "@/lib/admin/status-labels";
import { requireAdminPage } from "@/lib/auth/admin-guard";
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

export const metadata = { title: "Yönetim · Uyarlamalı Öğrenme Hata Ayıklama" };

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
  const labels = engineLabels(status, accessLabel);
  const yesNo = (value: boolean) => (value ? "Evet" : "Hayır");

  return (
    <AdminCard title="Karar motoru" desc="Uyarlamalı öğrenmede bir sonraki adımı kimin seçtiği. Ortam değişkeni adları ikincil satırda.">
      <p className="text-sm">Karar veren: {labels.decision}</p>
      <p className="mt-1 text-sm">Jev: {labels.jev}</p>
      <AdminTableFrame columns={["Alan", "Değer"]}>
        <EnvRow label="Erişim yolu" value={accessLabel} />
        <EnvRow label="Model" value={model} />
        <EnvRow label="Erişim anahtarı tanımlı" value={yesNo(hasCred)} />
        <EnvRow label="Jev açık" name="JEV_ENABLED" value={yesNo(env.JEV_ENABLED === true)} />
        <EnvRow label="Gölge mod" name="JEV_SHADOW_MODE" value={yesNo(env.JEV_SHADOW_MODE === true)} />
        <EnvRow label="Karar sağlayıcı ayarı" name="DECISION_PROVIDER" value={env.DECISION_PROVIDER} />
        <EnvRow label="Zaman aşımı (ms)" name="JEV_TIMEOUT_MS" value={String(env.JEV_TIMEOUT_MS)} />
        <EnvRow label="En düşük güven" name="JEV_MIN_CONFIDENCE" value={String(env.JEV_MIN_CONFIDENCE)} />
        <EnvRow
          label="Devre kesici (bu sunucu örneği)"
          value={`${circuit.open ? "Devrede (Jev çağrılmıyor)" : "Kapalı (normal)"}${
            circuit.lastError ? ` · son hata ${circuit.lastError}${circuit.lastErrorAt ? ` · ${circuit.lastErrorAt}` : ""}` : ""
          }`}
        />
      </AdminTableFrame>
      <p className="mt-2 text-xs text-[var(--adm-muted)]">
        Devre kesici durumu bu sunucu örneğine aittir; örnekler birbirini
        görmez. Anahtar asla gösterilmez. Bu ayrıntı öğrenci ekranında yoktur.
      </p>
      <JevProbeButtons />
    </AdminCard>
  );
}

function EnvRow({ label, name, value }: { label: string; name?: string; value: string }) {
  return (
    <tr>
      <td>
        {label}
        {name ? <span className="block text-xs text-[var(--adm-muted)]">{name}</span> : null}
      </td>
      <td>{value}</td>
    </tr>
  );
}

/** `decisionEngineStatus` İngilizce etiket döndürüyor (testleri o metne bağlı); ekranda Türkçesi. */
function engineLabels(
  status: { openaiPrimary: boolean; decisionLabel: string },
  access: string,
): { decision: string; jev: string } {
  if (!status.openaiPrimary) return { decision: "Asıl karar Jev'de", jev: `Hazır (erişim: ${access})` };
  if (status.decisionLabel.includes("shadow")) {
    return { decision: "Asıl karar OpenAI'de (Jev gölgede)", jev: `Gölge modda (erişim: ${access})` };
  }
  return { decision: "Geçici sağlayıcı: OpenAI", jev: "Erişim bekleniyor ya da kapalı" };
}

/** Pilot ölçülerinin Türkçe adı ve tanımı; kod (`key`) ikincil. */
const METRIC_TR: Record<string, { name: string; definition: string }> = {
  SESSION_COMPLETION_RATE: { name: "Oturum tamamlama oranı", definition: "Tamamlanan uyarlamalı oturum / başlayan uyarlamalı oturum (aynı öğrenci ve hazırlık)." },
  DAILY_PLAN_COMPLETION_RATE: { name: "Günlük plan tamamlama oranı", definition: "Bitti işaretlenen plan maddesi / o güne planlanan madde." },
  INTERVENTION_SUCCESS_RATE: { name: "Müdahale başarısı", definition: "Müdahaleden sonra birkaç denemede kendi başına başaran öğrenci / başlayan müdahale." },
  MASTERY_GAIN_PER_SESSION: { name: "Oturum başına hâkimiyet artışı", definition: "Oturum başı ile bitişi arasında kaydedilen konu hâkimiyeti değişimlerinin toplamı." },
  REPEATED_MISCONCEPTION_RATE: { name: "Tekrarlayan yanılgı oranı", definition: "Aynı hatası en az iki kez görülen ya da yanılgı yakalanan kanıt / değerlendirilen cevap." },
  REVIEW_SUCCESS_RATE: { name: "Tekrar başarısı", definition: "Doğru tamamlanan planlı tekrar / denenen günü gelmiş tekrar." },
  JEV_FALLBACK_RATE: { name: "Jev yedeğe düşme oranı", definition: "Gerçek sağlayıcı arızası (OpenAI yedeği ya da gerekçeli kural tabanlı karar) / bütün kararlar. Bilerek verilen OpenAI kararı yedek sayılmaz." },
  GPT4O_ESCALATION_RATE: { name: "Büyük modele yükseltme oranı", definition: "Uyarlamalı kullanımda büyük model (mini olmayan) çağrısı / bütün uyarlamalı OpenAI çağrısı." },
  AI_COST_PER_SESSION: { name: "Oturum başına yapay zekâ maliyeti", definition: "Tamamlanan oturumlara düşen uyarlamalı kullanımın tahmini dolar karşılığı." },
  NEXT_ACTION_LATENCY: { name: "Sonraki adım gecikmesi", definition: "Karar yolunda gecikmenin ortanca ve %95'lik değeri." },
};

export default async function AdminAdaptivePage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  await requireAdminPage();
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
            <AdminCard title="Pilot durumu">
              <AdminEmpty title="Kayıt bulunamadı ya da veri yok" />
              <p className="mt-2 text-xs text-[var(--adm-muted)]">
                {flagsResult.error}
              </p>
            </AdminCard>
          ) : (
            <>
              <AdminCard
                title="Pilot durumu"
                desc="Herkese açık anahtarlar kapalı kalmalı; özellik yalnız pilot listesindeki öğrencilere açılır. Bir öğrencinin ayrıntısı için aşağıdaki listeden adına tıkla."
                bodyless
              >
                <AdminTableFrame columns={["Özellik anahtarı", "Herkese açık", "Pilot sayısı"]}>
                  {flagRows.map((f) => {
                    const meta = (f.metadata ?? {}) as {
                      pilot_user_ids?: string[];
                    };
                    const n = Array.isArray(meta.pilot_user_ids)
                      ? meta.pilot_user_ids.length
                      : 0;
                    return (
                      <tr key={f.key}>
                        <td>
                          {settingKeyLabel(f.key)}
                          <span className="block text-xs text-[var(--adm-muted)]">{f.key}</span>
                        </td>
                        <td>
                          <AdminBadge tone={f.enabled ? "warn" : "mute"}>{f.enabled ? "Açık" : "Kapalı"}</AdminBadge>
                        </td>
                        <td className="adm-num">{n}</td>
                      </tr>
                    );
                  })}
                </AdminTableFrame>
              </AdminCard>

              <AdminCard title="Pilot yönetimi" desc="Bir öğrenciyi pilot listesine ekle ya da çıkar. Yalnız kurucu değiştirir.">
                <PilotManageForm flagRows={flagPilotLists} />
              </AdminCard>

              <AdminCard title="Pilot öğrenciler">
                {pilotIds.length === 0 ? (
                  <AdminEmpty title="Pilot öğrenci yok" />
                ) : (
                  <ul className="space-y-2 text-sm">
                    {pilotIds.map((id) => (
                      <li key={id}>
                        <Link
                          className="underline"
                          href={`/admin/adaptive?userId=${id}`}
                        >
                          Öğrenci {shortId(id)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminCard>
            </>
          )}

          <AdminCard title="Pilot ölçülerinin tanımları">
            <ul className="space-y-2 text-xs text-[var(--adm-muted)]">
              {ADAPTIVE_PILOT_METRICS.map((m) => (
                <li key={m.key}>
                  <strong className="text-[var(--adm-text)]">{METRIC_TR[m.key]?.name ?? m.key}</strong>
                  {" — "}
                  {METRIC_TR[m.key]?.definition ?? m.definition}
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

  const ms = (value: number | null) => (value != null ? `${value} ms` : "—");

  return (
    <AdminShell href="/admin/adaptive">
      <div className="space-y-6">
        <DecisionEngineCard />
        {tableMissing ? (
          <AdminCard title="Uyarı">
            <AdminEmpty title="Veri yok ya da kayıt tablosu bulunamadı" />
            <p className="mt-2 text-xs text-[var(--adm-muted)]">
              {[decisionsR.error, sessionsR.error, usageR.error]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </AdminCard>
        ) : null}
        <AdminCard
          title={profile?.full_name ?? `Öğrenci ${shortId(userId)}`}
          desc={`Pilot: ${isPilot ? "evet" : "hayır"} · Yedeğe düşme %${fallbackRate}`}
        >
          <p className="text-sm">
            <Link href="/admin/adaptive" className="underline">
              Pilot listesi
            </Link>
            {" · "}
            <Link href={`/admin/kullanicilar/${userId}`} className="underline">
              Kullanıcı Yönetimi
            </Link>
            {" · "}
            Karar: {formatNumber(decisionCount)} · Yedeğe düşen:{" "}
            {formatNumber(fallbackRateFromRows)}
          </p>
          {activePrep ? (
            <p className="mt-2 text-sm text-[var(--adm-muted)]">
              Etkin hazırlık: {activePrep.title} · plan sürümü{" "}
              {activePrep.adaptive_plan_version ?? 0} · sınav{" "}
              {activePrep.exam_date ?? "—"}
            </p>
          ) : null}
        </AdminCard>

        <AdminCard title="Jev ölçüleri" bodyless>
          <AdminTableFrame columns={["Ölçü", "Değer"]}>
            <tr>
              <td>Jev&apos;in verdiği karar</td>
              <td className="adm-num">{formatNumber(jevLatencies.length)}</td>
            </tr>
            <tr>
              <td>Jev gecikmesi (ortanca / %95)</td>
              <td className="adm-num">
                {ms(jevP50)} / {ms(jevP95)}
              </td>
            </tr>
            <tr>
              <td>OpenAI karar gecikmesi (ortanca / %95)</td>
              <td className="adm-num">
                {ms(openaiP50)} / {ms(openaiP95)}
              </td>
            </tr>
            <tr>
              <td>Jev maliyeti (bugün / bu ay)</td>
              <td className="adm-num">
                ${jevCostDay.toFixed(5)} / ${jevCostMtd.toFixed(5)}
              </td>
            </tr>
            <tr>
              <td>Düşük güven yüzünden OpenAI&apos;ye geçiş</td>
              <td className="adm-num">{formatNumber(lowConfCount)}</td>
            </tr>
            <tr>
              <td>Jev arızası (yedeğe düşen karar)</td>
              <td className="adm-num">{formatNumber(jevFailCount)}</td>
            </tr>
            <tr>
              <td>Gölge kararla uyum</td>
              <td className="adm-num">
                {shadowTotal > 0
                  ? `%${Math.round((shadowAgree / shadowTotal) * 100)} (${shadowAgree}/${shadowTotal})`
                  : "—"}
              </td>
            </tr>
          </AdminTableFrame>
          {failReasons.size > 0 ? (
            <ul className="px-5 py-3 text-xs text-[var(--adm-muted)]">
              {[...failReasons.entries()].map(([k, n]) => (
                <li key={k}>
                  {k}: {n}
                </li>
              ))}
            </ul>
          ) : null}
        </AdminCard>

        <AdminCard title="Son gölge karşılaştırmaları" bodyless={shadowRows.length > 0}>
          {shadowRows.length === 0 ? (
            <AdminEmpty title="Gölge kaydı yok" />
          ) : (
            <AdminTableFrame columns={["OpenAI'nin seçimi", "Jev'in seçimi", "Güven", "Süre (ms)", "Uyuştu mu"]}>
              {shadowRows.map((r, i) => (
                <tr key={i}>
                  <td>{learningActionLabel(r.openai)}</td>
                  <td>{learningActionLabel(r.jev)}</td>
                  <td className="adm-num">{r.conf.toFixed(2)}</td>
                  <td className="adm-num">{r.ms}</td>
                  <td>{r.agree ? "Evet" : "Hayır"}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Maliyet ve model dağılımı" bodyless>
          <AdminTableFrame columns={["Ölçü", "Değer"]}>
            <tr>
              <td>Öğrenci başına bugünkü maliyet (tahmini, $)</td>
              <td className="adm-num">${costDay.toFixed(4)}</td>
            </tr>
            <tr>
              <td>Öğrenci başına bu ayki maliyet (tahmini, $)</td>
              <td className="adm-num">${costMtd.toFixed(4)}</td>
            </tr>
            <tr>
              <td>Küçük model (GPT-4o-mini) çağrısı / payı</td>
              <td className="adm-num">
                {formatNumber(miniCalls)} · %{miniPct}
              </td>
            </tr>
            <tr>
              <td>Büyük model (GPT-4o) çağrısı / payı</td>
              <td className="adm-num">
                {formatNumber(fourOCalls)} · %{fourOPct}
              </td>
            </tr>
            <tr>
              <td>Jev çağrısı</td>
              <td className="adm-num">{formatNumber(jevCalls)}</td>
            </tr>
            <tr>
              <td>Sağlayıcı arıza oranı</td>
              <td className="adm-num">%{fallbackRate}</td>
            </tr>
            <tr>
              <td>Oturum başına ortalama yapay zekâ maliyeti ($)</td>
              <td className="adm-num">${avgCostSession.toFixed(4)}</td>
            </tr>
            <tr>
              <td>Oturum tamamlama (son 10)</td>
              <td className="adm-num">%{sessionCompletionRate}</td>
            </tr>
            <tr>
              <td>Sonraki adım gecikmesi (ortanca / %95)</td>
              <td className="adm-num">
                {ms(p50)} / {ms(p95)}
              </td>
            </tr>
            <tr>
              <td>Ortalama hâkimiyet (son konular)</td>
              <td className="adm-num">{avgMastery}</td>
            </tr>
          </AdminTableFrame>
          <p className="px-5 py-3 text-xs text-[var(--adm-muted)]">
            Öğrenci kredisi düşülmez; yalnız iç ölçüm. Bilerek verilen OpenAI
            kararı ve düşük güven geçişi arıza sayılmaz.
          </p>
        </AdminCard>

        <AdminCard title="Oturum başına yapay zekâ maliyeti" bodyless={sessionCosts.length > 0}>
          {sessionCosts.length === 0 ? (
            <AdminEmpty title="Oturum yok" />
          ) : (
            <AdminTableFrame
              columns={[
                "Oturum",
                "Küçük model karar jetonu",
                "Büyük model karar jetonu",
                "İçerik jetonu",
                "Karar ($)",
                "İçerik ($)",
                "Toplam ($)",
              ]}
            >
              {sessionCosts.map((row) => (
                <tr key={row.sessionId}>
                  <td className="text-xs text-[var(--adm-muted)]">{shortId(row.sessionId)}</td>
                  <td className="adm-num">{formatNumber(row.miniDecisionTokens)}</td>
                  <td className="adm-num">{formatNumber(row.escalationTokens)}</td>
                  <td className="adm-num">{formatNumber(row.contentTokens)}</td>
                  <td className="adm-num">${row.decisionCostUsd.toFixed(4)}</td>
                  <td className="adm-num">${row.contentCostUsd.toFixed(4)}</td>
                  <td className="adm-num">${row.totalUsd.toFixed(4)}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Hâkimiyet özeti" bodyless={masteryRows.length > 0}>
          {masteryRows.length === 0 ? (
            <AdminEmpty title="Hâkimiyet kaydı yok" />
          ) : (
            <AdminTableFrame columns={["Konu", "Hâkimiyet", "Güven", "Durum"]}>
              {masteryRows.map((m) => (
                <tr key={m.topic_key}>
                  <td className="max-w-[180px] truncate">{m.topic_key}</td>
                  <td className="adm-num">{Number(m.mastery ?? 0).toFixed(2)}</td>
                  <td className="adm-num">{Number(m.mastery_confidence ?? 0).toFixed(2)}</td>
                  <td>{topicStatusLabel(m.status)}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Sınav hazırlıkları" bodyless={preps.length > 0}>
          {preps.length === 0 ? (
            <AdminEmpty title="Hazırlık yok" />
          ) : (
            <AdminTableFrame columns={["Başlık", "Plan sürümü", "Karar kuralı sürümü", "Sınav tarihi"]}>
              {preps.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td className="adm-num">{p.adaptive_plan_version ?? 0}</td>
                  <td>{p.adaptive_policy_version ?? "—"}</td>
                  <td>{p.exam_date ?? "—"}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son oturumlar" bodyless={sessions.length > 0}>
          {sessions.length === 0 ? (
            <AdminEmpty title="Oturum yok" />
          ) : (
            <AdminTableFrame columns={["Durum", "Tamamlanma (%)", "Başlangıç"]}>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{statusLabel(s.status)}</td>
                  <td className="adm-num">{Number(s.completion_pct ?? 0)}</td>
                  <td>{formatDate(s.started_at)}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son müdahaleler" bodyless={interventions.length > 0}>
          {interventions.length === 0 ? (
            <AdminEmpty title="Müdahale yok" />
          ) : (
            <AdminTableFrame columns={["Olay", "Konu", "Zaman"]}>
              {interventions.map((e) => (
                <tr key={e.id}>
                  <td>{learningEventLabel(e.event_type)}</td>
                  <td className="max-w-[160px] truncate">
                    {e.topic_key ?? "—"}
                  </td>
                  <td>{formatDate(e.created_at)}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son hatalar ve yedeğe düşmeler" bodyless={errors.length > 0}>
          {errors.length === 0 ? (
            <AdminEmpty title="Yedeğe düşen karar yok" />
          ) : (
            <AdminTableFrame columns={["Sağlayıcı", "Neden", "Zaman"]}>
              {errors.map((e) => (
                <tr key={e.id}>
                  <td>{decisionProviderLabel(e.provider)}</td>
                  <td className="max-w-[200px] truncate">
                    {e.fallback_reason}
                  </td>
                  <td>{formatDate(e.created_at)}</td>
                </tr>
              ))}
            </AdminTableFrame>
          )}
        </AdminCard>

        <AdminCard title="Son kararlar" bodyless={decisions.length > 0}>
          {decisions.length === 0 ? (
            <AdminEmpty title="Karar yok" />
          ) : (
            <AdminTableFrame
              columns={["Sağlayıcı", "Seçilen adım", "Güven", "Süre (ms)", "Yedek nedeni", "Zaman"]}
            >
              {decisions.slice(0, 20).map((d) => {
                const norm = (d.normalized ?? {}) as { action?: string };
                return (
                  <tr key={d.id}>
                    <td>{decisionProviderLabel(d.provider)}</td>
                    <td>{learningActionLabel(norm.action)}</td>
                    <td className="adm-num">
                      {typeof d.confidence === "number"
                        ? d.confidence.toFixed(2)
                        : "—"}
                    </td>
                    <td className="adm-num">{d.latency_ms ?? "—"}</td>
                    <td className="max-w-[140px] truncate">
                      {d.fallback_reason ?? "—"}
                    </td>
                    <td>{formatDate(d.created_at)}</td>
                  </tr>
                );
              })}
            </AdminTableFrame>
          )}
        </AdminCard>
      </div>
    </AdminShell>
  );
}
