/**
 * Yazılı denemenin taslağı: tarayıcıda ve sunucuda (31 Ekim 2026, ürün sahibinin kararı).
 *
 * Neden: deneme çözerken geri tuşu ya da yenileme öğrenciyi 1. soruya atıyordu. Cevaplar sunucuya
 * 800 ms bekleyip gidiyordu (o arada yenilenirse son cevap yoktu), kaldığı soru hiç kaydedilmiyordu
 * (`cursorIndex` gönderiliyor, yazılmıyordu). Artık her seçim, yazı, işaret ve soru değişimi hemen
 * `localStorage`'a yazılır (`cp:exam-draft:<examId>`); sunucuya da aynı kısa beklemeyle gider. Süre
 * sunucunun bitiş anından (`practice_exams.deadline_at`, notlandırmanın da okuduğu); taslak yalnız
 * açılış isteği düşerse saati sürdürmek için bitiş anını tutar.
 *
 * Sunucu taslağı göçsüz: kaldığı soru ve son kayıt anı açık denemenin `answers` jsonb'sinde
 * `__meta` anahtarında durur (düğüm kayıtlarındaki `__meta` gibi). Açık denemenin cevaplarını yalnız
 * oturum rotası okur; notlandırma cevapları istekten alır ve yeni satır yazar.
 *
 * Açılışta hangisi yeniyse o alınır (`exam-wizard-draft.ts` `pickNewerDraft` gibi); kazananın
 * değerleri üstün, öbürünün yalnız kazananda olmayan cevapları eklenir — iki sekmede çözülen
 * soru kaybolmasın. Saf modül: depo dışarıdan verilir; her okuma/yazma try/catch.
 */

export const EXAM_DRAFT_PREFIX = "cp:exam-draft:";
/** Bir haftadan eski taslak okunmaz ve temizlenir. */
export const EXAM_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Tarayıcı saati ile sunucu saati arasında kabul edilen kayma (`attempt-draft.ts` ile aynı). */
export const EXAM_DRAFT_SKEW_MS = 2 * 60 * 1000;
/** Sunucu taslağında kaldığı soru ve kayıt anı bu anahtarda. */
export const EXAM_DRAFT_META_KEY = "__meta";

export type ExamAnswerValue = string | string[];
export type ExamAnswers = Record<string, ExamAnswerValue>;

export type ExamDraft = {
  v: 1;
  answers: ExamAnswers;
  flaggedIds: string[];
  /** Ekrandaki soru (0'dan). */
  cursor: number;
  /** Sunucunun bitiş anı; süresizde ya da henüz bilinmiyorsa null. */
  deadlineAt: string | null;
  /** Son yerel düzenleme (tarayıcı saati, ms). */
  updatedAt: number;
  /** Sunucunun onayladığı son düzenleme (tarayıcı saati, ms); hiç onay yoksa null. */
  savedAt: number | null;
};

export type ServerExamDraft = {
  answers: ExamAnswers;
  flaggedIds: string[];
  /** Sunucuda kayıtlı soru; eski kayıtta yok. */
  cursor: number | null;
  /** Sunucunun son kayıt anı (ISO); eski kayıtta yok. */
  updatedAt: string | null;
};

export type ExamDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function examDraftKey(examId: string): string {
  return `${EXAM_DRAFT_PREFIX}${examId}`;
}

function cleanAnswers(raw: unknown): ExamAnswers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: ExamAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key === EXAM_DRAFT_META_KEY) continue;
    if (typeof value === "string") out[key] = value;
    else if (Array.isArray(value)) out[key] = value.filter((item): item is string => typeof item === "string");
  }
  return out;
}

function cleanIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string") : [];
}

function cleanCursor(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
}

export function readExamDraft(
  storage: ExamDraftStorage | null | undefined,
  examId: string,
  now = Date.now(),
): ExamDraft | null {
  if (!storage || !examId) return null;
  try {
    const raw = storage.getItem(examDraftKey(examId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExamDraft> | null;
    if (!parsed || parsed.v !== 1 || typeof parsed.updatedAt !== "number") return null;
    if (now - parsed.updatedAt > EXAM_DRAFT_TTL_MS) {
      clearExamDraft(storage, examId);
      return null;
    }
    return {
      v: 1,
      answers: cleanAnswers(parsed.answers),
      flaggedIds: cleanIds(parsed.flaggedIds),
      cursor: cleanCursor(parsed.cursor),
      deadlineAt: typeof parsed.deadlineAt === "string" ? parsed.deadlineAt : null,
      updatedAt: parsed.updatedAt,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
    };
  } catch {
    return null;
  }
}

function storeDraft(storage: ExamDraftStorage, examId: string, draft: ExamDraft): ExamDraft | null {
  try {
    storage.setItem(examDraftKey(examId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

/**
 * Öğrencinin düzenlemesi: cevaplar, işaretler ve soru hemen yazılır, `updatedAt` ilerler; bitiş
 * anı ve onay verilmezse öncekiler korunur. Yazılamazsa (dolu depo, gizli pencere) null.
 */
export function writeExamDraft(
  storage: ExamDraftStorage | null | undefined,
  examId: string,
  input: {
    answers: ExamAnswers;
    flaggedIds: string[];
    cursor: number;
    deadlineAt?: string | null;
    now?: number;
    savedAt?: number | null;
  },
): ExamDraft | null {
  if (!storage || !examId) return null;
  const now = input.now ?? Date.now();
  const previous = readExamDraft(storage, examId, now);
  return storeDraft(storage, examId, {
    v: 1,
    answers: cleanAnswers(input.answers),
    flaggedIds: cleanIds(input.flaggedIds),
    cursor: cleanCursor(input.cursor),
    deadlineAt: input.deadlineAt === undefined ? (previous?.deadlineAt ?? null) : input.deadlineAt,
    updatedAt: now,
    savedAt: input.savedAt === undefined ? (previous?.savedAt ?? null) : input.savedAt,
  });
}

/** Yalnız bitiş anı: düzenleme sayılmaz (`updatedAt` değişmez), sunucu kaydını geride bırakmaz. */
export function rememberExamDeadline(
  storage: ExamDraftStorage | null | undefined,
  examId: string,
  deadlineAt: string | null,
  now = Date.now(),
): void {
  if (!storage || !examId) return;
  const draft = readExamDraft(storage, examId, now);
  if (!draft || draft.deadlineAt === deadlineAt) return;
  storeDraft(storage, examId, { ...draft, deadlineAt });
}

/** Sunucu kaydı onaylandı: o ana kadarki düzenleme kaydedildi; sonrası taslakta "kaydedilmemiş" kalır. */
export function markExamDraftSaved(
  storage: ExamDraftStorage | null | undefined,
  examId: string,
  sentUpdatedAt: number,
): void {
  if (!storage || !examId) return;
  const draft = readExamDraft(storage, examId);
  if (!draft) return;
  const savedAt = Math.min(draft.updatedAt, sentUpdatedAt);
  if (draft.savedAt != null && draft.savedAt >= savedAt) return;
  storeDraft(storage, examId, { ...draft, savedAt });
}

export function clearExamDraft(storage: ExamDraftStorage | null | undefined, examId: string): void {
  if (!storage || !examId) return;
  try {
    storage.removeItem(examDraftKey(examId));
  } catch {
    // Depo yoksa silinecek taslak da yok.
  }
}

/** Taslakta sunucuya ulaşmamış düzenleme var mı. */
export function examDraftDirty(draft: ExamDraft | null | undefined): boolean {
  if (!draft) return false;
  return draft.savedAt === null || draft.updatedAt > draft.savedAt;
}

/**
 * Hangisi yeni: taslakta kaydedilmemiş düzenleme yoksa sunucu (bildiğimiz her şeyi zaten aldı,
 * üstüne başka cihazın kaydı gelmiş olabilir). Varsa saatler karşılaştırılır; sunucu saati yoksa
 * (eski kayıt) taslak. Kayma payı bir dakikalık saat farkı öğrencinin cevabını silmesin diye.
 */
export function pickNewerExamDraft(
  local: ExamDraft | null | undefined,
  server: ServerExamDraft | null | undefined,
  skewMs = EXAM_DRAFT_SKEW_MS,
): "local" | "server" | null {
  if (!local) return server ? "server" : null;
  if (!server) return "local";
  if (!examDraftDirty(local)) return "server";
  if (!server.updatedAt) return "local";
  const serverAt = Date.parse(server.updatedAt);
  if (Number.isNaN(serverAt)) return "local";
  return serverAt > local.updatedAt + skewMs ? "server" : "local";
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function hasValue(value: ExamAnswerValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Açılış: kazananın cevapları üstün, öbür kopyanın kazananda boş kalan cevapları eklenir. İşaretler
 * ve soru kazanandan (sunucuda soru yoksa taslaktan). `push`: sonuç sunucudakinden farklı, hemen
 * kaydedilmeli.
 */
export function resolveExamResume(
  local: ExamDraft | null | undefined,
  server: ServerExamDraft | null | undefined,
  skewMs = EXAM_DRAFT_SKEW_MS,
): { answers: ExamAnswers; flaggedIds: string[]; cursor: number; from: "local" | "server" | null; push: boolean } {
  const from = pickNewerExamDraft(local, server, skewMs);
  if (!from) return { answers: {}, flaggedIds: [], cursor: 0, from, push: false };
  const winner = from === "local" ? local! : server!;
  const loser = from === "local" ? server : local;
  const answers: ExamAnswers = { ...winner.answers };
  for (const [key, value] of Object.entries(loser?.answers ?? {})) {
    if (!hasValue(answers[key]) && hasValue(value)) answers[key] = value;
  }
  const cursor =
    from === "local"
      ? local!.cursor
      : typeof server!.cursor === "number"
        ? server!.cursor
        : (local?.cursor ?? 0);
  const flaggedIds = [...winner.flaggedIds];
  const serverAnswers = server?.answers ?? {};
  const answersDiffer =
    Object.keys(answers).length !== Object.keys(serverAnswers).length ||
    Object.keys(answers).some((key) => !sameValue(answers[key], serverAnswers[key]));
  const push = Boolean(server) ? answersDiffer || (from === "local" && examDraftDirty(local)) : Object.keys(answers).length > 0;
  return { answers, flaggedIds, cursor: Math.max(0, cursor), from, push };
}

/** Sunucuya yazılacak cevap kümesi: kaldığı soru ve kayıt anı `__meta`'da. */
export function withExamDraftMeta(
  answers: ExamAnswers,
  meta: { cursor: number | null | undefined; savedAt: string },
): Record<string, unknown> {
  return {
    ...cleanAnswers(answers),
    [EXAM_DRAFT_META_KEY]: {
      cursor: typeof meta.cursor === "number" && meta.cursor >= 0 ? Math.floor(meta.cursor) : null,
      savedAt: meta.savedAt,
    },
  };
}

/** Sunucudaki cevap kümesini ayırır: cevaplar, kaldığı soru, son kayıt anı (eski kayıtta ikisi null). */
export function splitExamDraftMeta(raw: unknown): { answers: ExamAnswers; cursor: number | null; updatedAt: string | null } {
  const answers = cleanAnswers(raw);
  const meta =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? ((raw as Record<string, unknown>)[EXAM_DRAFT_META_KEY] as Record<string, unknown> | undefined)
      : undefined;
  const cursor =
    meta && typeof meta.cursor === "number" && Number.isFinite(meta.cursor) && meta.cursor >= 0
      ? Math.floor(meta.cursor)
      : null;
  const updatedAt = meta && typeof meta.savedAt === "string" ? meta.savedAt : null;
  return { answers, cursor, updatedAt };
}

/** Bitiş anından kalan saniye (taslaktaki bitiş; açılış isteği düşünce saat buradan sürer). */
export function secondsUntil(deadlineAt: string | null | undefined, now = Date.now()): number | null {
  if (!deadlineAt) return null;
  const end = Date.parse(deadlineAt);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - now) / 1000));
}
