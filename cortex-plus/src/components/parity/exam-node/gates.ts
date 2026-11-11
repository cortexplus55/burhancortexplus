/** Kredi kapısının cümlesi: 402'nin kodu (dolan ücretsiz sayaç ya da Plus'taki iş) ve iki sabit kapı. */
import { FREE_LESSON_WORK_NAME, beyondFreeMessage } from "@/lib/billing/free-reach";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { SPEND_CAP_CODE, SPEND_CAP_MESSAGE } from "@/lib/billing/spend-breaker-copy";
import type { ActionCode } from "@/lib/env";

/** Kredi kapısının ne söyleyeceği: cümle, dolan ücretsiz sayaç ya da Plus'taki iş. */
export type NodeGate = {
  message: string;
  beyondFreeDaily: boolean;
  meter?: FreeMeter;
  action?: ActionCode;
  actionLabel?: string;
  /** Kapının başlığı (varsayılan "Daha hızlı öğrenmek için yükselt"). */
  headline?: string;
  /** Öğrencinin kazanımları: 1. konu kapısında bitirdiği adımlar ve en iyi sonucu. */
  wins?: string[];
};

/** Sunucunun 1. konu özeti (`free-topic-gate.ts`). */
export type FirstTopicSummary = { title?: string; done?: number; total?: number; lessonsDone?: number; bestScore?: number | null; completed?: boolean };

/**
 * İlk doz bedava kapısı (31 Ekim 2026, Paket J1 #3): ücretsiz hesapta 2. konu ve final adımları. 1. konuyu bitiren
 * kazanımlarını görür; bitirmeyen 1. konunun açık olduğunu öğrenir. Beklemek çözmez (geri sayım yok).
 */
export function firstTopicGate(summary: FirstTopicSummary | null | undefined): NodeGate {
  const title = summary?.title?.trim() || "1. konu";
  const wins: string[] = [];
  if ((summary?.lessonsDone ?? 0) > 0) wins.push(`🧠 ${summary!.lessonsDone} ders bitirdin`);
  if ((summary?.total ?? 0) > 0) wins.push(`✅ ${summary!.done ?? 0}/${summary!.total} adım tamamlandı`);
  if (summary?.bestScore != null) wins.push(`📈 En iyi sonucun %${summary.bestScore}`);
  if (summary?.completed) {
    return {
      headline: "🚀 1. Konuyu Başarıyla Tamamladın!",
      message: `«${title}» bitti. Kalan Konuları Açmak İçin Plus'a Geç — 20 soruluk sınav provası da Plus'ta açılır.`,
      beyondFreeDaily: true,
      wins,
    };
  }
  return {
    headline: "🔒 Kalan konular Plus'ta",
    message: `Ücretsiz planda ilk konun tam açık: önce «${title}» konusunu bitir ya da kalan konuları ve 20 soruluk sınav provasını açmak için Plus'a geç.`,
    beyondFreeDaily: true,
    wins,
  };
}

/** Ders sonundaki "Şimdi dinle" ve "Sesli mod": ikisi de ücretsiz hesapta açılmaz (24 Ekim 2026). */
export const LESSON_PODCAST_GATE: NodeGate = {
  message: "Sesli tekrar için hakkın yetmedi.",
  beyondFreeDaily: true,
  action: "PODCAST_GENERATE",
  actionLabel: "Sesli tekrar",
};
export const VOICE_MODE_GATE: NodeGate = {
  message: "Sesli mod için hakkın yetmedi.",
  beyondFreeDaily: true,
  action: "VOICE_TURN",
  actionLabel: "Sesli mod",
};

/**
 * 402'nin koduna göre kapı (24 Ekim 2026). Ücretsiz hesapta sebebi sunucu söylüyor: derse dahil adımların
 * günlük sınırı, Plus'taki iş ya da ilk dersin döngüsü dışında kalan üretim (`free_lesson_limit`; 11 Kasım 2026
 * akşamı: ücretsiz hesap = tek ders, haftalık hak ve Pazartesi geri sayımı yok).
 */
export function nodeGateForCode(code: unknown, base: NodeGate, isPremium: boolean, data?: { firstTopic?: FirstTopicSummary }): NodeGate {
  if (isPremium) return base;
  if (code === "free_topic_limit") return firstTopicGate(data?.firstTopic);
  if (code === "premium_required") {
    return base.beyondFreeDaily ? base : { message: beyondFreeMessage("Bu etkinlik"), beyondFreeDaily: true };
  }
  if (code === "free_lesson_limit") {
    // "Farklı anlat", verilmiş adımın yeniden yazımı, ilk olmayan hazırlık: beklemek çözmez, geri sayım yok.
    return { message: beyondFreeMessage(FREE_LESSON_WORK_NAME), beyondFreeDaily: true };
  }
  if (code === "free_included_limit") {
    // Sınırın sayısı yazılmaz: kötüye kullanım sınırı, öğrenciye gösterilen bir hak değil.
    return {
      message: "Bugün çok sayıda çalışma adımı açtın; ücretsiz hesapta bugünkü sınır doldu.",
      beyondFreeDaily: false,
      meter: "included",
    };
  }
  // Günlük harcama sigortası (5 Kasım 2026): beklemek çözmez. Kod okunmayınca kapı etkinliğin varsayılan cümlesine
  // düşüyordu (11 Kasım 2026).
  if (code === SPEND_CAP_CODE) return { message: SPEND_CAP_MESSAGE, beyondFreeDaily: true };
  return base;
}
