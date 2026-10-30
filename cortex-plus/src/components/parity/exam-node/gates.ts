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
};

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
export function nodeGateForCode(code: unknown, base: NodeGate, isPremium: boolean): NodeGate {
  if (isPremium) return base;
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
