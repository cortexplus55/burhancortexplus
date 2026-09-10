/**
 * Podcast'i dersten türetme.
 *
 * Podcast bugüne kadar kaynak PDF'ten bağımsız üretiliyordu ve aynı olguyu
 * ikinci kez çıkarmak zorunda kalıyordu. Zemin podcast'inde bu şöyle
 * patladı: PDF "No.200 eleğinden geçen %50'yi aşıyorsa ince daneli" diyor,
 * kendi örneğinde %8 kaba daneli çıkıyor; podcast "%8 geçiyorsa ince
 * daneli" dedi. Sayı kaynaktan, sonuç ters.
 *
 * Aynı konunun dersi zaten üretilmiş ve `validateLessonPedagogy` ile
 * çözümlü örneğin adım adım doğruluğundan geçmiş durumda. Podcast o
 * dersin üzerine kurulursa olgu ikinci kez çıkarılmıyor, aktarılıyor —
 * ters çevirme ihtimali kaynağında kuruyor.
 *
 * Astra da böyle yapıyor: konunun "Akıllı Metin"i ile podcast'i aynı
 * gövdeden besleniyor, bölüm başlıkları birebir örtüşüyor.
 */

import type { LessonV2 } from "@/lib/learning/teaching-standards";

/** Podcast promptuna giren, dersin sıkıştırılmış hâli. */
export function lessonPodcastBrief(lesson: LessonV2): string {
  const sections = lesson.sections
    .map((s, i) => `${i + 1}. ${s.heading}: ${s.body}`)
    .join("\n");

  return [
    `DERSİN KENDİSİ (bu podcast onun sesli hâli):`,
    `Başlık: ${lesson.title}`,
    `Hedef: ${lesson.objective}`,
    `Genel bakış: ${lesson.overview}`,
    ``,
    `Bölümler:`,
    sections,
    ``,
    `Çözümlü örnek: ${lesson.example.prompt}`,
    `Çözüm: ${lesson.example.solution}`,
    ``,
    `Yaygın hata: ${lesson.commonMistake.claim}`,
    `Düzeltme: ${lesson.commonMistake.correction}`,
    ``,
    `Özet: ${lesson.summary.join(" ")}`,
  ].join("\n");
}

/**
 * Podcast'in dersten çıkmayan sayısı var mı?
 *
 * Dersin kendisi küçük ve doğrulanmış bir külliyat; podcast onun sesli
 * hâliyse geçen her nicelik derste de geçmeli. Tek haneli sayılar
 * sayılmıyor ("üç fazlı", "iki sunucu") — onlar anlatının kendisinden
 * gelir ve boşuna taslak reddi doğurur. Yüzde işaretli olan her zaman
 * sayılır: "%8" tam da yanlış giden yerdi.
 */
export function podcastNumbersOutsideLesson(
  podcastText: string,
  lessonText: string,
): string[] {
  const lessonNumbers = new Set(numericTokens(lessonText));
  return [...new Set(numericTokens(podcastText))].filter(
    (n) => !lessonNumbers.has(n),
  );
}

function numericTokens(text: string): string[] {
  const out: string[] = [];
  // Ondalık ayırıcı Türkçede virgül, İngilizce alıntılarda nokta; ikisi de
  // aynı sayıyı gösteriyorsa aynı sayılmalı.
  const re = /(%\s*)?(\d+(?:[.,]\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const percent = Boolean(match[1]);
    const raw = match[2].replace(",", ".");
    if (!percent && raw.length < 2) continue;
    out.push(raw);
  }
  return out;
}
