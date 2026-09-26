/*
  Kurucu kredi sayfasının hesabı. Kaynak `credit_ledger`: yönetici işlemleri
  orada `delta = 0` ve `metadata.admin_bypass = true` ile duruyor,
  `metadata.nominal_cost` normalde ne kadar tutacağını söylüyor.
*/

/**
 * Eylem kodunun öğrencinin tanıdığı adı.
 *
 * `STUDY_PLAN_GENERATE` ders, podcast senaryosu ve öğretmen analizinin ortak
 * kodu; defter bunları ayırmıyor. "Ders" demek podcast'i yanlış adlandırmak
 * olurdu, o yüzden adı kapsadığı kadar geniş.
 */
export const FOUNDER_ACTION_LABELS: Record<string, string> = {
  AI_CHAT_STANDARD: "Sohbet",
  AI_CHAT_ADVANCED: "Sohbet",
  AI_CHAT_PARENT: "Sohbet",
  IMAGE_SOLUTION: "Fotoğraftan çözüm",
  DOCUMENT_PAGE_PROCESS: "Belge işleme",
  QUIZ_GENERATE: "Quiz",
  FLASHCARD_GENERATE: "Kartlar",
  PRACTICE_EXAM_GENERATE: "Yazılı deneme",
  PRACTICE_EXAM_GRADE: "Deneme değerlendirme",
  STUDY_PLAN_GENERATE: "Ders ve içerik üretimi",
  EXPORT_PDF: "PDF dışa aktarma",
  AUDIO_SYNTHESIZE: "Seslendirme",
};

export function founderActionLabel(code: string | null | undefined): string {
  return (code && FOUNDER_ACTION_LABELS[code]) || "Diğer işlem";
}

export type FounderLedgerRow = {
  action_code: string | null;
  metadata: unknown;
  created_at?: string;
};

export function nominalCost(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const value = Number((metadata as { nominal_cost?: unknown }).nominal_cost);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export type FounderUsageSummary = {
  nominalTotal: number;
  count: number;
  /** En sık kullanılan işlemin adı; hiç işlem yoksa `null`. */
  topAction: string | null;
};

export function summarizeFounderUsage(rows: FounderLedgerRow[]): FounderUsageSummary {
  const counts = new Map<string, number>();
  let nominalTotal = 0;
  for (const row of rows) {
    nominalTotal += nominalCost(row.metadata);
    const label = founderActionLabel(row.action_code);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let topAction: string | null = null;
  let best = 0;
  for (const [label, count] of counts) {
    if (count > best) {
      best = count;
      topAction = label;
    }
  }
  return { nominalTotal, count: rows.length, topAction };
}

/** Türkiye UTC+3; 2016'dan beri yaz saati yok. */
const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;

/** İçinde bulunulan ayın ilk günü, Türkiye saatiyle 00:00 — ISO olarak. */
export function turkeyMonthStart(now = new Date()): string {
  const local = new Date(now.getTime() + TURKEY_OFFSET_MS);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - TURKEY_OFFSET_MS;
  return new Date(start).toISOString();
}

const TIME_PARTS = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "25 Eyl 23:14" — Türkiye saatiyle. */
export function formatFounderTime(iso: string): string {
  const parts = Object.fromEntries(
    TIME_PARTS.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  const month = String(parts.month ?? "").replace(/\.$/, "");
  return `${parts.day} ${month} ${parts.hour}:${parts.minute}`;
}
