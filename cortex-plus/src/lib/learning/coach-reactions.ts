/**
 * Enerjik koç ve mikro-dopamin katmanı (7 Kasım 2026): test, doğru/yanlış ve kartlarda canlı seri rozeti; cevaptan
 * sonra kuru "Doğru / Yanlış" yerine duruma göre değişen koç cümlesi; derste adımlar arasında kısa kıvılcım.
 *
 * Hepsi deterministik ve modelsiz (ek maliyet yok). Cümleler içerik değil arayüz metnidir: ders ya da sorunun metnine
 * dokunmaz, bilgi iddiası taşımaz ("+1 net" gibi tutulamayan söz vermez). Seri kırılınca moral bozucu bir şey
 * gösterilmez; koç cümlesi devreye girer.
 */

export type CoachInput = {
  correct: boolean;
  /** Bu cevap dahil art arda doğru sayısı (yanlışta 0). */
  streak: number;
  /** Cevap kilitlenmeden önce "İki şık arasında kaldım" ipucu alındı. */
  usedHint?: boolean;
  /** Çok cevaplı soruda kısmi puan (0-100); yalnız yanlış sayılan cevapta anlamlı. */
  partial?: number;
};

export type CoachReaction = {
  /** Ekrandaki tek cümle (emoji başta). */
  text: string;
  /** Rozet rengi: doğru yeşil, kısmen uyarı, yanlış nötr-mavi (kırmızı değil: azar yok). */
  tone: "right" | "partial" | "off";
};

/** Art arda doğru sayısı: dizinin sonundan geriye, ilk yanlışa (ya da cevapsıza) kadar. */
export function consecutiveCorrect(results: ReadonlyArray<boolean | null | undefined>): number {
  let streak = 0;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] !== true) break;
    streak += 1;
  }
  return streak;
}

/** Sayıya bulunma eki ("3'te", "6'da", "7'de", "40'ta"): son basamağın (sıfırsa onluğun) okunuşuna göre. */
export function locativeSuffix(n: number): string {
  const value = Math.abs(Math.trunc(n));
  const last = value % 10;
  const tens = value % 100;
  if (last !== 0) return (["de", "de", "de", "te", "te", "te", "da", "de", "de", "da"] as const)[last]!;
  if (value === 0) return "da";
  const byTens: Record<number, string> = { 10: "da", 20: "de", 30: "da", 40: "ta", 50: "de", 60: "ta", 70: "te", 80: "de", 90: "da" };
  return byTens[tens] ?? "de";
}

/** Seri rozeti: 2'den başlar; altı görünmez (`null`). */
export function streakBadge(streak: number): string | null {
  if (!Number.isInteger(streak) || streak < 2) return null;
  const n = `${streak}'${locativeSuffix(streak)} ${streak}`;
  if (streak === 2) return `⚡ ${n}! Ritim tuttun`;
  if (streak < 5) return `🔥 ${n} seri! Harika gidiyorsun`;
  return `🚀 ${n} kusursuz seri! Sınav kıvamındasın`;
}

/** Cevaptan sonra koç cümlesi. Öncelik: ipucuyla doğru → seri → ilk denemede doğru → kısmen → yanlış. */
export function coachReaction(input: CoachInput): CoachReaction {
  const streak = Math.max(0, Math.floor(input.streak));
  if (input.correct) {
    if (input.usedHint) {
      return { text: "🎯 İşte bu! İpucuyla çeldiriciyi eledin ve doğru mantığı yakaladın.", tone: "right" };
    }
    if (streak >= 3) {
      return { text: `🔥 Üst üste ${streak}. doğrun! Bu konunun mantığı iyice oturdu, hız kesme.`, tone: "right" };
    }
    return { text: "✨ Nokta atışı! Çeldirici şıklara hiç takılmadan doğru cevabı buldun.", tone: "right" };
  }
  if (typeof input.partial === "number" && input.partial > 0) {
    return { text: "🧩 Kısmen doğru: bir şık eksik ya da fazla. Açıklamada hangisi olduğunu gör, tam puan bir sonraki.", tone: "partial" };
  }
  return {
    text: "💪 Moral bozmak yok! Bu şık, sınavlarda en çok düşülen tuzaklardan. Gel, 10 saniyede mantığını kilitleyelim 👇",
    tone: "off",
  };
}

/** Derste adım tamamlanınca üstte kısa kıvılcım; gösterilecek bir şey yoksa `null`. */
export function lessonSpark(input: { hadTrap?: boolean; hadFormula?: boolean; enteringLast?: boolean }): string | null {
  if (input.enteringLast) return "🏁 Son adım! Bitirince sırada kendini test etmek var.";
  if (input.hadTrap) return "⚡ Sınav tuzağını öğrendin; bu şık artık seni yakalayamaz.";
  if (input.hadFormula) return "📐 Formül cebinde; sırada uygulaması.";
  return null;
}

/** Kıvılcımın ekranda kalma süresi (ms); hareket azaltmada aynı süre, yalnız animasyon yok. */
export const SPARK_MS = 2600;
