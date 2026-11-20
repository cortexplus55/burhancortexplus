/**
 * Ana sohbetin öğrencinin kendi materyaline bağlanması (15 Kasım 2026, `/ogretmen` canlı stres testi).
 *
 * Canlıda öğrenci "Sor" çubuğundan kendi notundan özet istedi; hazırlık ve belge hesabında yüklü olduğu hâlde sohbet
 * "Genel" modda açıldığı için hiçbir belgeye bakılmadı ve öğretmen "not bu sohbette görünmüyor, yeniden yükle" dedi.
 * Bu modül modelsiz ve saftır (istemci de okuyabilir):
 *
 * - `matchChatMaterial`: mesajı öğrencinin hazırlıklarının adlarıyla, konu başlıklarıyla ve belge adlarıyla eşler;
 *   "N gün sonraki sınav" ifadesini sınav tarihine bağlar; hiçbiri yoksa ana ekranda seçili hazırlık geçerlidir.
 * - `detectChatIntent`: özet / son tekrar isteği ve sekiz çalışma aracından biri (test, deneme, kartlar, …).
 * - `buildChatActions`: cevabın altındaki gerçek stüdyo düğmeleri (adres sunucunun okuduğu yol adımlarından).
 * - Tura özel istem satırları: biçimi anlatır, konu örneği taşımaz.
 *
 * Eşleştirme kelime kökleriyle yapılır (ilk beş harf; Türkçe ekler sonda). Kod hiçbir ders ya da konu adı bilmez:
 * adlar öğrencinin kendi kayıtlarından gelir.
 */

import type { StudyNodeRef, StudyToolId } from "@/lib/learning/study-tools";
import {
  mockExamSetupHref,
  openStudyActivity,
  studyActivityHref,
  studyPodcastHref,
  studySketchVideoHref,
} from "@/lib/learning/study-tools";

export type ChatTopicCandidate = { id: string; label: string; documentTopicNodeId: string | null };

export type ChatPrepCandidate = {
  id: string;
  title: string;
  /** Hazırlığın ders / sınav türü (varsa); ad gibi eşlenir. */
  subject: string | null;
  /** İstanbul günüyle sınava kalan gün; tarih yoksa null. */
  daysLeft: number | null;
  topics: ChatTopicCandidate[];
};

export type ChatDocumentCandidate = { id: string; name: string };

export type ChatMaterialIndex = { preps: ChatPrepCandidate[]; documents: ChatDocumentCandidate[] };

export type MatchedPrep = { prep: ChatPrepCandidate; topic: ChatTopicCandidate | null };

export type ChatMaterialMatch = {
  preps: MatchedPrep[];
  /** Adı mesajda geçen belgeler (hazırlığa bağlı olmasa da). */
  documents: ChatDocumentCandidate[];
  /** named: ad / konu / belge adı; days: "N gün sonraki"; context: ana ekranda seçili hazırlık; none. */
  reason: "named" | "days" | "context" | "none";
  /** Mesaj öğrencinin kendi materyalinden söz ediyor ("yüklediğim not", "belgemden", "notumdan"). */
  materialCue: boolean;
};

const fold = (text: string) => text.toLocaleLowerCase("tr").normalize("NFC");

/** Eşleşmede kanıt sayılmayan sözcükler: çalışma dilinin genel sözcükleri (ders adı değil). */
const STOP = new Set(
  [
    "ve", "ile", "ya", "da", "de", "bir", "bu", "şu", "o", "ne", "için", "gibi", "daha", "çok", "en", "mi", "mı", "mu", "mü",
    "bana", "beni", "benim", "sen", "sana", "senin", "hocam", "lütfen", "şimdi", "sonra", "önce", "olan", "olarak",
    "ders", "dersi", "dersim", "dersten", "dersinden", "dersimden", "konu", "konusu", "konusundan", "konuyu", "konudan",
    "not", "notu", "notum", "notumu", "notumdan", "notundan", "notlar", "notları", "notlarım", "notlarımdan", "notlarından",
    "belge", "belgem", "belgemden", "belgeden", "dosya", "dosyam", "pdf", "sayfa", "sayfalık",
    "sınav", "sınavı", "sınavım", "sınavlar", "sınavlarım", "sınavlarımdan", "sınavımdan", "sınava", "sınavdan",
    "hazırlık", "hazırlığı", "hazırlığım", "hazırlıktan", "yüklediğim", "yükledim", "çalışma", "çalış",
    "özet", "özetle", "özeti", "özetini", "çıkar", "çıkart", "hazırla", "hazırlar", "oluştur", "yap", "ver", "anlat",
    "test", "testi", "deneme", "soru", "soruluk", "sorular", "gün", "günü", "kalan", "kaldı", "sonraki",
    "nasıl", "neden", "niye", "nedir", "mantığı", "kısa", "net", "tüm", "bütün", "genel", "giriş",
    // Başlıklarda sık geçen genel akademik sözcükler: tek başına bir hazırlığı ayırt etmez.
    "temel", "temelleri", "kavram", "kavramlar", "kavramları", "türleri", "çeşitleri", "özellikleri", "bölüm", "ünite",
    "yapı", "yapısı", "sistem", "sistemi", "konular", "kuralları", "yöntemleri", "uygulamaları", "örnekler",
  ].map(fold),
);

function words(text: string): string[] {
  return fold(text)
    .replace(/\.(pdf|docx?|pptx?|txt|jpe?g|png|heic)\b/gu, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !STOP.has(word));
}

/** Aynı kök: kısa sözcük birebir, uzunlarda ilk beş harf (Türkçe ekler sonda; "kuvveti" ~ "kuvvet"). */
function sameStem(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return a === b;
  const k = Math.min(5, a.length, b.length);
  return a.slice(0, k) === b.slice(0, k);
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Tek sözcüklük eşleşmenin güçlü olması (H3, 15 Kasım 2026): sözcükler aynı, ya da kısa olanın tamamı öbürünün başı
 * ("mayoz" ~ "mayozun", "kuvvet" ~ "kuvveti"), ya da en az altı harf ortak. Beş harflik ortak önek tek başına yetmez:
 * canlıda "karıştırıyorum" ile "Karışımlar" ("karış") eşleşip ilgisiz bir matematik sorusuna kimya hazırlığı bağlanmıştı.
 */
function strongStem(a: string, b: string): boolean {
  if (a === b) return true;
  const shared = commonPrefix(a, b);
  return (shared === Math.min(a.length, b.length) && shared >= 5) || shared >= 6;
}

/**
 * Bir adın mesajla örtüşmesi: adın içerik sözcüklerinden mesajda geçenler. İki sözcük geçince ya da tek ama en az beş
 * harfli ve güçlü (`strongStem`) bir sözcük geçince eşleşir. Puan: kapsanan oran + eşleşen sayı (çok sözcük örtüşen
 * öne geçer).
 */
export function phraseScore(
  phrase: string,
  messageWords: readonly string[],
  /** Sözcüğün ayırt ediciliği (1 / kaç başlıkta geçtiği); verilmezse hepsi 1. */
  weight: (word: string) => number = () => 1,
): number {
  const parts = [...new Set(words(phrase))];
  if (!parts.length) return 0;
  const hits = parts.filter((part) => messageWords.some((word) => sameStem(part, word)));
  if (!hits.length) return 0;
  if (hits.length === 1) {
    const only = hits[0]!;
    if (only.length < 5 || !messageWords.some((word) => strongStem(only, word))) return 0;
  }
  return hits.reduce((sum, word) => sum + weight(word), 0) + 0.05 * (hits.length / parts.length);
}

/** Kök başına kaç başlıkta geçtiği: birçok başlıkta geçen sözcük ("bölünme") tek başlıkta geçenden ("mayoz") zayıf. */
function stemWeights(phrases: readonly string[]): (word: string) => number {
  const lists = phrases.map((phrase) => [...new Set(words(phrase))]);
  return (word) => {
    const count = lists.filter((list) => list.some((item) => sameStem(item, word))).length;
    return 1 / Math.max(1, count);
  };
}

const DAYS_RE = /(\d{1,3})\s*gün\s*(?:sonra|sonraki|kala|kalan|kaldı)/u;
const NEAR_DAY_RE = /\b(bugün|yarın)(?:kü|ki)?\s+(?:olan\s+)?sınav/u;
const MATERIAL_CUE_RE =
  /yüklediğim|yükledim|not(?:um|umdan|umu|umdaki|larım|larımdan|larımdaki|undan|undaki|larından)\b|belge(?:m|mden|mdeki|deki)\b|dosya(?:m|mdan|mdaki)\b|pdf/u;

/**
 * Mesajın öğrencinin hazırlık / konu / belgesine bağlanması. Öncelik: adı geçen (hazırlık adı, ders, konu başlığı ya da
 * belge adı) → "N gün sonraki sınav" → ana ekranda seçili hazırlık. Seçili hazırlık yalnız hesabın kendi hazırlıklarından
 * biriyse kullanılır (istemciden gelen kimliğe güvenilmez).
 */
export function matchChatMaterial(
  message: string,
  index: ChatMaterialIndex,
  options: { contextPrepId?: string | null } = {},
): ChatMaterialMatch {
  const text = fold(message);
  const messageWords = words(message);
  const materialCue = MATERIAL_CUE_RE.test(text);

  const weight = stemWeights([
    ...index.preps.flatMap((prep) => [prep.title, prep.subject ?? "", ...prep.topics.map((topic) => topic.label)]),
    ...index.documents.map((doc) => doc.name),
  ]);
  const scored = index.preps
    .map((prep) => {
      const ownScore = Math.max(
        phraseScore(prep.title, messageWords, weight),
        prep.subject ? phraseScore(prep.subject, messageWords, weight) : 0,
      );
      let topic: ChatTopicCandidate | null = null;
      let topicScore = 0;
      for (const candidate of prep.topics) {
        const score = phraseScore(candidate.label, messageWords, weight);
        if (score > topicScore) {
          topicScore = score;
          topic = candidate;
        }
      }
      return { prep, topic, score: Math.max(ownScore, topicScore) };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  const documents = index.documents
    .map((doc) => ({ doc, score: phraseScore(doc.name, messageWords, weight) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((row) => row.doc);

  if (scored.length) {
    const best = scored[0]!.score;
    const preps = scored
      .filter((row) => row.score >= best - 0.05)
      .slice(0, 3)
      .map(({ prep, topic }) => ({ prep, topic }));
    return { preps, documents, reason: "named", materialCue };
  }

  const days = text.match(DAYS_RE);
  const near = text.match(NEAR_DAY_RE);
  const wantedDays = days ? Number(days[1]) : near ? (near[1] === "bugün" ? 0 : 1) : null;
  if (wantedDays != null) {
    const preps = index.preps.filter((prep) => prep.daysLeft === wantedDays).slice(0, 3);
    if (preps.length) return { preps: preps.map((prep) => ({ prep, topic: null })), documents, reason: "days", materialCue };
  }

  if (documents.length) return { preps: [], documents, reason: "named", materialCue };

  const context = options.contextPrepId ? index.preps.find((prep) => prep.id === options.contextPrepId) : undefined;
  if (context) return { preps: [{ prep: context, topic: null }], documents: [], reason: "context", materialCue };
  return { preps: [], documents: [], reason: "none", materialCue };
}

/* ---------------- Niyet ---------------- */

export type ChatTool = "quiz" | "written" | "flashcards" | "true_false" | "podcast" | "oral" | "video" | "cram";

export type ChatIntent = { summary: boolean; tool: ChatTool | null };

const TOOL_PATTERNS: [ChatTool, RegExp][] = [
  ["cram", /sınav sabahı|son dakika kağıdı|son dakika kâğıdı/u],
  ["written", /deneme sınavı|yazılı deneme|deneme\s+(?:hazırla|yap|oluştur|çöz|başlat)|yazılı\s+(?:sınav|deneme)\s+(?:hazırla|yap|oluştur)/u],
  ["true_false", /doğru\s*[\/\-–]?\s*yanlış/u],
  ["podcast", /podcast/u],
  ["oral", /sözlü\s*(?:sınav|deneme|yap|sor|çalış)|beni\s+sözlü/u],
  ["video", /video|çizimli/u],
  ["flashcards", /bilgi\s+kart|kart(?:lar)?(?:la|ı|ları)?\s+(?:çalış|tekrar|hazırla|oluştur|yap)|flash\s*card/u],
  // "Beni test et" çipi sohbette tek soru ister (araç değil); araç isteği hazırla/oluştur ya da soru sayısıyla gelir.
  ["quiz", /\d+\s*soruluk|test(?:i)?\s+(?:hazırla|oluştur|yap|başlat|çöz)|konu\s+testi|test\s+çözmek\s+istiyorum/u],
];

const SUMMARY_RE = /özet|özetle|son\s+tekrar|toparla|sınav\s+öncesi\s+(?:tekrar|hatırlat)/u;

export function detectChatIntent(message: string): ChatIntent {
  const text = fold(message);
  const tool = TOOL_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
  return { summary: SUMMARY_RE.test(text) && tool !== "cram", tool };
}

/* ---------------- Düğmeler ---------------- */

export type ChatAction = {
  kind: ChatTool | "lesson";
  label: string;
  /** Hangi hazırlık / konu için (birden çok hazırlık eşleşince ayırt etmek için). */
  context: string;
  href: string;
};

const ACTION_LABEL: Record<ChatAction["kind"], string> = {
  cram: "⚡ Sınav Sabahı Kağıdı'nı Aç",
  lesson: "📖 Konu Dersine Git",
  quiz: "🎯 Konu Testini Başlat",
  written: "📝 Yazılı Denemeyi Başlat",
  flashcards: "🃏 Kartlarla Çalış",
  true_false: "✅ Doğru / Yanlış Başlat",
  podcast: "🎧 Podcast'i Aç",
  oral: "🎙️ Sözlü Sınavı Başlat",
  video: "🎬 Çizimli Videoyu Aç",
};

/** Hazırlık eşleşmezse aracın Çalışma Stüdyosu sayfası (konu yazılarak üretilir). */
const STUDIO_HREF: Partial<Record<ChatTool, string>> = {
  quiz: "/studio/quiz",
  flashcards: "/studio/flashcard",
  true_false: "/studio/dogru-yanlis",
  podcast: "/studio/podcast",
  oral: "/studio/sozlu",
  written: "/studio/yazili",
};

const NODE_TOOL: Partial<Record<ChatAction["kind"], StudyToolId>> = {
  lesson: "lesson",
  quiz: "quiz",
  flashcards: "flashcards",
  true_false: "true_false",
  oral: "oral",
};

function prepAction(
  kind: ChatAction["kind"],
  match: MatchedPrep,
  nodes: readonly StudyNodeRef[],
): ChatAction | null {
  const { prep, topic } = match;
  const context = topic ? `${prep.title} · ${topic.label}` : prep.title;
  const action = (href: string): ChatAction => ({ kind, label: ACTION_LABEL[kind], context, href });
  const topics = prep.topics.map((item) => ({ id: item.id, label: item.label }));
  switch (kind) {
    case "cram":
      return action(`/deneme-sinavlari/${prep.id}/sinav-sabahi`);
    case "written":
      return action(mockExamSetupHref(prep.id));
    case "podcast":
      return action(studyPodcastHref(prep.id, topic?.label ?? null, topics));
    case "video":
      return action(studySketchVideoHref(prep.id, topic?.label ?? null, topics));
    default: {
      const tool = NODE_TOOL[kind];
      if (!tool) return null;
      const opened = openStudyActivity([...nodes], tool, topic ?? undefined);
      if (opened) return action(studyActivityHref(prep.id, opened.node.id, opened.topicQuery));
      const studio = kind === "lesson" ? null : STUDIO_HREF[kind as ChatTool];
      return studio ? action(studio) : null;
    }
  }
}

/**
 * Cevabın altındaki düğmeler: özet isteğinde Sınav Sabahı Kağıdı + konu dersi + konu testi; araç isteğinde o aracı
 * açan düğme (her eşleşen hazırlık için ayrı). Hazırlık yoksa araç Çalışma Stüdyosu'nda açılır. En çok 6 düğme.
 */
export function buildChatActions(input: {
  intent: ChatIntent;
  match: ChatMaterialMatch;
  nodesByPrep: ReadonlyMap<string, readonly StudyNodeRef[]>;
}): ChatAction[] {
  const kinds: ChatAction["kind"][] = input.intent.tool
    ? [input.intent.tool]
    : input.intent.summary
      ? ["cram", "lesson", "quiz"]
      : [];
  if (!kinds.length) return [];
  const actions: ChatAction[] = [];
  if (!input.match.preps.length) {
    const tool = input.intent.tool;
    const href = tool ? STUDIO_HREF[tool] : undefined;
    if (tool && href) actions.push({ kind: tool, label: ACTION_LABEL[tool], context: "Çalışma Stüdyosu", href });
    return actions;
  }
  for (const match of input.match.preps) {
    const nodes = input.nodesByPrep.get(match.prep.id) ?? [];
    for (const kind of kinds) {
      const action = prepAction(kind, match, nodes);
      if (action && !actions.some((item) => item.href === action.href)) actions.push(action);
    }
  }
  return actions.slice(0, 6);
}

/** Sunucunun cevaba eklediği düğme işareti (model yazamaz: sunucu modelin işaretlerini siler). */
export function actionMarker(action: ChatAction): string {
  const clean = (value: string) => value.replace(/[\]|\n]/g, " ").trim();
  return `[[arac:${action.kind}|${clean(action.label)}|${clean(action.context)}|${action.href}]]`;
}

const ACTION_KINDS = new Set<string>(["cram", "lesson", "quiz", "written", "flashcards", "true_false", "podcast", "oral", "video"]);
const ACTION_RE = /\[\[arac:([a-z_]+)\|([^|\]]+)\|([^|\]]*)\|(\/[^\]\s]+)\]\]/g;
/** Yalnız uygulama içi çalışma sayfaları (dış bağlantı ve başka yol kabul edilmez). */
const SAFE_ACTION_HREF = /^\/(?:deneme-sinavlari\/[0-9a-f-]{36}\/|studio\/)[\w\-/?=&%.]*$/i;

export function splitActionMarkers(content: string): { body: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  const body = content.replace(ACTION_RE, (_all, kind: string, label: string, context: string, href: string) => {
    if (ACTION_KINDS.has(kind) && SAFE_ACTION_HREF.test(href)) {
      actions.push({ kind: kind as ChatAction["kind"], label: label.trim(), context: context.trim(), href });
    }
    return "";
  });
  return { body, actions };
}

/** Model metnindeki düğme işaretleri silinir; düğmeyi yalnız sunucu ekler. */
export function stripModelActionMarkers(content: string): string {
  return content.replace(/\[\[arac:[^\]]*\]\]/g, "");
}

/* ---------------- Tura özel istem satırları ---------------- */

export function linkedMaterialLine(match: ChatMaterialMatch, hasEvidence: boolean): string {
  const names = [
    ...match.preps.map(({ prep, topic }) =>
      `«${prep.title}${topic ? ` · ${topic.label}` : ""}»${prep.daysLeft != null && prep.daysLeft >= 0 ? ` (sınava ${prep.daysLeft} gün)` : ""}`,
    ),
    ...match.documents.map((doc) => `«${doc.name}»`),
  ].slice(0, 4);
  const head =
    "ÖĞRENCİNİN KENDİ MATERYALİ — BU TUR (kesin): Öğrenci hesabındaki hazırlıklardan / notlardan söz ediyor" +
    (names.length ? `: ${names.join(", ")}.` : ".");
  const body = hasEvidence
    ? " Kaynak bloğundaki parçalar onun yüklediği nottandır; cevabı önce onlara dayandır."
    : " Bu tur için notunda eşleşen parça bulunamadı.";
  return (
    `${head}${body} "Not bu sohbette görünmüyor", "dosyayı yeniden yükle", "notunu paylaş" gibi bir şey ASLA yazma: ` +
    "not öğrencinin hesabında. İstediği kısım parçalarda yoksa bunu tek cümleyle söyle ve ders kitabı bilgisiyle anlat."
  );
}

export const SUMMARY_TURN_LINE =
  "ÖZET — BU TUR (kesin; 'en çok iki kutu' sınırı bu turda dört): Öğrenci sınav öncesi özet / son tekrar istedi. Kısa ve " +
  "taranabilir bir özet yaz: kilit kavramlar maddeler hâlinde (**terim**, cümle içinde ==kilit bilgi==); her formül kendi " +
  "`$$…$$` satırında; en az bir `> 📌 Sınav ipucu:` ve en az bir `> ⚠️ Sık hata:` kutusu; en sonda `> ✅ Akılda kalsın:` " +
  "kutusu (1-3 madde, her maddede tek ==kilit bilgi==). Sayı, eşik ve formül kaynak bloğundan ya da ders kitabından; " +
  "uydurma. Cevabın altında Sınav Sabahı Kağıdı, konu dersi ve konu testi düğmeleri var; onları kısa bir cümleyle an.";

const TOOL_NAME: Record<ChatTool, string> = {
  quiz: "konu testi",
  written: "yazılı deneme",
  flashcards: "kartlarla çalışma",
  true_false: "doğru / yanlış",
  podcast: "podcast",
  oral: "sözlü sınav",
  video: "çizimli video",
  cram: "Sınav Sabahı Kağıdı",
};

export function studioToolLine(tool: ChatTool): string {
  return (
    `ÇALIŞMA ARACI — BU TUR (kesin): Öğrenci ${TOOL_NAME[tool]} istedi. Cevabın altında bu aracı doğrudan açan düğme var; ` +
    "araç kendi ekranında, tıklanabilir şıklarla ve puanlamayla çalışır. Sohbetin içine soru listesi, test, kart destesi " +
    "ya da metin YAZMA; 'cevaplarını 1-C, 2-A diye yaz' deme. İki-üç cümleyle aracın ne yapacağını söyle ve öğrenciyi " +
    "düğmeye yönlendir."
  );
}

/** Sohbette örnek soru yazılırsa şık sayısı: ortaokul ve LGS 4, öbürleri 5 (`resolveOptionCount`). */
export function optionCountLine(count: 4 | 5): string {
  const letters = count === 5 ? "A, B, C, D, E" : "A, B, C, D";
  return (
    `ŞIK SAYISI (kesin): Sohbette çoktan seçmeli bir örnek soru yazarsan tam ${count} şık yaz (${letters}); ` +
    `${count === 5 ? "dört şıklı soru yazma" : "beş şık yazma"}.`
  );
}

const CONFUSED_RE =
  /kafam\s+(?:çok\s+)?karış|anlamad[ıi]m|anlayamad[ıi]m|mantığ[ıi]m\s+almıyor|aklım\s+almıyor|oturmad[ıi]|takıldım|çözemiyorum|kafamda\s+oturmuyor/u;
const WHY_RE = /\bneden\b|\bniye\b|niçin|nasıl\s+(?:oluyor|olur)|mantığı\s+ne|ezberlemeden|aklımda\s+(?:nasıl\s+)?tut|nasıl\s+hatırla/u;

export type TeacherTone = { confused: boolean; wantsWhy: boolean };

export function readTeacherTone(message: string): TeacherTone {
  const text = fold(message);
  return { confused: CONFUSED_RE.test(text), wantsWhy: WHY_RE.test(text) };
}

export const CONFUSED_TURN_LINE =
  "USTA HOCA — BU TUR (kesin; 'duygu cümlesiyle başlama' ve 'ilk cümle tam cevap' kuralları bu turda ikinci cümleden " +
  "başlar): Öğrenci kafasının karıştığını söylüyor. İlk cümlen sıcak ve güven veren bir öğretmen cümlesi olsun: sorusunun " +
  "yerinde olduğunu ve bu noktanın ilk bakışta çoğu öğrencinin aklını karıştırdığını kısaca söyle (kendi cümlenle, kalıp " +
  "tekrar etmeden). Sonra mantığı sade adımlarla aç; yeni terimi tek cümleyle açıkla.";

export const ANALOGY_TURN_LINE =
  "BENZETME — BU TUR (kesin): Öğrenci bir kavramın nedenini ya da ezberlemeden nasıl aklında tutacağını soruyor. Formülden " +
  "önce `> 💡 Benzetme:` kutusunda TEK cümlelik, somut ve gözle görülebilir bir günlük hayat benzetmesi ver; benzetme " +
  "kavramın gerçek nedenini doğru yansıtsın ve ders kitabının sınıflandırmasına uysun. `> ✅ Akılda kalsın:` kutusunda " +
  "aynı benzetmeyi kısa bir hatırlatma olarak kullanabilirsin.";

/** Ana sohbetin bu tura özel satırları (sistem isteminin sonuna). */
export function materialTurnLines(input: {
  match: ChatMaterialMatch | null;
  intent: ChatIntent;
  hasEvidence: boolean;
  optionCount: 4 | 5;
  tone: TeacherTone;
  linkLine: boolean;
}): string[] {
  const lines: string[] = [];
  // H3 (15 Kasım 2026): notta kanıt yoksa ve öğrenci kendi notunu anmadıysa hazırlık adı ve "bulunamadı" satırı isteme
  // gitmez; model onu öğrenciye aktarıp "Genel" sohbette hazırlık adı sızdırıyordu.
  if (input.match && input.linkLine && (input.hasEvidence || input.match.materialCue)) {
    lines.push(linkedMaterialLine(input.match, input.hasEvidence));
  }
  if (input.intent.tool) lines.push(studioToolLine(input.intent.tool));
  else if (input.intent.summary) lines.push(SUMMARY_TURN_LINE);
  if (input.tone.confused) lines.push(CONFUSED_TURN_LINE);
  if (input.tone.wantsWhy || input.tone.confused) lines.push(ANALOGY_TURN_LINE);
  lines.push(optionCountLine(input.optionCount));
  return lines;
}
