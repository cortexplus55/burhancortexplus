import type { TutorStyle } from "@/lib/learning/tutor-style";

/**
 * Öğretmen cevabının ilk cümlesi (25 Ekim 2026, canlı test P1-5). Yoldaki soru-cevapta öğrenci "X nedir?"
 * diye sordu; cevap "Takıldığın nokta …" diye başlayıp tanımı üçüncü paragrafa sakladı. Sohbet, sesli
 * soru-cevap ve ders içi koç aynı yüklemi okur: doğrudan soruda ilk cümle tam cevaptır; öğrencinin nerede
 * takıldığı yalnız kendi çözümünü yazdıysa söylenir.
 */

/** `\b` Türkçe harfte (ç, ş, ö …) sınır görmüyor; kelime sınırı harf/rakam komşuluğuyla. */
function wordPattern(body: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "iu");
}

const DIRECT_REQUEST = wordPattern(
  "(?:doğrudan|direkt|direk)\\s+(?:söyle|anlat|cevapla|ver|çöz)|cevab(?:ı|ını)\\s+(?:ver|söyle|yaz)|sadece\\s+cevap|kısaca\\s+(?:söyle|anlat)",
);

/** Kavram soruları: "nedir", "hangisidir", "ne demek", "nelerdir", "kaçtır", "kimdir", "ne işe yarar". */
const CONCEPT_QUESTION = wordPattern(
  "nedir|nelerdir|hangisidir|hangileridir|ne\\s+demek(?:tir)?|ne\\s+anlama\\s+gelir|kaçtır|kimdir|ne\\s+zaman(?:dır)?|ne\\s+işe\\s+yarar|farkı\\s+ne(?:dir)?|neden(?:dir)?|niçin|what\\s+is|which",
);

/** Öğrencinin kendi denemesi: "bence", "benim cevabım", "şöyle çözdüm", "X buldum", işlem satırı. */
const OWN_ATTEMPT = wordPattern(
  "bence|benim\\s+cevab\\p{L}*|cevabım|çözümüm|şöyle\\s+(?:çözdüm|yaptım|düşündüm)|buldum|işaretledim|hesapladım|denedim|yanlış\\s+mı|doğru\\s+mu",
);

export function hasOwnSolution(message: string): boolean {
  const text = message.trim();
  if (OWN_ATTEMPT.test(text)) return true;
  // İşlem satırı ("2x + 3 = 7, x = 2"): eşittirin iki yanında sayı ya da değişken.
  return /[\w)]\s*=\s*[-\w(]/u.test(text) && /\d/.test(text);
}

/**
 * Tek yüklem: doğrudan kavram sorusu, "doğrudan söyle / cevabı ver / nedir / hangisidir", ya da öğrencinin
 * seçtiği Adım adım / Doğrudan çöz tarzı. Kendi çözümünü yazan öğrencide önce o değerlendirilir.
 */
export function wantsDirectAnswer(message: string, style?: TutorStyle | null): boolean {
  const text = message.trim();
  if (!text || hasOwnSolution(text)) return false;
  if (DIRECT_REQUEST.test(text) || CONCEPT_QUESTION.test(text)) return true;
  return style === "step_by_step" || style === "direct_solve";
}

export const STUCK_POINT_RULE =
  "'Takıldığın nokta', 'takıldığın yer', 'nerede takıldığın' gibi cümle yazma; öğrenci kendi çözümünü yazmadıysa nerede takıldığını bilemezsin.";

/** Mesaja göre öğretmene giden satır; sistem istemine eklenir. */
export function answerFirstLine(message: string, style?: TutorStyle | null): string {
  if (hasOwnSolution(message)) {
    return "Öğrenci kendi çözümünü yazdı: ilk cümlede doğru mu yanlış mı olduğunu söyle; yanlışsa takıldığı noktayı adıyla göster ve doğrusunu ver.";
  }
  if (wantsDirectAnswer(message, style)) {
    return `İLK CÜMLE TAM CEVAP (kesin): Öğrencinin sorusunun cevabını ilk cümlede açıkça ver (tanım, doğru şık, sayı ya da sonuç); gerekçe ve örnek sonra gelir. ${STUCK_POINT_RULE}`;
  }
  return STUCK_POINT_RULE;
}

const STUCK_PHRASE = /(takıldığın|takıldığınız)\s+(özel\s+bir\s+)?(nokta|yer|kısım)|nerede\s+takıldığın/iu;

/** Öğrenci kendi çözümünü yazmadan cevap "takıldığın nokta" diyorsa denetimde sorun sayılır. */
export function stuckPointIssue(message: string, answer: string): string | null {
  if (hasOwnSolution(message) || !STUCK_PHRASE.test(answer)) return null;
  return "Öğrenci kendi çözümünü yazmadı; 'takıldığın nokta' gibi cümle kullanılmış. İlk cümlede doğrudan cevabı ver.";
}

function words(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("tr-TR")
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 6)),
  );
}

/** Cevabın en çok örtüştüğü sayfa: kaynak işareti modelin yazdığı sayfadan değil, metinden gelir. */
export function bestSourcePage<T extends { page: number; text: string }>(answer: string, pages: readonly T[]): T | null {
  const wanted = words(answer);
  if (!wanted.size || !pages.length) return null;
  let best: { page: T; score: number } | null = null;
  for (const page of pages) {
    const have = words(page.text);
    let score = 0;
    for (const word of wanted) if (have.has(word)) score += 1;
    if (!best || score > best.score) best = { page, score };
  }
  return best && best.score >= 2 ? best.page : null;
}
