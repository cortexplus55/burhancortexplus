/** Kredi kapısının cümlesi: 402'nin kodu (dolan ücretsiz sayaç ya da Plus'taki iş) ve iki sabit kapı. */
import { beyondFreeMessage } from "@/lib/billing/free-reach";
import { freeLimitReachedLine, type FreeMeter } from "@/lib/billing/free-meters";
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
type FirstTopicSummary = { title?: string; done?: number; total?: number; lessonsDone?: number; bestScore?: number | null; completed?: boolean };

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
      message: `«${title}» bitti. Kalan konuları ve 20 soruluk sınav provasını açmak için Plus'a geç.`,
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
 * 402'nin koduna göre kapı (24 Ekim 2026). Ücretsiz hesapta hangi sayacın dolduğunu sunucu söylüyor:
 * haftalık ders hakkı, derse dahil adımların günlük sınırı ya da Plus'taki iş. Eskiden kod okunmuyor,
 * her 402 etkinliğin varsayılan cümlesini ve ders sayacının Pazartesi geri sayımını açıyordu.
 */
export function nodeGateForCode(code: unknown, base: NodeGate, isPremium: boolean, data?: { firstTopic?: FirstTopicSummary }): NodeGate {
  if (isPremium) return base;
  if (code === "free_topic_limit") return firstTopicGate(data?.firstTopic);
  if (code === "premium_required") {
    return base.beyondFreeDaily ? base : { message: beyondFreeMessage("Bu etkinlik"), beyondFreeDaily: true };
  }
  if (code === "free_lesson_limit") {
    return { message: freeLimitReachedLine("lesson"), beyondFreeDaily: false, meter: "lesson" };
  }
  if (code === "free_included_limit") {
    // Sınırın sayısı yazılmaz: kötüye kullanım sınırı, öğrenciye gösterilen bir hak değil.
    return {
      message: "Bugün çok sayıda çalışma adımı açtın; ücretsiz hesapta bugünkü sınır doldu.",
      beyondFreeDaily: false,
      meter: "included",
    };
  }
  return base;
}
