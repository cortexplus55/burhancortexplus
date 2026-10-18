/**
 * Exam-create wizard draft — survives remounts / tab discard.
 * localStorage key cortex:exam-wizard-draft:v1, TTL 24h.
 *
 * 18 Ekim 2026: aynı taslak sunucuda da durur (`exam_wizard_drafts`, kullanıcı
 * başına tek satır) — masaüstünde başlayan kurulum telefonda kaldığı yerden açılır.
 * Tarayıcı kopyası anında ve çevrimdışı çalışır; sunucu kopyası cihazlar arası
 * taşır. Açılışta hangisi yeniyse o alınır (`pickNewerDraft`).
 */

export const EXAM_WIZARD_DRAFT_KEY = "cortex:exam-wizard-draft:v1";
export const EXAM_WIZARD_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const EXAM_WIZARD_DRAFT_ENDPOINT = "/api/learning/exam-prep/draft";
/** Konu listesi ve dosya adlarıyla birkaç KB; bunun üstü taslak değil, hata. */
export const EXAM_WIZARD_DRAFT_MAX_BYTES = 256 * 1024;

export type WizardDraftStep =
  | "start"
  | "subject"
  | "date"
  | "target"
  | "material"
  | "language"
  | "building"
  | "shaping"
  | "topics"
  | "modality"
  | "familiarity"
  | "focus"
  | "plan";

export type ExamWizardDraft = {
  v: 1;
  step: WizardDraftStep;
  subject: string;
  examDate: string;
  target: number;
  language: "tr" | "en";
  modality: string;
  /** "Nasıl çalışmayı seversin?" çoklu seçimi (17 Ekim 2026). Eski taslakta yok. */
  modalities?: string[];
  /** "Bu derse ne kadar aşinasın?" (18 Ekim 2026). Eski taslakta yok. */
  familiarity?: string;
  equalFocus: boolean;
  focusTopics: string[];
  materials: {
    id: string;
    fileName: string;
    sizeBytes: number | null;
    pageCount: number | null;
  }[];
  failedMaterials: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
    error: string;
  }[];
  processing: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
    startedAt: string;
  } | null;
  topicsDraft?: {
    topics: string[];
    units?: { title: string; topicIndexes: number[] }[];
    topicPages?: number[][];
    topicFiles?: string[][];
    topicWarnings?: string[];
    meta?: {
      sourceCount: number;
      examHeavy: boolean;
      important: boolean;
      sections: string[];
      unitTitle?: string | null;
    }[];
  };
  title: string;
  orderEdited: boolean;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Map ephemeral build steps back to a resumable step. */
export function normalizeDraftStep(step: WizardDraftStep): WizardDraftStep {
  if (step === "building" || step === "shaping") return "language";
  return step;
}

/** Öğrenci bir şey seçti mi? Boş taslak ne saklanır ne "Taslaklar"da gösterilir. */
export function draftStarted(draft: ExamWizardDraft): boolean {
  return Boolean(draft.subject.trim() || draft.materials.length || draft.title?.trim());
}

/**
 * Ham JSON'dan (tarayıcı deposu ya da sunucu satırı) güvenli taslak. Bilinmeyen,
 * bozuk ya da süresi (24 saat) dolmuş veri `null`. Saf fonksiyon: sunucu da
 * gelen gövdeyi bununla süzer, alan alan aynı kurallar.
 */
export function parseExamWizardDraft(parsed: unknown, now = Date.now()): ExamWizardDraft | null {
  if (!isRecord(parsed) || parsed.v !== 1) return null;
  const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : "";
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts) || now - ts > EXAM_WIZARD_DRAFT_TTL_MS) return null;
  const step = normalizeDraftStep(
    (typeof parsed.step === "string" ? parsed.step : "start") as WizardDraftStep,
  );
  return {
    v: 1,
    step,
    subject: typeof parsed.subject === "string" ? parsed.subject : "",
    examDate: typeof parsed.examDate === "string" ? parsed.examDate : "",
    target: typeof parsed.target === "number" ? parsed.target : 75,
    language: parsed.language === "en" ? "en" : "tr",
    modality: typeof parsed.modality === "string" ? parsed.modality : "auto",
    modalities: Array.isArray(parsed.modalities)
      ? parsed.modalities.filter((m): m is string => typeof m === "string")
      : undefined,
    ...(typeof parsed.familiarity === "string" ? { familiarity: parsed.familiarity } : {}),
    equalFocus: parsed.equalFocus !== false,
    focusTopics: Array.isArray(parsed.focusTopics)
      ? parsed.focusTopics.filter((t): t is string => typeof t === "string")
      : [],
    materials: Array.isArray(parsed.materials)
      ? parsed.materials.flatMap((item) => {
          if (!isRecord(item) || typeof item.id !== "string") return [];
          return [
            {
              id: item.id,
              fileName: typeof item.fileName === "string" ? item.fileName : "Belge",
              sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
              pageCount: typeof item.pageCount === "number" ? item.pageCount : null,
            },
          ];
        })
      : [],
    failedMaterials: Array.isArray(parsed.failedMaterials)
      ? parsed.failedMaterials.flatMap((item) => {
          if (!isRecord(item) || typeof item.documentId !== "string") return [];
          return [
            {
              documentId: item.documentId,
              fileName: typeof item.fileName === "string" ? item.fileName : "Belge",
              sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : null,
              error: typeof item.error === "string" ? item.error : "İşlenemedi.",
            },
          ];
        })
      : [],
    processing: isRecord(parsed.processing) && typeof parsed.processing.documentId === "string"
      ? {
          documentId: parsed.processing.documentId,
          fileName:
            typeof parsed.processing.fileName === "string"
              ? parsed.processing.fileName
              : "Belge",
          sizeBytes:
            typeof parsed.processing.sizeBytes === "number"
              ? parsed.processing.sizeBytes
              : null,
          startedAt:
            typeof parsed.processing.startedAt === "string"
              ? parsed.processing.startedAt
              : new Date(now).toISOString(),
        }
      : null,
    topicsDraft: isRecord(parsed.topicsDraft)
      ? {
          topics: Array.isArray(parsed.topicsDraft.topics)
            ? parsed.topicsDraft.topics.filter((t): t is string => typeof t === "string")
            : [],
          units: Array.isArray(parsed.topicsDraft.units)
            ? (parsed.topicsDraft.units as ExamWizardDraft["topicsDraft"] extends
                | { units?: infer U }
                | undefined
                ? U
                : never)
            : undefined,
          topicPages: Array.isArray(parsed.topicsDraft.topicPages)
            ? (parsed.topicsDraft.topicPages as number[][])
            : undefined,
          topicFiles: Array.isArray(parsed.topicsDraft.topicFiles)
            ? (parsed.topicsDraft.topicFiles as string[][])
            : undefined,
          topicWarnings: Array.isArray(parsed.topicsDraft.topicWarnings)
            ? (parsed.topicsDraft.topicWarnings as string[])
            : undefined,
          meta: Array.isArray(parsed.topicsDraft.meta)
            ? (parsed.topicsDraft.meta as NonNullable<ExamWizardDraft["topicsDraft"]>["meta"])
            : undefined,
        }
      : undefined,
    title: typeof parsed.title === "string" ? parsed.title : "",
    orderEdited: parsed.orderEdited === true,
    updatedAt,
  };
}

/** İki kopyadan yenisi; eşitse ya da biri yoksa öteki. */
export function pickNewerDraft(
  local: ExamWizardDraft | null,
  remote: ExamWizardDraft | null,
): ExamWizardDraft | null {
  if (!local) return remote;
  if (!remote) return local;
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt) ? remote : local;
}

export function readExamWizardDraft(
  now = Date.now(),
): ExamWizardDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(EXAM_WIZARD_DRAFT_KEY);
    if (!raw) return null;
    const draft = parseExamWizardDraft(JSON.parse(raw) as unknown, now);
    if (!draft) clearExamWizardDraft();
    return draft;
  } catch {
    return null;
  }
}

export function writeExamWizardDraft(draft: ExamWizardDraft): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ExamWizardDraft = {
      ...draft,
      v: 1,
      step: normalizeDraftStep(draft.step),
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(EXAM_WIZARD_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

export function clearExamWizardDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EXAM_WIZARD_DRAFT_KEY);
  } catch {
    // ignore
  }
}

/*
  Sunucu kopyası. Üçü de sessiz: ağ ya da tablo yoksa tarayıcı kopyasıyla
  devam edilir, öğrenci hiçbir hata görmez — taslak bir kolaylık, bir kayıt değil.
*/

/** Sunucudaki taslak; yoksa, bozuksa ya da eskiyse `null`. */
export async function fetchExamWizardDraft(
  fetchImpl: typeof fetch = globalThis.fetch,
  now = Date.now(),
): Promise<ExamWizardDraft | null> {
  try {
    const res = await fetchImpl(EXAM_WIZARD_DRAFT_ENDPOINT, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { draft?: unknown } | null;
    return parseExamWizardDraft(body?.draft ?? null, now);
  } catch {
    return null;
  }
}

/** Taslağı sunucuya yazar; boş taslak sunucudaki satırı siler (uç öyle davranır). */
export async function pushExamWizardDraft(
  draft: ExamWizardDraft,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(EXAM_WIZARD_DRAFT_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: { ...draft, step: normalizeDraftStep(draft.step) } }),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Taslağı iki yerden de siler (kurulum bitti, sıfırlandı ya da "Taslağı sil"). */
export async function dropExamWizardDraft(fetchImpl: typeof fetch = globalThis.fetch): Promise<void> {
  clearExamWizardDraft();
  try {
    await fetchImpl(EXAM_WIZARD_DRAFT_ENDPOINT, { method: "DELETE", keepalive: true });
  } catch {
    // ignore
  }
}
