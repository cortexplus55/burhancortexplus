/**
 * Belgesiz "Farklı anlat" ilk ekranı (3 Kasım 2026, canlı ölçüm: ilk ekran 11,7 sn).
 *
 * Asıl ders yazarı (6–8 bölüm, denetimli) uzun şemalı istemle düşünerek yazdığı için ilk ekranı
 * ~10 sn'de çıkarıyordu. Bu modül, asıl yazarla PARALEL, hızlı ve düşünmesiz bir modelle yalnız
 * "kısa giriş + ilk bölüm" ekranını yazar (soru yok; denetlenmemiş soru gösterilmez). Asıl yazarın
 * ilk ekranından önce gelirse dersin 0. ekranı olur ve her yayında başta kalır; sonra gelirse atılır
 * (öğrencinin okuduğu ekran yerinden oynamaz). Asıl dersin 6–8 bölüm kuralı değişmez.
 */
import { LESSON_V3_FORMAT, lessonScreenSchema, type LessonScreen } from "@/lib/learning/lesson-v3";

export const REWRITE_LEAD_MAX_TOKENS = 380;

export function rewriteLeadPrompt(input: { topicLabel: string; basis: string; styleLine?: string }): { system: string; user: string } {
  return {
    system: [
      "Sen Cortex Plus'ın öğretmenisin. Türkçe yazarsın. Öğrenci bu konunun bir anlatımını okudu ve farklı anlatılmasını istedi.",
      "Yalnız dersin İLK ekranını yaz: 1-2 cümlelik merak uyandıran farklı bir giriş, ardından konunun ilk temel fikri (somut, gündelik bir örnek ya da benzetmeyle).",
      "Toplam 90-150 kelime. Soru, test, şık yazma. Kazanımların dışına çıkma; bilgi doğru ve sınav düzeyinde olsun.",
      input.styleLine?.trim() ?? "",
      'JSON döndür: {"heading":"ekran başlığı","concept":"ilk fikrin kısa adı","paragraphs":["giriş","ilk fikir"]}',
    ].filter(Boolean).join("\n"),
    user: `KONU: ${input.topicLabel}\n${input.basis.slice(0, 1_800)}`,
  };
}

/** Model cevabı → soru içermeyen tek ekran; bozuksa null (asıl ders zaten geliyor). */
export function parseRewriteLead(text: string): LessonScreen | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  const value = raw as { heading?: unknown; concept?: unknown; paragraphs?: unknown };
  const paragraphs = Array.isArray(value.paragraphs)
    ? value.paragraphs.filter((item): item is string => typeof item === "string" && item.trim().length >= 2).slice(0, 3)
    : [];
  if (typeof value.heading !== "string" || !paragraphs.length) return null;
  const parsed = lessonScreenSchema.safeParse({
    heading: value.heading.trim().slice(0, 160),
    concept: typeof value.concept === "string" ? value.concept.trim().slice(0, 120) : value.heading.trim().slice(0, 120),
    blocks: paragraphs.map((text) => ({ type: "text", text: text.trim().slice(0, 2_500) })),
  });
  return parsed.success ? parsed.data : null;
}

type LessonLike = { format?: unknown; title?: unknown; screens?: unknown[] } & Record<string, unknown>;

/** Yayın/sonuç yükünün dersine giriş ekranını başa koyar (zaten varsa tekrar koymaz). */
export function prefixLeadScreen(payload: Record<string, unknown>, lead: LessonScreen, cap = 16): Record<string, unknown> {
  const lesson = payload.lesson as LessonLike | undefined;
  if (!lesson || !Array.isArray(lesson.screens)) return payload;
  const first = lesson.screens[0] as LessonScreen | undefined;
  if (first && first.heading === lead.heading && JSON.stringify(first.blocks) === JSON.stringify(lead.blocks)) return payload;
  const planned = typeof payload.plannedScreens === "number" ? { plannedScreens: payload.plannedScreens + 1 } : {};
  return { ...payload, ...planned, lesson: { ...lesson, screens: [lead, ...lesson.screens].slice(0, cap) } };
}

/** Yalnız giriş ekranı olan ilk yayın. */
export function leadOnlyPayload(lead: LessonScreen, title: string): Record<string, unknown> {
  return {
    type: "lesson",
    lesson: { format: LESSON_V3_FORMAT, title, screens: [lead] },
    title,
    engine: "teacher",
    qualityReport: null,
    refunded: false,
    upcoming: [],
  };
}

/** Asıl yazara not: giriş ayrıca gösterildi, ilk ekranı giriş tekrarı olmasın. */
export const REWRITE_LEAD_NOTE =
  "Not: Öğrenciye bu konunun kısa, farklı bir giriş ekranı ayrıca gösterildi. Dersin ilk ekranı yeniden giriş olmasın; doğrudan ilk kavramla başla.";

export const REWRITE_SUMMARY_CHARS = 1_400;

export function rewriteBasisFrom(input: { outcomes: string[]; style: string; summary: string }): string {
  const summary = input.summary.trim().slice(0, REWRITE_SUMMARY_CHARS);
  return [
    input.outcomes.length ? `KAZANIMLAR:\n${input.outcomes.join("\n")}` : "",
    input.style ? `ANLATIM TARZI: ${input.style}` : "",
    summary ? `ÖNCEKİ ANLATIMIN KISA ÖZETİ:\n${summary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
