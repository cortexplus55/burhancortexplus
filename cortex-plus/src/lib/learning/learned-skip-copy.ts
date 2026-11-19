/** Faz 4 madde 3.4 atlamanın istemciye de açık sabitleri (`learned-skip.ts` sunucu okumasını taşır). */

/** Tekrar adımları: kartlarla tekrar, zayıf nokta, odaklı pratik. */
export const LEARNED_SKIP_KINDS: ReadonlySet<string> = new Set(["spaced", "gaps", "focused"]);

export const LEARNED_SKIP_COPY = {
  title: "Bu konuyu öğrendin",
  body: "Kanıtların bu konuda hedefini tutturduğunu gösteriyor. İstersen bu tekrar adımını atlayıp yoluna devam et.",
  action: "Adımı Atla (0 Kredi)",
  busy: "Atlanıyor…",
  failed: "Adım şu an atlanamadı. Biraz sonra yeniden dene.",
} as const;


/** Zayıf / Gelişiyor / tuzak konudaki zayıf nokta ve odaklı pratik adımında: önce kayıtlı sorulardan ücretsiz tekrar. */
export const TARGETED_FIRST_KINDS: ReadonlySet<string> = new Set(["gaps", "focused"]);

export const TARGETED_FIRST_COPY = {
  title: "Önce ücretsiz hedefli tekrar",
  body: "Bu konuda eksik ya da tuzak var. Kayıtlı sorularından ve Yanlışlar Defteri'nden ücretsiz tekrarla başlayabilirsin.",
  action: "Eksik & Tuzak Soruları Çalış (Ücretsiz)",
} as const;
