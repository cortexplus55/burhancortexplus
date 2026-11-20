import { headingStems } from "@/lib/learning/lesson-backbone";
import type { LessonScreen } from "@/lib/learning/lesson-v3";
import { headingNamesTopic } from "@/lib/learning/topic-section";
import { lessonDepthForSubtopics, parseSubtopicList, subtopicKey } from "@/lib/learning/subtopic-list";

/**
 * Ünite dersi (20 Kasım 2026, ürün sahibinin kararı) — ders bağımsız, modelsiz.
 *
 * Yeni hazırlık birkaç tam ana üniteden kurulur; her ünite konu haritasının bulduğu ince konuları alt konu olarak
 * taşır ve TEK derin dersle öğretilir: ders listenin hepsini öğretmek zorundadır. Bu dosya üç şey yapar:
 * (1) yazarın okuduğu zorunlu plan ve sözleşme (aynı metin kapsamı yargılayan denetçiye de gider),
 * (2) kapanıştaki kapsam bekçisi: işlenmemiş alt konu (kökler, `lesson-backbone.ts` ile aynı ölçü),
 * (3) dersin sınırı: bölünmüş ünitenin öbür derslerinin ve öbür ünitelerin alt konuları dışarıdadır.
 *
 * Kod ders metni yazmaz: yalnız listeyi seçer, eksiği ölçer, modelden yalnız eksik alt konuları ister. Alt konu
 * yoksa (eski hazırlıklar) hiçbir istem ve denetim değişmez.
 */

/** Yazarın ve kapsamı yargılayan denetçinin okuduğu tek metin. */
export const SUBTOPIC_COVERAGE_CONTRACT =
  "ALT KONU SÖZLEŞMESİ: Bu ders ünitenin listedeki BÜTÜN alt konularını öğrencinin düzeyinde (öğrenci profili) " +
  "eksiksiz öğretir. Hiçbir alt konuyu atlama; dersi kısa tutmak için kaynaktaki hiçbir formülü, istisna kuralını, " +
  "sayısal eşiği ya da öğretmenin notunu düşürme. Her alt konu en az bir odaklı ekran alır ve o ekranın 'concept' adı " +
  "alt konunun adını taşır; geniş bir alt konu iki ekrana yayılabilir. Bir alt konudan ötekine geçerken kısa bir " +
  "kontrol sorusu ('check' bloğu) öğrenciyi yoklar. Kaynak destekliyorsa en az bir ekranda görsel ya da karşılaştırma " +
  "bloğu kullan (table, diagram, cards ya da comparison_carousel).";

/** "Bu dersin dışında" satırında en çok bu kadar ad (istem şişmesin). */
export const EXCLUDED_SUBTOPIC_CAP = 12;

/** Derinlik satırı: alt konu sayısından ekran aralığı. Alt konu yoksa boş. */
export function subtopicDepthLine(count: number): string {
  const depth = lessonDepthForSubtopics(count);
  if (!depth) return "";
  const shared =
    depth.subtopics > depth.maxScreens
      ? " Alt konu sayısı ekran sınırını aşıyor: yakın iki alt konu aynı ekranı paylaşabilir, ama ikisi de o ekranda " +
        "adıyla ve kendi bloğunda anlatılır."
      : "";
  return (
    `DERİNLİK: ${depth.subtopics} alt konu → bu ders ${depth.minScreens}-${depth.maxScreens} ekran, en çok ` +
    `${depth.maxConcepts} kavram (sistemdeki genel ekran ve kavram aralığının yerine bu geçerli).${shared}`
  );
}

/**
 * Yazarın planı: numaralı alt konular, derinlik, sözleşme ve (bölünmüş ünitede) bu dersin dışında kalan alt konular.
 * Alt konu yoksa boş.
 */
export function subtopicPlanBlock(input: { subtopics?: readonly string[]; excludedSubtopics?: readonly string[] }): string {
  const subtopics = input.subtopics ?? [];
  if (!subtopics.length) return "";
  const excluded = (input.excludedSubtopics ?? []).slice(0, EXCLUDED_SUBTOPIC_CAP);
  return [
    "ÜNİTENİN ALT KONULARI (bu dersin zorunlu planı, sırayla):",
    ...subtopics.map((subtopic, index) => `${index + 1}) ${subtopic}`),
    subtopicDepthLine(subtopics.length),
    SUBTOPIC_COVERAGE_CONTRACT,
    excluded.length
      ? "BU DERSİN DIŞINDA: ünitenin şu alt konuları ayrı bir derste anlatılıyor; onları bu derste bölüm yapma, " +
        `gerekirse bir cümleyle an: ${excluded.map((item) => `«${item}»`).join(", ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Ekranın bütün yazıları (başlık, kavram, giriş satırı ve blokların metin değerleri); JSON anahtarları girmez. */
function screenWords(screen: LessonScreen): string {
  const parts: string[] = [screen.heading, screen.concept ?? "", screen.lead ?? ""];
  const visit = (value: unknown) => {
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(screen.blocks);
  return parts.join(" ");
}

/**
 * Ayırt etmeyen kökler: ünitenin adında geçen ya da alt konuların yarısından çoğunda geçen kökler (ör. bütün alt
 * konularda aynı çerçeve sözcüğü). Bir alt konunun işlendiğine bunlar tek başına kanıt sayılmaz.
 */
function sharedStems(subtopics: readonly string[], unitLabel: string): Set<string> {
  const shared = new Set(headingStems(unitLabel));
  const counts = new Map<string, number>();
  for (const subtopic of subtopics) {
    for (const stem of new Set(headingStems(subtopic))) counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  for (const [stem, count] of counts) if (count * 2 > subtopics.length) shared.add(stem);
  return shared;
}

/**
 * Kapsam bekçisi: derste kendi ekranı olmayan alt konular. Bir alt konu, ayırt eden köklerinin en az yarısı TEK bir
 * ekranda geçiyorsa işlenmiş sayılır (ayırt eden kök yoksa bütün kökleri). Kaba bir ölçü (omurgayla aynı kök tanımı);
 * yalnız eksik alt konular için ek ekran ister, ders ya da kavram düşürmez. Kökü olmayan ad ölçülemez, işlenmiş sayılır.
 */
export function uncoveredSubtopics(
  screens: readonly LessonScreen[],
  subtopics: readonly string[],
  unitLabel = "",
): string[] {
  if (!subtopics.length) return [];
  const shared = sharedStems(subtopics, unitLabel);
  const told = screens.map((screen) => new Set(headingStems(screenWords(screen))));
  return subtopics.filter((subtopic) => {
    const all = [...new Set(headingStems(subtopic))];
    if (!all.length) return false;
    const distinct = all.filter((stem) => !shared.has(stem));
    const keys = distinct.length ? distinct : all;
    return !told.some((stems) => keys.filter((key) => stems.has(key)).length * 2 >= keys.length);
  });
}

/** Omurgadan ünitenin kendi alt konularını adlandıran başlıklar çıkar: onlar zaten zorunlu planda (iki kez istenmesin). */
export function backboneWithoutSubtopics(backbone: readonly string[], subtopics: readonly string[] | undefined): string[] {
  if (!subtopics?.length) return [...backbone];
  return backbone.filter((heading) => !subtopics.some((subtopic) => headingNamesTopic(heading, subtopic)));
}

/** Hazırlığın konu satırlarından okunan alt konular: etkin ünitenin kendi listesi ve öbür ünitelerinki. */
export type UnitSubtopics = { unit: string[]; others: string[] };

/**
 * Dersin alt konu kapsamı: düğümün kendi kısmı (`lessonSubtopics`, bölünmüş ünite) yoksa ünitenin bütün listesi.
 * `excluded`: ünitenin bu derse düşmeyen alt konuları (öbür derslerinde). `otherUnits`: öbür ünitelerin alt konuları
 * (bu ünitenin bir alt konusuyla aynı adı taşıyan çıkar). Alt konu yoksa üçü de boş: ders bugünkü gibi yazılır.
 */
export type LessonSubtopicScope = { subtopics: string[]; excluded: string[]; otherUnits: string[] };

export function resolveLessonSubtopicScope(input: {
  lessonSubtopics?: unknown;
  unitSubtopics?: unknown;
  otherUnitSubtopics?: unknown;
}): LessonSubtopicScope {
  const unit = parseSubtopicList(input.unitSubtopics);
  const own = parseSubtopicList(input.lessonSubtopics);
  const subtopics = own.length ? own : unit;
  if (!subtopics.length) return { subtopics: [], excluded: [], otherUnits: [] };
  const inLesson = new Set(subtopics.map(subtopicKey));
  const excluded = unit.filter((item) => !inLesson.has(subtopicKey(item)));
  const inUnit = new Set([...inLesson, ...excluded.map(subtopicKey)]);
  const otherUnits = parseSubtopicList(input.otherUnitSubtopics, { max: 80 }).filter((item) => !inUnit.has(subtopicKey(item)));
  return { subtopics, excluded, otherUnits };
}
