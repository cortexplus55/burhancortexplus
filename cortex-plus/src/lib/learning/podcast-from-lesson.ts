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
 * Referans ürün da böyle yapıyor: konunun "Akıllı Metin"i ile podcast'i aynı
 * gövdeden besleniyor, bölüm başlıkları birebir örtüşüyor.
 */

import {
  isScaffoldHeading,
  type LessonV2,
} from "@/lib/learning/teaching-standards";
import { lessonSectionDetails } from "@/lib/learning/lesson-section-text";

/**
 * Podcast promptuna giren, dersin sıkıştırılmış hâli.
 *
 * Brief'te geçen HER AD podcast'te bölüm başlığı olma eğiliminde. Bu
 * canlıda kilitlenmeye yol açtı: dersin bir bölümü "Kontrol Noktası"
 * adını taşıyordu, podcast onu sadakatle kopyaladı, doğrulayıcı da
 * şablon adı diye reddetti — üretim hiç tamamlanamadı. Prompt "dersin
 * bölümlerinden gelsin" derken doğrulayıcı "o adı kullanma" diyordu.
 *
 * Bu yüzden şablon adı taşıyan bölüm başlıksız veriliyor (model kendi
 * adını koymak zorunda) ve alan etiketleri başlığa dönüşmeyecek biçimde
 * yazılıyor — "Özet:" yerine "Dersin kapanışında söylenenler".
 */
export function lessonPodcastBrief(lesson: LessonV2): string {
  const sections = lesson.sections
    .map((s, i) =>
      (isScaffoldHeading(s.heading)
        ? `${i + 1}. (bu bölümü içeriğine göre sen adlandır): ${s.body}`
        : `${i + 1}. ${s.heading}: ${s.body}`) + sectionDetails(s),
    )
    .join("\n");

  return [
    `DERSİN KENDİSİ (bu podcast onun sesli hâli):`,
    `Başlık: ${lesson.title}`,
    lesson.objective ? `Hedef: ${lesson.objective}` : "",
    lesson.overview ? `Konunun özü: ${lesson.overview}` : "",
    ``,
    `Dersin bölümleri:`,
    sections,
    ``,
    lesson.example
      ? `Kaynaktaki çözümlü soru: ${lesson.example.prompt}\nÇözümü: ${lesson.example.solution}`
      : "",
    lesson.commonMistake
      ? `Öğrencinin düştüğü yanılgı: ${lesson.commonMistake.claim}\nDoğrusu: ${lesson.commonMistake.correction}`
      : "",
    lesson.summary?.length ? `Dersin kapanışında söylenenler: ${lesson.summary.join(" ")}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function sectionDetails(section: LessonV2["sections"][number]): string {
  return lessonSectionDetails(section)
    .map((line) => `\n   ${line}`)
    .join("");
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
