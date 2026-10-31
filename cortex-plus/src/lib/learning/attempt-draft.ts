/**
 * Etkinlik cevaplarının tarayıcı taslağı (30 Ekim 2026, Paket I).
 *
 * Neden: cevaplar yalnız bellekte (`answersRef`) duruyordu. Kayıt isteği askıda kalıp sayfa
 * yenilenince oturum sunucunun son bildiği sorudan açılıyor, aradaki cevaplar gidiyordu
 * ("2-5. cevaplar kaydedilmedi"). Artık her cevap `localStorage`'a yazılır
 * (`cp:attempt:<attemptId>`), sunucu kaydı onaylanınca taslak silinir ya da `savedAt` ilerler.
 * Açılışta sunucu kaydı taslaktan eskiyse taslaktaki anahtarlar sunucununkilerin üstüne yazılır
 * ve hemen kaydedilir; öğrenciye "Kaydedilmemiş cevapların geri yüklendi" denir.
 *
 * Saf modül: depo dışarıdan verilir (test sahte depoyla koşar); her okuma/yazma try/catch —
 * gizli pencere, dolu depo ya da engellenmiş site verisi sayfayı düşürmez.
 */

export const ATTEMPT_DRAFT_PREFIX = "cp:attempt:";
/** Bir haftadan eski taslak okunmaz ve temizlenir. */
export const ATTEMPT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Tarayıcı saati ile sunucu saati arasında kabul edilen kayma. */
export const DRAFT_CLOCK_SKEW_MS = 2 * 60 * 1000;

export type AttemptDraft = {
  v: 1;
  answers: Record<string, unknown>;
  cursor: number;
  /** Son yerel düzenleme (tarayıcı saati, ms). */
  updatedAt: number;
  /** Sunucunun onayladığı son kayıt (tarayıcı saati, ms); hiç onay yoksa null. */
  savedAt: number | null;
};

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function attemptDraftKey(attemptId: string): string {
  return `${ATTEMPT_DRAFT_PREFIX}${attemptId}`;
}

/** Sunucuya gitmeyen yardımcı anahtarlar taslakta da yer almaz. */
function withoutMeta(answers: Record<string, unknown>): Record<string, unknown> {
  const { __meta, __hints, ...rest } = answers;
  void __meta;
  void __hints;
  return rest;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function readAttemptDraft(
  storage: DraftStorage | null | undefined,
  attemptId: string,
  now = Date.now(),
): AttemptDraft | null {
  if (!storage || !attemptId) return null;
  try {
    const raw = storage.getItem(attemptDraftKey(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AttemptDraft> | null;
    if (!parsed || parsed.v !== 1 || !parsed.answers || typeof parsed.answers !== "object") return null;
    if (typeof parsed.updatedAt !== "number" || now - parsed.updatedAt > ATTEMPT_DRAFT_TTL_MS) {
      clearAttemptDraft(storage, attemptId);
      return null;
    }
    return {
      v: 1,
      answers: withoutMeta(parsed.answers as Record<string, unknown>),
      cursor: typeof parsed.cursor === "number" && parsed.cursor >= 0 ? parsed.cursor : 0,
      updatedAt: parsed.updatedAt,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : null,
    };
  } catch {
    return null;
  }
}

/**
 * Taslağı yazar; `savedAt` verilmezse öncekini korur (yeni düzenleme onayı silmez).
 * Yazılamazsa (dolu depo, gizli pencere) sessizce null döner.
 */
export function writeAttemptDraft(
  storage: DraftStorage | null | undefined,
  attemptId: string,
  input: { answers: Record<string, unknown>; cursor: number; now?: number; savedAt?: number | null },
): AttemptDraft | null {
  if (!storage || !attemptId) return null;
  const now = input.now ?? Date.now();
  const previous = readAttemptDraft(storage, attemptId, now);
  const draft: AttemptDraft = {
    v: 1,
    answers: withoutMeta(input.answers),
    cursor: Math.max(0, input.cursor),
    updatedAt: now,
    savedAt: input.savedAt === undefined ? (previous?.savedAt ?? null) : input.savedAt,
  };
  try {
    storage.setItem(attemptDraftKey(attemptId), JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function clearAttemptDraft(storage: DraftStorage | null | undefined, attemptId: string): void {
  if (!storage || !attemptId) return;
  try {
    storage.removeItem(attemptDraftKey(attemptId));
  } catch {
    // Depo yoksa silinecek taslak da yok.
  }
}

/**
 * Sunucu kaydı onaylandı: taslak kaydedilenle aynıysa silinir, daha yeni düzenleme varsa yalnız
 * `savedAt` ilerler (kaydedilmemiş kısım taslakta kalır).
 */
export function markAttemptDraftSaved(
  storage: DraftStorage | null | undefined,
  attemptId: string,
  savedAnswers: Record<string, unknown>,
  savedAt = Date.now(),
): void {
  if (!storage || !attemptId) return;
  const draft = readAttemptDraft(storage, attemptId, savedAt);
  if (!draft) return;
  if (!diffAnswerKeys(draft.answers, savedAnswers).length) {
    clearAttemptDraft(storage, attemptId);
    return;
  }
  try {
    storage.setItem(attemptDraftKey(attemptId), JSON.stringify({ ...draft, savedAt }));
  } catch {
    // Yazılamadıysa eski taslak durur; bir sonraki onayda yine denenir.
  }
}

/** `local`da olup `saved`da olmayan ya da farklı olan anahtarlar (yardımcı anahtarlar hariç). */
export function diffAnswerKeys(
  local: Record<string, unknown>,
  saved: Record<string, unknown> | null | undefined,
): string[] {
  const base = saved ?? {};
  return Object.keys(withoutMeta(local)).filter((key) => !(key in base) || !sameValue(local[key], base[key]));
}

/** Soru sırasına bağlı cevap anahtarları ("0", "1", …): özetteki "N cevap". */
export function countAnswerKeys(answers: Record<string, unknown> | null | undefined): number {
  return Object.keys(answers ?? {}).filter((key) => /^\d+$/.test(key)).length;
}

/** "N cevap kaydedildi, M cevap kaydedilemedi" özeti için sayılar. */
export function answerSaveSummary(
  local: Record<string, unknown>,
  saved: Record<string, unknown> | null | undefined,
): { saved: number; unsaved: number } {
  const unsavedKeys = new Set(diffAnswerKeys(local, saved).filter((key) => /^\d+$/.test(key)));
  const total = countAnswerKeys(local);
  return { saved: Math.max(0, total - unsavedKeys.size), unsaved: unsavedKeys.size };
}

export function draftHasUnsaved(draft: AttemptDraft | null | undefined): boolean {
  if (!draft) return false;
  return draft.savedAt === null || draft.updatedAt > draft.savedAt;
}

/**
 * Taslak sunucu kaydından yeni mi? Sunucu zamanı yoksa taslak sayılır; varsa tarayıcı saatine
 * kayma payı eklenir — bir dakikalık saat farkı öğrencinin cevabını silmesin.
 */
export function draftOutranksServer(
  draft: AttemptDraft,
  serverUpdatedAt: string | null | undefined,
  skewMs = DRAFT_CLOCK_SKEW_MS,
): boolean {
  if (!serverUpdatedAt) return true;
  const server = Date.parse(serverUpdatedAt);
  if (Number.isNaN(server)) return true;
  return draft.updatedAt + skewMs >= server;
}

/**
 * Açılışta birleştirme: taslakta kaydedilmemiş değişiklik varsa ve taslak sunucu kaydından yeniyse
 * taslağın farklı anahtarları sunucununkilerin üstüne yazılır. Döndürülen `restored`, geri yüklenen
 * anahtarlardır (boşsa sunucu kaydı aynen kalır).
 */
export function mergeDraftIntoServer(
  server: { answers: Record<string, unknown>; cursor: number; updatedAt?: string | null },
  draft: AttemptDraft | null | undefined,
): { answers: Record<string, unknown>; cursor: number; restored: string[] } {
  const base = { answers: { ...server.answers }, cursor: Math.max(0, server.cursor), restored: [] as string[] };
  if (!draft || !draftHasUnsaved(draft) || !draftOutranksServer(draft, server.updatedAt)) return base;
  const restored = diffAnswerKeys(draft.answers, server.answers);
  // Cevaplar aynı, yalnız soru ilerlemiş (31 Ekim 2026): kaldığı soru taslaktan; sunucu kaydı
  // "Sonraki soru"dan sonraki kısa beklemede yenilenen sayfaya yetişmemiş olabilir.
  if (!restored.length) return { ...base, cursor: Math.max(base.cursor, draft.cursor) };
  const answers = { ...server.answers };
  for (const key of restored) answers[key] = draft.answers[key];
  return { answers, cursor: Math.max(base.cursor, draft.cursor), restored };
}
