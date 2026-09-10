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

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import {
  podcastV2Schema,
  validatePodcastPedagogy,
  type LessonV2,
} from "@/lib/learning/teaching-standards";

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

/**
 * Dersin sesli hâlini üretir.
 *
 * Podcast artık planın öğrenme adımı değil; öğrenci konuyu okuyup
 * bitirdikten sonra "şimdi dinle" derse geliyor. O yüzden kaynağı ham PDF
 * değil, az önce okuduğu ders: aynı bölümler, aynı örnek, aynı yanılgı.
 * Öğrencinin duyduğu şey okuduğunun tekrarı olur ve olgu ikinci kez
 * çıkarılmadığı için kaynağı ters çevirme ihtimali kalmaz.
 */
export async function generatePodcastFromLesson(input: {
  service: SupabaseClient;
  userId: string;
  isPremium: boolean;
  prepTitle: string;
  topicLabel: string;
  lesson: LessonV2;
  idempotencyKey?: string;
  /**
   * Reddedilen taslakların gerekçesi. Podcast üretimi canlıda hiç
   * tamamlanmıyordu ve hangi kontrolün elediğini sunucu logu olmadan
   * anlamak mümkün değildi; çağıran taraf bunu okuyup yüzeye çıkarabilir.
   */
  onReject?: (issues: string[]) => void;
}) {
  const brief = lessonPodcastBrief(input.lesson);
  return generateJson({
    service: input.service,
    userId: input.userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: input.isPremium,
    difficulty: "hard",
    validationProfile: "v2",
    maxDraftAttempts: 2,
    allowIndependentAccept: true,
    activityKind: "podcast",
    idempotencyKey: input.idempotencyKey,
    buildIndependent: (_c, parsed) => {
      const data = podcastV2Schema.safeParse(parsed).data;
      return {
        pedagogyIssues: data
          ? validatePodcastPedagogy(data)
          : ["Podcast şeması geçersiz."],
        minItems: 4,
      };
    },
    schemaHint:
      'JSON: {"title":string,"objective":string,"sourcePoints":string[],"chapters":[{"title":string,"lines":[{"speaker":"ada"|"kerem","text":string}]}]}. ' +
      "4-5 bölüm. Her bölümün title'ı O BÖLÜMDE KONUŞULAN KAVRAMIN ADI olsun; " +
      '"Tanım", "Neden", "Örnek", "Yaygın hata", "Özet" gibi aşama adları başlık olarak YASAK. ' +
      "Ada ve Kerem sırayla. Her text TEK cümle, ≤25 kelime.",
    userPrompt: `Sınav: ${input.prepTitle}. Konu: ${input.topicLabel}.

${brief}

Bu podcast yukarıdaki DERSİN sesli hâlidir. Öğrenci dersi az önce okudu; şimdi aynı şeyi kulakla tekrar ediyor. Olguyu yeniden çıkarma, aktar: bölümler dersin bölümlerinden gelsin, örnek dersin çözümlü örneği olsun, yaygın hata dersinki olsun. Derste geçmeyen bir sayı kullanma.`,
    parse: (raw) => {
      const data = podcastV2Schema.safeParse(raw).data ?? null;
      if (!data) {
        input.onReject?.(["Podcast şeması geçersiz."]);
        return null;
      }
      const issues = validatePodcastPedagogy(data);
      const strayNumbers = podcastNumbersOutsideLesson(
        JSON.stringify(data.chapters),
        brief,
      );
      if (strayNumbers.length) {
        issues.push(`Derste geçmeyen sayı: ${strayNumbers.join(", ")}`);
      }
      if (issues.length) {
        input.onReject?.(issues);
        return null;
      }
      return data;
    },
  });
}
