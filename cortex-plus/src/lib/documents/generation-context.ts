import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickStudyTopics } from "@/lib/learning/diagnostic";
import { pageSourceBlock } from "@/lib/learning/source-context";

/** Belge stüdyosunda konu seçimi fiziksel sayfa numaralarına dayanır. */
const PAGE_QUERY_BATCH = 200;
const MAX_CONTEXT_PAGES = 8;
/** "Belgenin tamamı": her konudan sayfa, en çok bu kadar (19 Ekim 2026; önce 6–8 sayfada kesiliyordu). */
export const WHOLE_DOCUMENT_PAGES = 14;

export type DocumentGenerationContext = {
  documentId: string;
  fileName: string;
  excerpt: string;
  /** Konunun okunabilir sayfaları (öğretmen motorları bunlardan bitişik çekirdek seçer). */
  topicPages: number[];
  /**
   * Belgenin tamamından mı? Öğrenci "belgenin tamamı" dediyse ya da yazdığı konu belgede
   * bulunamadıysa true; o zaman `topicPages` her konudan seçilmiş sayfalardır ve motor bitişik
   * çekirdeğe kesmez.
   */
  wholeDocument: boolean;
  /** Yazılan konu belgede bulundu mu (false: istek düşmedi, belgenin tamamına genişledi). */
  matched: boolean;
  /** İsteğin eşleştiği belge konusunun kendi adı (konu haritasından); başlıktan ya da tamamdan geldiyse yok. */
  topicTitle?: string;
};

type PageIndexRow = {
  page_number: number;
  headings: string[] | null;
  extraction_ok: boolean | null;
  page_kind: string | null;
};

function fold(text: string): string {
  return text.toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * "Belgenin tamamı", "tüm konular", "hepsi", "genel tekrar", "bütün belge"… 19 Ekim 2026'ya kadar
 * yalnız tek kelimelik "tümü/tamamı/genel/belge/doküman" tanınıyordu; "Belgenin tamamı" yazan
 * öğrencinin isteği "belge hazır değil" diye düşüyordu.
 */
export function isWholeDocumentRequest(topic: string): boolean {
  const text = fold(topic);
  if (!text) return true;
  // "Genel kimya" gibi gerçek konu adları tek başına "genel" diye tamama dönmesin: tek kelime
  // ancak yalnız başına yazıldıysa. Konusu belgede bulunamayan istek zaten tamama genişler.
  if (/^(belge|belgem|dokuman|genel|hepsi|tumu|tamami)$/.test(text)) return true;
  return /\b(tum|tumu|tamami|tamamini|tamamindan|butun|hepsi|hepsini|hepsinden|komple|bastan sona)\b/.test(text);
}

export function titleScore(title: string, query: string): number {
  const wanted = fold(query);
  const label = fold(title);
  if (!wanted || !label) return 0;
  if (wanted === label) return 10;
  if (label.includes(wanted)) return 5;
  const words = wanted.split(" ").filter((word) => word.length >= 3);
  if (!words.length) return 0;
  const found = words.filter((word) => label.split(" ").some((part) =>
    part.startsWith(word) || word.startsWith(part),
  )).length;
  return found / words.length >= 0.67 ? found / words.length : 0;
}

export function representativePages(numbers: number[], limit = MAX_CONTEXT_PAGES): number[] {
  const ordered = [...new Set(numbers)].filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  if (ordered.length <= limit) return ordered;
  if (limit <= 1) return [ordered[0]];
  return [...new Set(Array.from({ length: limit }, (_, index) =>
    ordered[Math.round((index * (ordered.length - 1)) / (limit - 1))],
  ))];
}

async function loadPageIndex(service: SupabaseClient, documentId: string): Promise<PageIndexRow[] | null> {
  const out: PageIndexRow[] = [];
  for (let offset = 0; ; offset += PAGE_QUERY_BATCH) {
    const { data, error } = await service.from("document_pages")
      .select("page_number, headings, extraction_ok, page_kind")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .range(offset, offset + PAGE_QUERY_BATCH - 1);
    if (error) return null;
    out.push(...((data ?? []) as PageIndexRow[]));
    if ((data ?? []).length < PAGE_QUERY_BATCH) break;
  }
  return out;
}

/**
 * Belgenin tamamı için sayfa seçimi: önce her konunun ilk sayfası (konu sırasıyla), sonra kalan
 * yer konular arasında sırayla dolar; konu haritası yoksa sayfalar eşit aralıkla. Böylece 8
 * sayfalık tarih notunda son iki dönem (II. Murad, kronoloji) de kaynağa girer.
 */
async function wholeDocumentPages(
  service: SupabaseClient,
  documentId: string,
  readable: number[],
  limit = WHOLE_DOCUMENT_PAGES,
): Promise<number[]> {
  if (readable.length <= limit) return readable;
  const allowed = new Set(readable);
  const { data: topics } = await service.from("document_topic_nodes")
    .select("id, title, parent_id, sort_order")
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });
  const study = pickStudyTopics(((topics ?? []) as { id: string; parent_id: string | null }[])
    .map((row) => ({ id: row.id, parentId: row.parent_id ?? null })));
  if (!study.length) return representativePages(readable, limit);
  const { data: links } = await service.from("document_topic_page_links")
    .select("topic_id, page_number")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });
  const rows = (links ?? []) as { topic_id: string; page_number: number }[];
  const byTopic = study
    .map((topic) => rows.filter((link) => link.topic_id === topic.id && allowed.has(link.page_number)).map((link) => link.page_number))
    .filter((pages) => pages.length);
  if (!byTopic.length) return representativePages(readable, limit);
  const picked = new Set<number>();
  for (let round = 0; picked.size < limit && byTopic.some((pages) => pages.length > round); round += 1) {
    for (const pages of byTopic) {
      if (picked.size >= limit) break;
      const page = pages[round];
      if (page != null) picked.add(page);
    }
  }
  return [...picked].sort((a, b) => a - b);
}

async function linkedTopicPages(
  service: SupabaseClient,
  documentId: string,
  topic: string,
): Promise<{ pages: number[]; title: string | null } | null> {
  const { data: topics, error } = await service.from("document_topic_nodes")
    .select("id, title, parent_id")
    .eq("document_id", documentId);
  if (error) return null;
  const nodes = (topics ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    parentId: (row.parent_id as string | null) ?? null,
  }));
  const study = pickStudyTopics(nodes);
  const chosen = study.map((row) => ({
    id: row.id,
    title: row.title,
    score: titleScore(row.title, topic),
  })).sort((a, b) => b.score - a.score)[0];
  if (!chosen || chosen.score <= 0) return { pages: [], title: null };
  const { data: links, error: linkError } = await service.from("document_topic_page_links")
    .select("page_number")
    .eq("document_id", documentId)
    .eq("topic_id", chosen.id)
    .order("page_number", { ascending: true });
  if (linkError) return null;
  return { pages: (links ?? []).map((row) => row.page_number as number), title: chosen.title };
}

/**
 * Konunun dışındaki sayfa içeriği bölüm olmasın (30 Ekim 2026, canlı tur: Araçlar'da "Enflasyon Türleri" özetinin üç
 * bölümünden ikisi aynı sayfadaki "kimler kazanır" ve "maliyetler" kısmıydı). Sayfa doğru seçiliyordu; konu haritası
 * sayfanın bir kısmını konuya bağlıyor, yazar sayfanın tamamını anlatıyordu. Belgenin tamamı istendiyse satır yok.
 */
export function topicScopeLine(context: Pick<DocumentGenerationContext, "wholeDocument" | "matched" | "topicTitle">, topic: string): string {
  if (context.wholeDocument || !context.matched) return "";
  const title = (context.topicTitle ?? topic).trim();
  if (!title) return "";
  return (
    `Öğrenci yalnız «${title}» konusunu istedi. KAYNAK sayfalarında başka başlıklar da geçebilir: onları bölüm yapma, ` +
    `yalnız «${title}» konusunu açıklamak için gerekirse bir cümleyle an. Kaynağın bütün noktalarını kapsama kuralı ` +
    "yalnız bu konunun kısımları için geçerli."
  );
}

/**
 * Yoldaki ve hazırlık sayfasındaki belgeli podcast: yalnız hazırlığın ÖBÜR konularının kısımları bölüm olmaz (30 Ekim 2026).
 *
 * İlk sürüm Araçlar satırını kullanıyordu ("sayfadaki başka başlıklar bölüm olmaz"). Aynı gün Astra ile yan yana kurulan
 * 4 sayfalık notta konu haritası "Miktar Teorisi ve Fisher'in Değişim Denklemi" adını verdi; aynı sayfadaki reel faiz ve
 * Phillips eğrisi başka hiçbir konunun değildi, o satırla podcast'te hiç anlatılmayacaktı. Araçlar'da öğrenci konuyu
 * kendisi yazdığı için dar kapsam doğru; hazırlıkta konu haritanın bir düğümü ve sayfasında kalan her şey onundur.
 * Öbür konu yoksa satır yok.
 */
export function prepTopicScopeLine(topic: string, siblings: readonly string[]): string {
  const title = topic.trim();
  const key = (value: string) => value.trim().toLocaleLowerCase("tr");
  const others = [
    ...new Map(siblings.filter((other) => other.trim() && key(other) !== key(title)).map((other) => [key(other), other.trim()])).values(),
  ].slice(0, 16);
  if (!title || !others.length) return "";
  return (
    `Öğrenci «${title}» konusunu çalışıyor. Hazırlıktaki şu konular ayrı adımlarda anlatılıyor: ` +
    `${others.map((other) => `«${other}»`).join(", ")}. KAYNAK sayfalarında onların kısımları da geçebilir: onları bölüm ` +
    "yapma, gerekirse bir cümleyle an. Sayfalarda kalan öbür bütün başlıklar bu konunun kapsamındadır; kaynağın bütün " +
    "noktalarını kapsama kuralı onlar için de geçerli."
  );
}

/** Hazırlığın konu adları (kapsam satırı için; okunamazsa boş: satır hiç yazılmaz, podcast bütün sayfayı anlatır). */
export async function prepTopicLabels(service: SupabaseClient, prepId: string): Promise<string[]> {
  const { data, error } = await service.from("exam_prep_topics").select("label").eq("exam_prep_id", prepId).limit(80);
  if (error) return [];
  return ((data ?? []) as { label: string | null }[]).map((row) => row.label ?? "").filter(Boolean);
}

export async function loadDocumentGenerationContext(
  service: SupabaseClient,
  userId: string,
  documentId: string,
  topic: string,
  options: { maxChars?: number } = {},
): Promise<DocumentGenerationContext | null> {
  const { data: doc, error: docError } = await service
    .from("documents")
    .select("id, file_name, status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (docError || !doc || doc.status !== "completed") return null;

  const fileName = (doc.file_name as string | null) ?? "belge";
  const index = await loadPageIndex(service, documentId);
  if (!index) return null;
  const readable = index.filter((page) =>
    page.extraction_ok !== false && page.page_kind !== "unreadable" && page.page_kind !== "blank",
  );
  if (!readable.length) return null;

  const readableNumbers = new Set(readable.map((page) => page.page_number));
  const allReadable = readable.map((page) => page.page_number);
  let selected: number[] = [];
  let whole = isWholeDocumentRequest(topic);
  let matched = true;
  let topicTitle: string | undefined;
  if (!whole) {
    const linked = await linkedTopicPages(service, documentId, topic);
    if (linked === null) return null;
    selected = linked.pages.filter((number) => readableNumbers.has(number));
    if (selected.length && linked.title) topicTitle = linked.title;
    /*
      Dosya adı ancak istek belgenin bir konusuna uymuyorsa "tamamı" sayılır (30 Ekim 2026). Önce dosya adına bakılıyordu:
      "Ekonomi-Enflasyon-ve-Para-Politikasi.pdf"de "Para Politikası" isteyen öğrenciye belgenin tamamı gidiyordu (dosya
      adı isteği içeriyor), oysa belgede tam o adlı bir konu vardı.
    */
    if (!selected.length && titleScore(fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "), topic) >= 5) whole = true;
    if (!whole && !selected.length) {
      const scored = readable.map((page) => ({
        number: page.page_number,
        score: Math.max(0, ...(page.headings ?? []).map((heading) => titleScore(heading, topic))),
      })).filter((page) => page.score > 0).sort((a, b) => b.score - a.score);
      selected = scored.map((page) => page.number);
    }
    // Konu belgede yoksa istek düşmez: belgenin tamamından hazırlanır (19 Ekim 2026; önce 409
    // "belge hazır değil" dönüyor, ekran çoğu zaman hiçbir şey söylemiyordu).
    if (!whole && !selected.length) {
      whole = true;
      matched = false;
    }
  }
  if (whole) selected = await wholeDocumentPages(service, documentId, allReadable);
  if (!selected.length) return null;

  const chosenNumbers = whole ? selected : representativePages(selected);
  const { data: pages, error: pagesError } = await service.from("document_pages")
    .select("page_number, text_content, formulas, extraction_ok, page_kind")
    .eq("document_id", documentId)
    .in("page_number", chosenNumbers)
    .order("page_number", { ascending: true });
  if (pagesError) return null;
  const usable = (pages ?? []).filter((page) =>
    page.extraction_ok !== false && page.page_kind !== "unreadable" &&
    ((page.text_content as string | null) ?? "").trim(),
  ).map((page) => ({
    pageNumber: page.page_number as number,
    text: (page.text_content as string | null) ?? "",
    formulas: ((page.formulas as string[] | null) ?? []).slice(0, 8),
  }));
  if (!usable.length) return null;

  let excerpt = pageSourceBlock(fileName, usable, true);
  if (options.maxChars != null && excerpt.length > options.maxChars) {
    // Sayfa atıf işaretleri ve sonda duran kaynak sınırı yarım kesilmesin.
    while (usable.length > 1 && excerpt.length > options.maxChars) {
      usable.pop();
      excerpt = pageSourceBlock(fileName, usable, true);
    }
  }
  return excerpt.trim()
    ? { documentId, fileName, excerpt, topicPages: selected, wholeDocument: whole, matched, ...(topicTitle ? { topicTitle } : {}) }
    : null;
}
