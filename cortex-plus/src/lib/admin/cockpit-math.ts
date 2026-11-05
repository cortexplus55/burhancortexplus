/*
  Kurucu kokpitinin saf hesapları (5 Kasım 2026): zaman pencereleri, sayımlar, dönüşüm ve kâr marjı,
  karantina / bildirim satırlarının okunması. Veritabanı yok; `cockpit.ts` yükler, burası hesaplar.
  Türkiye saati sabit UTC+3 (2016'dan beri yaz saati yok).
*/

export type WindowKey = "today" | "week" | "month";
export const WINDOW_KEYS: readonly WindowKey[] = ["today", "week", "month"];
export const WINDOW_LABEL: Record<WindowKey, string> = { today: "Bugün", week: "Son 7 gün", month: "Son 30 gün" };

export type WindowCounts = Record<WindowKey, number>;
/** Her pencerenin başlangıcı (ISO). */
export type Windows = Record<WindowKey, string>;

const ISTANBUL_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Türkiye gününün başlangıcı (UTC anı). */
export function istanbulDayStartIso(now: Date): string {
  const shifted = new Date(now.getTime() + ISTANBUL_OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - ISTANBUL_OFFSET_MS;
  return new Date(start).toISOString();
}

export function cockpitWindows(now: Date): Windows {
  const today = Date.parse(istanbulDayStartIso(now));
  return {
    today: new Date(today).toISOString(),
    week: new Date(today - 6 * DAY_MS).toISOString(),
    month: new Date(today - 29 * DAY_MS).toISOString(),
  };
}

export function emptyCounts(): WindowCounts {
  return { today: 0, week: 0, month: 0 };
}

function inWindow(stamp: string | null | undefined, since: string): boolean {
  if (!stamp) return false;
  const at = Date.parse(stamp);
  return Number.isFinite(at) && at >= Date.parse(since);
}

/** Zaman damgalarının pencere başına sayısı. */
export function countByWindow(stamps: readonly (string | null | undefined)[], windows: Windows): WindowCounts {
  const out = emptyCounts();
  for (const key of WINDOW_KEYS) out[key] = stamps.filter((stamp) => inWindow(stamp, windows[key])).length;
  return out;
}

/** Pencere başına farklı kimlik sayısı (ör. etkinlik açan öğrenci). */
export function distinctByWindow(rows: readonly { id: string; at: string | null | undefined }[], windows: Windows): WindowCounts {
  const out = emptyCounts();
  for (const key of WINDOW_KEYS) out[key] = new Set(rows.filter((row) => inWindow(row.at, windows[key])).map((row) => row.id)).size;
  return out;
}

export function sumByWindow(rows: readonly { at: string | null | undefined; value: number }[], windows: Windows): WindowCounts {
  const out = emptyCounts();
  for (const key of WINDOW_KEYS) out[key] = rows.filter((row) => inWindow(row.at, windows[key])).reduce((sum, row) => sum + row.value, 0);
  return out;
}

/* ───────────── Dönüşüm ───────────── */

export type PaymentRow = {
  user_id: string;
  beneficiary_user_id: string | null;
  plan_id: string | null;
  amount_try: number | null;
  status: string;
  created_at: string;
};
export type PlanRow = { id: string; slug: string; name: string };

export type PlanConversion = { slug: string; label: string; counts: WindowCounts };
export type ConversionStats = {
  /** Başarılı ödeme adedi. */
  paid: WindowCounts;
  /** Kuruş. */
  revenueKurus: WindowCounts;
  /** İlk kez ödeyen öğrenci: ücretsizden ücretliye geçiş. */
  firstTime: WindowCounts;
  /** Velime ödeme linki ile yapılan ödeme (ödeyen ≠ yararlanan). */
  parentLink: WindowCounts;
  byPlan: PlanConversion[];
};

const PLAN_LABEL: Record<string, string> = {
  "plus-aylik": "Plus (aylık)",
  "plus-haftalik": "Sınav Haftası (haftalık Plus)",
};

export function planLabel(plan: Pick<PlanRow, "slug" | "name"> | null | undefined): string {
  if (!plan) return "Plan bilinmiyor";
  return PLAN_LABEL[plan.slug] ?? plan.name ?? plan.slug;
}

export function conversionStats(
  payments: readonly PaymentRow[],
  plans: readonly PlanRow[],
  earlierPayers: ReadonlySet<string>,
  windows: Windows,
): ConversionStats {
  const paidRows = payments.filter((row) => row.status === "paid");
  const paid = countByWindow(paidRows.map((row) => row.created_at), windows);
  const revenueKurus = sumByWindow(paidRows.map((row) => ({ at: row.created_at, value: row.amount_try ?? 0 })), windows);
  const parentLink = countByWindow(
    paidRows.filter((row) => row.beneficiary_user_id && row.beneficiary_user_id !== row.user_id).map((row) => row.created_at),
    windows,
  );
  // İlk ödeme: pencere içindeki en erken başarılı ödeme; pencereden önce ödemişse ilk değildir.
  const earliest = new Map<string, string>();
  for (const row of paidRows) {
    const payer = row.beneficiary_user_id ?? row.user_id;
    if (earlierPayers.has(payer)) continue;
    const seen = earliest.get(payer);
    if (!seen || Date.parse(row.created_at) < Date.parse(seen)) earliest.set(payer, row.created_at);
  }
  const firstTime = countByWindow([...earliest.values()], windows);
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const groups = new Map<string, PlanConversion>();
  for (const row of paidRows) {
    const plan = row.plan_id ? planById.get(row.plan_id) : null;
    const slug = plan?.slug ?? "bilinmiyor";
    const group = groups.get(slug) ?? { slug, label: planLabel(plan), counts: emptyCounts() };
    for (const key of WINDOW_KEYS) if (inWindow(row.created_at, windows[key])) group.counts[key] += 1;
    groups.set(slug, group);
  }
  const byPlan = [...groups.values()].sort((a, b) => b.counts.month - a.counts.month || a.label.localeCompare(b.label, "tr"));
  return { paid, revenueKurus, firstTime, parentLink, byPlan };
}

/* ───────────── Birim ekonomisi ───────────── */

/** Net kâr marjı (%): (gelir − gider) / gelir. Gelir yoksa ya da kur girilmemişse null. */
export function marginPct(revenueKurus: number, spendUsd: number | null, usdTry: number | null): number | null {
  if (spendUsd == null || usdTry == null || !(usdTry > 0)) return null;
  const revenueTry = revenueKurus / 100;
  if (!(revenueTry > 0)) return null;
  return Math.round(((revenueTry - spendUsd * usdTry) / revenueTry) * 100);
}

/** Dolar giderinin TL karşılığı (kuruş); kur yoksa null. */
export function spendKurus(spendUsd: number | null, usdTry: number | null): number | null {
  if (spendUsd == null || usdTry == null || !(usdTry > 0)) return null;
  return Math.round(spendUsd * usdTry * 100);
}

export const FX_FLAG = "admin_usd_try";
export const FX_MIN = 1;
export const FX_MAX = 1000;

/** `feature_flags.metadata.rate` → kur; aralık dışı ya da yoksa null. */
export function readUsdTry(metadata: unknown): number | null {
  const rate = (metadata as { rate?: unknown } | null)?.rate;
  const value = typeof rate === "number" ? rate : typeof rate === "string" ? Number(rate) : NaN;
  return Number.isFinite(value) && value >= FX_MIN && value <= FX_MAX ? value : null;
}

/**
 * Kur girilmemişse marj bu kurla hesaplanır (5 Kasım 2026, ürün sahibi: "kokpit ilk açılışta marjı boş
 * göstermesin"); kurucu kutudan değiştirir, kaynak ekranda "varsayılan" diye yazılır.
 */
export const DEFAULT_USD_TRY = 36;

export type UsdTry = { rate: number; source: "flag" | "default" };

/** Kokpitin kullandığı kur: bayrak varsa o, yoksa varsayılan. */
export function effectiveUsdTry(metadata: unknown): UsdTry {
  const flagged = readUsdTry(metadata);
  return flagged == null ? { rate: DEFAULT_USD_TRY, source: "default" } : { rate: flagged, source: "flag" };
}

/* ───────────── Kalite ve karantina ───────────── */

export const QUARANTINE_RULE_LABEL: Record<string, string> = {
  reports: "en az iki öğrenci bildirdi",
  low_correct_rate: "doğru oranı %20'nin altında",
  strong_same_wrong: "güçlü öğrenciler aynı yanlış şıkkı seçti",
};

export type QuarantineRow = {
  id: string;
  programId: string;
  unitId: string;
  outcomeId: string;
  outcomeCode: string | null;
  difficulty: string;
  stem: string;
  choices: string[];
  answer: number;
  explanation: string;
  rule: string | null;
  ruleLabel: string;
  quarantinedAt: string | null;
  responses: number;
  correctRate: number | null;
  reports: number;
  createdAt: string;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function int(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function quarantineRow(raw: Record<string, unknown>): QuarantineRow | null {
  const id = str(raw.id);
  const stem = str(raw.stem);
  if (!id || !stem) return null;
  const qa = (raw.qa ?? {}) as Record<string, unknown>;
  const quarantine = (qa.quarantine ?? {}) as Record<string, unknown>;
  const rule = typeof quarantine.rule === "string" ? quarantine.rule : null;
  // Elle karantina (`by: manual_review`) `rule` yerine serbest `reason` yazar; ikisi de gerekçedir.
  const reason = typeof quarantine.reason === "string" && quarantine.reason.trim() ? quarantine.reason.trim() : null;
  const by = typeof quarantine.by === "string" && quarantine.by.trim() ? quarantine.by.trim() : null;
  const ruleLabel = rule ? (QUARANTINE_RULE_LABEL[rule] ?? rule) : (reason ?? "karantina gerekçesi kayıtlı değil");
  const rate = quarantine.correct_rate;
  const choices = Array.isArray(raw.choices) ? raw.choices.map((choice) => str(choice)) : [];
  return {
    id,
    programId: str(raw.program_id),
    unitId: str(raw.unit_id),
    outcomeId: str(raw.outcome_id),
    outcomeCode: typeof qa.outcome_code === "string" ? qa.outcome_code : null,
    difficulty: str(raw.difficulty),
    stem,
    choices,
    answer: int(raw.answer),
    explanation: str(raw.explanation),
    rule,
    ruleLabel: by === "manual_review" ? `${ruleLabel} (elle inceleme)` : ruleLabel,
    quarantinedAt: typeof quarantine.at === "string" ? quarantine.at : null,
    responses: int(quarantine.responses),
    correctRate: typeof rate === "number" ? rate : typeof rate === "string" && rate.trim() ? Number(rate) : null,
    reports: int(quarantine.reports),
    createdAt: str(raw.created_at),
  };
}

/**
 * Eski sürüm sorusu (5 Kasım 2026): içeriği emekli edilmiş (kayıt defteri değişti, ders yeniden kuyruğa alındı)
 * `stale` soru. Karantina değildir: öğrenci yanlışından değil, ünitenin yeniden yazılmasından kalmıştır; ünitenin
 * yeni sürümü doğrulanıp havuza girince bunlar arşivlenir (`rejected` · `superseded`), satır silinmez.
 */
export type SupersededRow = {
  id: string;
  programId: string;
  unitId: string;
  outcomeCode: string | null;
  difficulty: string;
  stem: string;
  contentId: string | null;
  /** Sorunun bağlı olduğu `topic_content` satırının durumu; `verified` ise soru arşivlenmez (anormal, sayılır). */
  contentStatus: string | null;
  createdAt: string;
};

export function supersededRow(raw: Record<string, unknown>, contentStatus: string | null): SupersededRow | null {
  const id = str(raw.id);
  const stem = str(raw.stem);
  if (!id || !stem) return null;
  const qa = (raw.qa ?? {}) as Record<string, unknown>;
  if (qa.quarantine != null) return null; // karantina kuyruğunun işi
  return {
    id,
    programId: str(raw.program_id),
    unitId: str(raw.unit_id),
    outcomeCode: typeof qa.outcome_code === "string" ? qa.outcome_code : null,
    difficulty: str(raw.difficulty),
    stem,
    contentId: typeof raw.content_id === "string" ? raw.content_id : null,
    contentStatus,
    createdAt: str(raw.created_at),
  };
}

/** Arşivlenebilir: içeriği artık yayında değil. Yayındaki içeriğin `stale` sorusu beklenmez; dokunulmaz, sayılır. */
export function supersededArchivable(row: SupersededRow): boolean {
  return row.contentStatus !== "verified";
}

export type SupersededGroup = { unitId: string; programId: string; count: number; archivable: number; contentStatus: string | null };

/** Ünite başına özet (ekranda tablo satırı). */
export function supersededGroups(rows: SupersededRow[]): SupersededGroup[] {
  const groups = new Map<string, SupersededGroup>();
  for (const row of rows) {
    const group = groups.get(row.unitId) ?? { unitId: row.unitId, programId: row.programId, count: 0, archivable: 0, contentStatus: row.contentStatus };
    group.count += 1;
    if (supersededArchivable(row)) group.archivable += 1;
    groups.set(row.unitId, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.unitId.localeCompare(b.unitId));
}

export const REPORT_VERDICT_LABEL: Record<string, string> = {
  pending: "Bekliyor",
  valid: "Hatalı bulundu",
  invalid: "Soru doğru",
  error: "Denetim düştü",
};

export type ReportRow = {
  id: string;
  source: "node" | "mock";
  targetId: string;
  questionRef: string;
  prepId: string | null;
  reason: string;
  note: string | null;
  verdict: string;
  verdictLabel: string;
  issueKind: string | null;
  explanation: string | null;
  rewarded: boolean;
  createdAt: string;
  resolvedAt: string | null;
  question: { text: string; options: string[]; correct: string[] } | null;
};

export function reportRow(raw: Record<string, unknown>): ReportRow | null {
  const id = str(raw.id);
  const source = raw.source === "mock" ? "mock" : raw.source === "node" ? "node" : null;
  if (!id || !source) return null;
  const snapshot = (raw.question_snapshot ?? null) as Record<string, unknown> | null;
  const text = snapshot ? str(snapshot.text) : "";
  const verdict = str(raw.verdict) || "pending";
  return {
    id,
    source,
    targetId: str(raw.target_id),
    questionRef: str(raw.question_ref),
    prepId: typeof raw.prep_id === "string" ? raw.prep_id : null,
    reason: str(raw.reason),
    note: typeof raw.note === "string" && raw.note.trim() ? raw.note : null,
    verdict,
    verdictLabel: REPORT_VERDICT_LABEL[verdict] ?? verdict,
    issueKind: typeof raw.issue_kind === "string" ? raw.issue_kind : null,
    explanation: typeof raw.explanation === "string" && raw.explanation.trim() ? raw.explanation : null,
    rewarded: raw.rewarded === true,
    createdAt: str(raw.created_at),
    resolvedAt: typeof raw.resolved_at === "string" ? raw.resolved_at : null,
    question: text
      ? {
          text,
          options: Array.isArray(snapshot?.options) ? snapshot.options.map((option) => str(option)) : [],
          correct: Array.isArray(snapshot?.correct) ? snapshot.correct.map((option) => str(option)) : [],
        }
      : null,
  };
}
