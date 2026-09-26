import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import type { PageAnalysis } from "@/lib/documents/page-analysis";
import {
  draftFromLlmTopic,
  type TopicDraft,
  type TopicMapBuildResult,
} from "@/lib/documents/topic-map";
import {
  isCalloutLabel,
  isProcedureStep,
  isRunningHeader,
  isSatelliteSection,
  normalizeTopicTitle,
  pageCarriesHeading,
  topicCeiling,
  topicScopeGuidance,
  topicTitleIssues,
  unrepresentedHeadings,
  topicTitleRule,
} from "@/lib/documents/topic-title";
import {
  polishModelTitle,
  topicMapFromExtractedText,
} from "@/lib/documents/topic-map-fallback";
import {
  consolidateTopics,
  foldedPageHost,
  headingsToGuard,
  preferredHeading,
} from "@/lib/documents/topic-fold";
import { topicMapTeacherNote } from "@/lib/learning/teacher-brain";

/**
 * Model-backed topic map. Reads the document's own pages and returns that
 * document's topic structure.
 *
 * A short note (one Word page, a short deck) may be a single topic. When the
 * model returns nothing usable there, the title is taken from the extracted
 * text. Long PDFs do not get that stand-in: a missing model map stays missing
 * instead of being replaced by an unrelated curriculum.
 */

const objectiveSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    const text = typeof value === "string" ? value.trim() : "";
    // Kısa ya da boş hedef taslağı düşürmesin; hedef zaten isteğe bağlı.
    return text.length >= 4 ? text.slice(0, 240) : null;
  });

const llmSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(120),
        learningObjective: objectiveSchema,
        // Boş dizi şemayı düşürmesin: tek sayfada numara sonradan konuyor.
        pageNumbers: z
          .array(z.number().int().positive())
          .max(60)
          .nullish()
          .transform((value) => value ?? []),
      }),
    )
    .min(1)
    .max(24),
});

const MAX_PAGE_CHARS = 900;
/**
 * Tek sayfalık Word belgesi 900 karakterde kesilirse konu haritası
 * yalnızca giriş paragrafını görür. Sayfa sonu olmayan notun tamamı
 * bu bütçeye sığsın.
 */
const SINGLE_PAGE_DIGEST_CHARS = 6000;

/**
 * Haritaya girecek sayfalar.
 *
 * Zengin sayfa (öğretim veya belirsiz) varsa yalnızca onlar. PDF yolu
 * bu yüzden değişmez: kısa bir OCR artığı haritaya karışmaz.
 *
 * Hiç zengin sayfa yoksa kısa slaytlar buraya girer. 40 karakterin
 * altındaki slayt "okunamadı" sayılıyor; metin duruyor, harita ise
 * boş sayfa sanıp "konular çıkarılamadı" diyordu.
 */
export function pagesForTopicMap(pages: PageAnalysis[]): PageAnalysis[] {
  const rich = pages.filter(
    (page) => page.pageKind === "content" || page.pageKind === "uncertain",
  );
  if (rich.length > 0) return rich;

  return pages.filter((page) => {
    if (
      page.pageKind === "blank" ||
      page.pageKind === "cover" ||
      page.pageKind === "toc" ||
      page.pageKind === "answer_key"
    ) {
      return false;
    }
    const letters = page.textContent.match(/\p{L}/gu)?.length ?? 0;
    return letters >= 12;
  });
}

/**
 * Kısa belgede tek konu geçerli bir haritadır.
 *
 * Word'de elle sayfa sonu yoksa belge tek sayfa kalır; iki slaytlık bir
 * sunum da tek konuya sığar. Uzun PDF'te tek konu, modelin haritayı
 * çökerttiği anlamına gelir — o eşik duruyor.
 */
export function minimumTopicCount(pages: PageAnalysis[]): number {
  if (pages.length < 2) return 1;
  const chars = pages.reduce((sum, page) => sum + page.charCount, 0);
  return chars < 1600 ? 1 : 2;
}

function pageDigest(pages: PageAnalysis[]): string {
  const limit = pages.length <= 1 ? SINGLE_PAGE_DIGEST_CHARS : MAX_PAGE_CHARS;
  return pages
    .map((page) => {
      const shown = preferredHeading(page.headings);
      const heading = shown ? ` [${shown}]` : "";
      // Çok sayfalı PDF özeti aynı kalsın: boşluklar düzleşir, sayfa
      // başına 900 karakter. Tek sayfalık notta paragraflar durur.
      const flat =
        pages.length <= 1
          ? page.textContent.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
          : page.textContent.replace(/\s+/g, " ");
      const body = flat.slice(0, limit);
      return `--- Sayfa ${page.pageNumber}${heading}\n${body}`;
    })
    .join("\n");
}

/** Türkçe katlama — karşılaştırma için. */
function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/**
 * Sayfanın başlıkları hangi konuyu işaret ediyor?
 *
 * Ölçü: başlığın ayırt edici kelimelerinin çoğu bir konu başlığında
 * geçiyorsa sayfa o konuya aittir. Hiçbiri yeterince tutmuyorsa null —
 * o zaman çağıran taraf "en yakın önceki" ölçüsüne düşüyor.
 */
export function topicForHeadings<T extends { title: string }>(
  topics: T[],
  headings: string[],
): T | null {
  for (const heading of headings) {
    // Kutu, adım ve tekrar bir bölüm adı gibi okununca sayfa yanlış konuya
    // gider: "3) Enerji denklemi" bütün tekrar sayfasını SFEE'ye taşıyordu.
    if (
      isRunningHeader(heading) ||
      isCalloutLabel(heading) ||
      isProcedureStep(heading) ||
      isSatelliteSection(heading)
    ) {
      continue;
    }
    const words = fold(heading)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4);
    if (words.length < 2) continue;
    for (const topic of topics) {
      const title = fold(topic.title);
      const hits = words.filter((word) => title.includes(word.slice(0, 5)));
      if (hits.length / words.length >= 0.6) return topic;
    }
  }
  return null;
}

/**
 * Atlanan sayfaları ait oldukları konuya bağla, sonra kaynak özetini yenile.
 * Modelden sonra geri eklenen bölüm listenin sonunda olabilir. Önceki konuyu
 * dizi sırasından seçmek, örneğin 18. sayfayı 15 yerine 7. sayfaya bağlardı.
 */
export function completeTopicPageLinks(
  topics: TopicDraft[],
  pages: PageAnalysis[],
): TopicDraft[] {
  if (!topics.length) return [];
  const ordered = topics
    .map((topic) => ({ ...topic, pageNumbers: [...topic.pageNumbers].sort((a, b) => a - b) }))
    .sort((a, b) => (a.pageNumbers[0] ?? Infinity) - (b.pageNumbers[0] ?? Infinity));
  const linked = new Set(ordered.flatMap((topic) => topic.pageNumbers));
  const contentPages = pages
    .filter((page) => page.pageKind === "content" || page.pageKind === "uncertain")
    .sort((a, b) => a.pageNumber - b.pageNumber);

  for (const page of contentPages) {
    if (linked.has(page.pageNumber)) continue;
    let host = topicForHeadings(ordered, page.headings ?? []);
    // Çözümlü örnek ve tekrar, belgenin sonunda dursa da anlattığı
    // kavrama gider. "En yakın önceki" o sayfayı komşu bölüme yazıyordu.
    if (!host) host = foldedPageHost(ordered, page.headings ?? []);
    if (!host) {
      host = ordered[0];
      let closestStart = Number.NEGATIVE_INFINITY;
      for (const topic of ordered) {
        const start = topic.pageNumbers[0] ?? Infinity;
        if (start <= page.pageNumber && start > closestStart) {
          host = topic;
          closestStart = start;
        }
      }
    }
    host.pageNumbers = [...new Set([...host.pageNumbers, page.pageNumber])].sort((a, b) => a - b);
    linked.add(page.pageNumber);
  }

  return ordered
    .sort((a, b) => (a.pageNumbers[0] ?? Infinity) - (b.pageNumbers[0] ?? Infinity))
    .map((topic, index) => ({
      ...draftFromLlmTopic(topic.title, topic.learningObjective, topic.pageNumbers, pages, index),
      prerequisites: topic.prerequisites,
      mergeKey: topic.mergeKey,
    }));
}

export async function buildTopicMapLLM(
  service: SupabaseClient,
  documentId: string,
  userId: string,
  fileName: string,
  pages: PageAnalysis[],
  /**
   * Öğretmen notu varsa vurgu için eklenir. Konu sayısını ve başlık
   * kuralını değiştirmez; not yoksa prompt bugünkü metindir.
   */
  teacherBrief?: string | null,
): Promise<TopicMapBuildResult | null> {
  const contentPages = pagesForTopicMap(pages);
  // İki sayfa şartı Word'ü düşürüyordu: sayfa sonu yoksa belge tek sayfa
  // kalıyor, metin çıkmış olsa bile harita hiç kurulmuyordu.
  if (!contentPages.length) return null;

  const contentNumbers = new Set(contentPages.map((page) => page.pageNumber));

  const backbone = headingsToGuard(contentPages);
  const ceiling = topicCeiling(contentPages.length);

  /**
   * Bekçiye takılan taslaklardan EN İYİSİ.
   *
   * Bekçi tavsiye, son çare değil: pediatri belgesinde hiçbir taslak
   * geçmeyince harita null döndü ve trigonometri fikstürüne düşüldü.
   * O yüzden reddedilen taslaklardan biriyle devam ediyoruz.
   *
   * Ama önce "sonuncusu" tutuluyordu ve bu zemin belgesinde geri tepti:
   * yedi konuluk harita altıya indi, hem "Yük Altında Gerilme Dağılımı"
   * hem "Kayma Mukavemeti" kayboldu. Sonuncu taslak en kötüsü olabilir.
   * Ölçü var: kaç bölüm temsil edilmiyor. En az kaybedeni sakla.
   */
  let bestDraft: z.infer<typeof llmSchema> | null = null;
  let bestMissing = Number.POSITIVE_INFINITY;

  let modelData: z.infer<typeof llmSchema> | null = null;
  try {
    const generated = await generateJson({
      service,
      userId,
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: await isPremiumUser(service, userId),
      verificationMode: "schema",
      // Taslak reddedildiğinde modele "geçmedi" demek yetmiyordu; hangi
      // bölümün kaybolduğunu söyleyince düzeltebiliyor.
      buildIndependent: (_c, parsed) => {
        const data = llmSchema.safeParse(parsed).data;
        if (!data) return { pedagogyIssues: ["Konu haritası şeması geçersiz."] };
        const titles = data.topics.map((t) => normalizeTopicTitle(t.title));
        const missing = unrepresentedHeadings(backbone, titles);
        return {
          pedagogyIssues: missing.length
            ? [`Şu bölümler hiçbir konu başlığında yok: ${missing.join(" | ")}`]
            : [],
        };
      },
      schemaHint:
        'JSON: {"topics":[{"title":string,"learningObjective":string|null,"pageNumbers":number[]}]}. ' +
        `title: belgenin kendi dilinde konu başlığı. ${topicTitleRule(backbone)} ` +
        "learningObjective: o konuda öğrencinin kazanacağı beceri, tek cümle. " +
        "pageNumbers: konunun işlendiği sayfa numaraları. " +
        `Konular belgedeki sıraya göre; her öğretim sayfası en az bir konuya bağlanmalı. ${topicScopeGuidance(contentPages.length)}`,
      userPrompt: `Aşağıda "${fileName}" adlı ders belgesinin sayfa sayfa metni var. Belgenin konu haritasını çıkar: her ana konu için başlık, öğrenme hedefi ve o konunun geçtiği sayfa numaraları. Sadece bu belgede geçen konuları kullan, dışarıdan konu ekleme.

Bu belgede ${contentPages.length} öğretim sayfası var. ${topicScopeGuidance(contentPages.length)}
En fazla ${ceiling} konu yaz.
${minimumTopicCount(contentPages) === 1 ? "Belge kısa: tek konu yeter. Başlık cümle olmasın; sonuna nokta ya da soru işareti koyma.\n" : ""}
${
  backbone.length
    ? "HİÇBİR ÖĞRETİM BÖLÜMÜ LİSTEDEN KAYBOLMAZ. Sayıyı azaltmanın tek yolu gerçekten aynı kavramı anlatan bölümleri birleştirmektir; birleştirince her iki bölümün adı başlıkta görünür. Bölüm atmak yasak."
    : "Numaralı kısa bölümlerin her biri ayrı konu değildir. Komşu bölümleri, birlikte çalışılan bir konu olacak şekilde birleştir. Yeni konu ancak yeni bir kavram kümesi varsa açılır."
}

Konu DEĞİLDİR, ait olduğu konunun sayfasına kat:
- Uyarı, kendini test, formül kutusu, çözümlü örnek ve benzeri kutu başlıkları
- Çözümlü örneğin ya da tekrar listesinin numaralı adımları
- Bölüm sonu tekrarı, mini vize ve formül haritası
- Aynı kavramın bir kısa bir uzun başlıkla tekrarı

Kapak, içindekiler, önsöz ve "öğrenme hedefleri"/"kazanımlar" listesi de konu değildir. Bu sayfaları anlattıkları asıl konuya bağla ya da hiç kullanma.

${pageDigest(contentPages)}` + topicMapTeacherNote(teacherBrief),
      parse: (raw) => {
        const parsed = llmSchema.safeParse(raw);
        if (!parsed.success) return null;
        // Bölüm atarak sayıyı tutturan taslak reddedilir; generateJson
        // geri bildirimle yeniden yazdırır. Reddedilenlerin en iyisi
        // saklanıyor — hiçbiri geçmezse onunla devam edilecek.
        const titles = parsed.data.topics.map((t) => normalizeTopicTitle(t.title));
        const missing = unrepresentedHeadings(backbone, titles).length;
        if (missing < bestMissing) {
          bestMissing = missing;
          bestDraft = parsed.data;
        }
        return missing ? null : parsed.data;
      },
    });
    if (generated.ok) modelData = generated.data;
  } catch {
    // Kredi, zaman aşımı, sağlayıcı. Kısa belgede aşağıda metinden
    // tek konu kurulur; uzun PDF'te harita boş kalır.
    modelData = null;
  }

  // Bekçi hiçbir taslağı geçirmediyse en az bölüm kaybeden taslakla
  // devam et: belgeden çıkmış eksik bir harita, fikstüre ayarlı sezgisel
  // haritadan her zaman iyi.
  const data = modelData ?? bestDraft;

  const seen = new Set<string>();
  const topics = (data?.topics ?? [])
    .map((topic) => {
      let pageNumbers = [...new Set(topic.pageNumbers)]
        .filter((n) => contentNumbers.has(n))
        .sort((a, b) => a - b);
      // Tek sayfalık belgede model bazen numarayı boş bırakıyor ya da
      // belgede olmayan bir sayfa yazıyor. Metin o sayfada.
      if (!pageNumbers.length && contentPages.length === 1) {
        pageNumbers = [contentPages[0].pageNumber];
      }
      // Numara ve parantezli kısaltmayı burada kesiyoruz: modele
      // söylüyoruz ama söylemek yetmiyor, belgenin kendi başlığı güçlü
      // bir çekim yaratıyor. Sondaki nokta da aynı: kuralı bozan işaret
      // silinir, başlığın kendisi durur.
      return { ...topic, title: polishModelTitle(topic.title), pageNumbers };
    })
    .filter((topic) => {
      if (!topic.pageNumbers.length) return false;
      // Kurala uymayan başlık, haritayı tümden düşürmektense elenir;
      // sayfaları aşağıda en yakın konuya bağlanıyor.
      if (topicTitleIssues(topic.title).length) return false;
      const key = topic.title.toLocaleLowerCase("tr").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((topic, index) =>
      draftFromLlmTopic(
        topic.title,
        topic.learningObjective,
        topic.pageNumbers,
        pages,
        index,
      ),
    );

  // Modelin hâlâ atladığı bölümü kendimiz ekle.
  //
  // Bekçi bölümü doğru işaretliyordu ama uyarı modele hiç ulaşmıyordu:
  // yeniden deneme promptu yalnızca hata KODLARINI taşıyor, metni değil.
  // Zemin belgesinde "6. Yük Altında Gerilme Dağılımı" üst üste üç
  // denemede de kayboldu — model ikna edilemedi.
  //
  // İkna etmeye gerek yok: bölümün başlığı da sayfaları da elimizde.
  // Başlığı temizleyip kendi konumuzu kuruyoruz. Böylece "hiçbir öğretim
  // bölümü listeden kaybolmaz" bir temenni değil, garanti oluyor.
  const shipped = topics.map((t) => t.title);
  for (const heading of unrepresentedHeadings(backbone, shipped)) {
    const title = normalizeTopicTitle(heading);
    if (topicTitleIssues(title).length) continue;
    if (seen.has(title.toLocaleLowerCase("tr").trim())) continue;
    const pageNumbers = contentPages
      .filter((page) => pageCarriesHeading(page, heading))
      .map((page) => page.pageNumber)
      .sort((a, b) => a - b);
    if (!pageNumbers.length) continue;
    seen.add(title.toLocaleLowerCase("tr").trim());
    topics.push(draftFromLlmTopic(title, null, pageNumbers, pages, topics.length));
  }

  // Kutu, adım ve kısa/uzun çift burada elenir. Sayfa metni durur.
  // Model susup hiçbir bölüm bırakmadıysa ve belgenin kendi numaralı
  // bölümleri varsa harita onlardan kurulur. Numarasız uzun PDF'te
  // uydurma müfredat yok: liste boş kalır.
  const consolidated = consolidateTopics(
    topics.map((topic) => ({
      title: topic.title,
      learningObjective: topic.learningObjective,
      pageNumbers: topic.pageNumbers,
      prerequisites: topic.prerequisites,
    })),
    contentPages,
    contentPages.length,
  );

  if (consolidated.topics.length < minimumTopicCount(contentPages)) {
    // Tek konunun yeterli olduğu kısa belgede model boş döndüyse metin
    // duruyordur. Başlığı belgeden kur; uzun PDF'in numaralı bölümü de
    // yoksa harita boş kalır.
    if (minimumTopicCount(contentPages) === 1) {
      return topicMapFromExtractedText(contentPages, pages, fileName);
    }
    return null;
  }

  const redrafted = consolidated.topics.map((topic, index) => ({
    ...draftFromLlmTopic(
      topic.title,
      topic.learningObjective,
      topic.pageNumbers,
      pages,
      index,
    ),
    prerequisites: topic.prerequisites ?? [],
  }));

  // Modelin bağlamadığı sayfayı bir konuya iliştir ki kapsama %100'e
  // ulaşsın. Ama SAYFANIN KENDİ BAŞLIĞINA bak.
  //
  // Eskiden yalnızca "en yakın önceki konu" ölçüsü vardı ve komşu bölümü
  // sızdırıyordu: zemin belgesinin 12. sayfası "6. Yük Altında Gerilme
  // Dağılımı" başlığını taşıdığı hâlde 5. bölümün konusuna eklendi, ders
  // de iki bölümü komşu konudan anlattı.
  return {
    topics: completeTopicPageLinks(redrafted, pages),
    mergedTitles: consolidated.mergedTitles,
  };
}
