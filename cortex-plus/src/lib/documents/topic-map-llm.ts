import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import type { PageAnalysis } from "@/lib/documents/page-analysis";
import {
  draftFromLlmTopic,
  type TopicMapBuildResult,
} from "@/lib/documents/topic-map";
import {
  chapterHeadings,
  pageCarriesHeading,
  normalizeTopicTitle,
  targetTopicCount,
  topicTitleIssues,
  unrepresentedHeadings,
  topicTitleRule,
} from "@/lib/documents/topic-title";

/**
 * Model-backed topic map. The heuristic in {@link buildTopicMap} only recognises
 * a fixed trigonometry/curriculum fixture set; for any other document it emits
 * coincidental or "Sayfa N" titles. This reads the actual page text and returns
 * the document's own topic structure, the way a real syllabus map would look.
 *
 * Returns `null` on any failure (no key, insufficient credits, invalid output)
 * so the caller can fall back to the heuristic without surfacing an error.
 */

const llmSchema = z.object({
  topics: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(120),
        learningObjective: z.string().trim().min(4).max(240).nullable(),
        pageNumbers: z.array(z.number().int().positive()).min(1).max(60),
      }),
    )
    .min(1)
    .max(24),
});

const MAX_PAGE_CHARS = 900;

function pageDigest(pages: PageAnalysis[]): string {
  return pages
    .filter((page) => page.pageKind === "content" || page.pageKind === "uncertain")
    .map((page) => {
      const heading = page.headings[0] ? ` [${page.headings[0]}]` : "";
      const body = page.textContent.replace(/\s+/g, " ").slice(0, MAX_PAGE_CHARS);
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

export async function buildTopicMapLLM(
  service: SupabaseClient,
  documentId: string,
  userId: string,
  fileName: string,
  pages: PageAnalysis[],
): Promise<TopicMapBuildResult | null> {
  const contentPages = pages.filter(
    (page) => page.pageKind === "content" || page.pageKind === "uncertain",
  );
  if (contentPages.length < 2) return null;

  const contentNumbers = new Set(contentPages.map((page) => page.pageNumber));

  const target = targetTopicCount(contentPages.length);

  const backbone = chapterHeadings(contentPages);

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

  let outcome;
  try {
    outcome = await generateJson({
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
        `Konular belgedeki sıraya göre; her öğretim sayfası en az bir konuya bağlanmalı; yaklaşık ${target} konu hedefle.`,
      userPrompt: `Aşağıda "${fileName}" adlı ders belgesinin sayfa sayfa metni var. Belgenin konu haritasını çıkar: her ana konu için başlık, öğrenme hedefi ve o konunun geçtiği sayfa numaraları. Sadece bu belgede geçen konuları kullan, dışarıdan konu ekleme.

Bu belgede ${contentPages.length} öğretim sayfası var; yaklaşık ${target} konu bekleniyor. Bu bir hedef, kota değil — bir ya da iki fazlası sorun değil.

HİÇBİR ÖĞRETİM BÖLÜMÜ LİSTEDEN KAYBOLMAZ. Sayıyı tutturmak için bölüm atmak yasak. Sayıyı azaltmanın tek yolu birleştirmek, birleştirdiğinde de her iki bölümün adı başlıkta görünür — iki bölümü "ve" ile tek başlıkta topla; öğrenci listeye baktığında belgede öğrendiği hiçbir konuyu arayıp bulamamazlık etmemeli. Tersi de geçerli: tek başına sınanabilecek kadar dolu bir alt başlığı ayrı konuya çıkarabilirsin.

Kapak, içindekiler, önsöz, "öğrenme hedefleri"/"kazanımlar" listesi ve formül kartı gibi ön/arka bölümler konu DEĞİLDİR — bunlar öğretim içeriği taşımaz, konu olarak çıkarma. Bu sayfaları, anlattıkları asıl konuya ait sayfalardan biri say ya da hiç kullanma.

${pageDigest(contentPages)}`,
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
  } catch {
    return null;
  }

  // Bekçi hiçbir taslağı geçirmediyse en az bölüm kaybeden taslakla
  // devam et: belgeden çıkmış eksik bir harita, fikstüre ayarlı sezgisel
  // haritadan her zaman iyi.
  const data = outcome.ok ? outcome.data : bestDraft;
  if (!data) return null;

  const seen = new Set<string>();
  const topics = data.topics
    .map((topic) => {
      const pageNumbers = [...new Set(topic.pageNumbers)]
        .filter((n) => contentNumbers.has(n))
        .sort((a, b) => a - b);
      // Numara ve parantezli kısaltmayı burada kesiyoruz: modele
      // söylüyoruz ama söylemek yetmiyor, belgenin kendi başlığı güçlü
      // bir çekim yaratıyor.
      return { ...topic, title: normalizeTopicTitle(topic.title), pageNumbers };
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

  if (topics.length < 2) return null;

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

  // Modelin bağlamadığı sayfayı bir konuya iliştir ki kapsama %100'e
  // ulaşsın. Ama SAYFANIN KENDİ BAŞLIĞINA bak.
  //
  // Eskiden yalnızca "en yakın önceki konu" ölçüsü vardı ve komşu bölümü
  // sızdırıyordu: zemin belgesinin 12. sayfası "6. Yük Altında Gerilme
  // Dağılımı" başlığını taşıdığı hâlde 5. bölümün konusuna eklendi, ders
  // de iki bölümü komşu konudan anlattı.
  const linked = new Set<number>();
  for (const topic of topics) for (const n of topic.pageNumbers) linked.add(n);
  for (const page of contentPages) {
    if (linked.has(page.pageNumber)) continue;

    // Sayfanın başlıklarından biri bir konu başlığını işaret ediyor mu?
    let host = topicForHeadings(topics, page.headings ?? []);

    if (!host) {
      // İşaret yoksa eski ölçü: en yakın önceki konu.
      host = topics[0];
      for (const topic of topics) {
        if ((topic.pageNumbers[0] ?? Infinity) <= page.pageNumber) host = topic;
      }
    }
    host.pageNumbers = [...new Set([...host.pageNumbers, page.pageNumber])].sort(
      (a, b) => a - b,
    );
  }

  topics.sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));

  return { topics, mergedTitles: [] };
}
