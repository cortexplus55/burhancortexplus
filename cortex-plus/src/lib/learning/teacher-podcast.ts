import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { coercePodcastDraft, podcastScriptText, type PodcastEpisode } from "@/lib/learning/podcast-episode";
import {
  DUO_NARRATOR_SCHEMA,
  DUO_TURN_RULE,
  podcastDuoBrief,
  podcastLengthSpec,
  type PodcastLength,
} from "@/lib/learning/podcast-formats";
import { podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import { SINGLE_NARRATOR_SCHEMA, podcastNarrationBrief } from "@/lib/learning/teacher-brain";
import { isScaffoldHeading } from "@/lib/learning/teaching-standards";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import { parseIssues, sourceText, type TeacherIssue, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { examPointsBlock } from "@/lib/learning/exam-points";

/**
 * Öğretmen podcast motoru (2 Ekim 2026, ürün sahibinin kararı: tüm içerik
 * yeni motora). Ders motorunun aynası: temiz çekirdek sayfalar (ve varsa
 * aynı konunun denetlenmiş dersi) → tek öğretmen istemi → belgeyle eşleme →
 * modelin düzeltmesi. Kod metne bir şey EKLEMEZ, cümle silmez; yalnız
 * gösterim/seslendirme biçimine çevirir (H₂O → "H iki O") ve denetler.
 *
 * Eski yol (podcast-episode.ts → generatePodcastEpisode) taslağı
 * repairTurkishSurface + repairQuantitative ile değiştiriyor, tutmayan
 * satırları dropLines ile siliyordu.
 */

export type TeacherPodcastInput = {
  topicLabel: string;
  prepTitle: string;
  pages: { page: number; text: string }[];
  mode?: TeacherLessonMode;
  length: PodcastLength;
  /** Aynı konunun öğretmen motorundan geçmiş dersi (özet metni); varsa podcast onun sesli hâli. */
  lessonText?: string;
  /** Müfredat ağırlığı / kapsam satırı; yoksa boş. */
  syllabusLine?: string;
  learnerLine?: string;
  /** Öğretmen analizinin "Sınavda sorulur" maddeleri (18 Ekim 2026). */
  examPoints?: string[];
  runningHeaders?: string[];
};

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Her olgu, tanım, sayı, formül, tarih ve sınıflandırma yalnızca KAYNAK'tan (ve verilmişse " +
  "öğrencinin aynı konudaki DERS'inden) gelir. Kaynakta yoksa söyleme; genel kültürden ekleme — tek istisna: kaynak bir " +
  "olgunun nedenini ya da sınavda sorulan kesin bilgisini vermiyorsa en çok iki yerde, cümleye 'Belgende geçmiyor ama " +
  "bilmen iyi olur:' diye başlayarak ders kitaplarında tartışmasız, güncel olarak değişmeyen bir bilgiyi söyleyebilirsin. " +
  "Kaynaktaki bozuk ya da " +
  "yanlış yazılmış kelimeleri doğru Türkçeyle söyle; kaynakta açıkça bozuk bir cümle varsa kaynağın kendi örnekleriyle " +
  "tutarlı anlamını söyle ve bundan söz etme.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Konuyu sınav müfredatındaki yerleşik, ders kitaplarında " +
  "tartışmasız bilgiyle anlat. Emin olmadığın sayı, tarih, madde numarası, eşik ya da kuralı söyleme; güncel olarak " +
  "değişebilecek bilgiyi verme. Aşağıda 'kaynak' denen her yer konunun yerleşik bilgisi anlamına gelir.\n\n";

/*
  Kulak kuralları (20 Ekim 2026, kör kıyas: podcast'imiz "robot gibi" bulundu). Gelişim basamakları
  tablosunun 21 hücresi satır satır okundu; "kendi eğrisi" beş kez söylendi; bölümler fikir değil
  liste taşıdı. Yazar (AKIŞ) ve denetçi (H, I maddeleri) TABLE_RULE ile REPEAT_RULE'u aynen okur.
*/
export const TABLE_RULE =
  "Tabloyu ya da listeyi satır satır okuma: bir konuşma sırası (tek öğretmende bir paragraf) en çok 3 liste öğesi " +
  "taşır. Tablonun bilgisini 2-3 karşılaştırmaya çevir (X'te şu, Y'de bu; fark şu, çünkü …).";
export const REPEAT_RULE =
  "Aynı ifadeyi ya da aynı noktayı son bölüm dışında bütün podcast'te en çok iki kez söyle; üçüncü kez söyleyeceğin " +
  "yerde yeni bir bilgi, neden ya da örnek söyle.";
/** Yalnız yazara: bölümün şekli serbest kalsın diye sıra dayatmaz ('Her bölüm: ne olduğu' kalıbı geri gelmesin). */
const CHAPTER_RULE =
  "Her bölüm (son tekrar bölümü hariç) tek bir fikir taşır: fikrin kendisi, nedeni ve onu gösteren bir somut vaka " +
  "ya da örnek; sıraları bölümden bölüme değişebilir.";

// Örnek konuşma sırası çok cümleli: model örneği kuraldan çok izliyor (16 Ekim 2026 canlı podcast'te
// "text":"tek cümle" örneği yüzünden sıraların %83'ü tek cümleydi).
// 17 Ekim 2026: örnekte Kerem yalnız "kısa soru" yazınca canlıda Kerem'in bütün sıraları tek cümle
// soruydu; örnek Kerem'in anlattığı bir sırayı da gösterir.
const SCHEMA_DUO =
  '{"title":"…","chapters":[{"title":"kavramın adı","lines":[' +
  '{"speaker":"kerem","text":"soru ya da merak"},' +
  '{"speaker":"ada","text":"konuşma sırası: 2-4 cümle — olgu, nedeni, sonucu ya da örneği"},' +
  '{"speaker":"kerem","text":"1-3 cümle: bir örnek (kaynağı anmadan), kendi sözleriyle toparlama ya da bir adım ileri"},' +
  '{"speaker":"ada","text":"tamamlar ya da yeni bilgiyi açar: 1-4 cümle"}]}]}';
const SCHEMA_SINGLE =
  '{"title":"…","chapters":[{"title":"kavramın adı","lines":[' +
  '{"speaker":"ada","text":"paragraf: 2-4 cümle — olgu, nedeni, sonucu ya da örneği"}]}]}';

function system(mode: TeacherLessonMode, length: PodcastLength): string {
  const spec = podcastLengthSpec(length);
  const duo = spec.speakers === "duo";
  return (
    "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor; konuyu kulaktan dinleyerek öğrenecek. " +
    (mode === "topic"
      ? "Belgesi yok; konuyu ondan duydun.\n\n"
      : "Sana kendi ders belgesini verdi; anlatımın bu belgeye dayanır.\n\n") +
    (mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    `BİÇİM: ${spec.brief} ${spec.style}`.trim() +
    "\n" +
    (duo ? podcastDuoBrief() : podcastNarrationBrief()) +
    "\n" +
    (duo ? DUO_NARRATOR_SCHEMA : SINGLE_NARRATOR_SCHEMA) +
    "\n\n" +
    "AKIŞ:\n" +
    `- ${spec.minChapters}-${spec.maxChapters} bölüm. Bölüm başlığı o bölümde konuşulan kavramın adı; 'Giriş', 'Tanım', ` +
    "'Örnek', 'Özet', 'Yaygın hata' başlık değildir.\n" +
    "- İlk cümle dinleyeni düşündüren bir kanca; 'bu bölümde şunları öğreneceğiz' gibi boş cümle yok.\n" +
    "- Zıtlıkla anlat (X böyledir, Y ise şöyle); karıştırılan iki kavramı açıkça ayır.\n" +
    `- ${CHAPTER_RULE}\n` +
    `- ${TABLE_RULE}\n` +
    `- ${REPEAT_RULE}\n` +
    "- Gündelik hayattan kısa, somut bir sahne kurabilirsin; yeni bilgi (sayı, kural, tarih, sonuç) taşımaz.\n" +
    (length === "ozet"
      ? ""
      : "- Bir ya da iki yerde dinleyene soru sor: satır 'Dur ve düşün:' ile başlar, hemen sonraki satır 'Cevap:' ile " +
        "başlar ve cevabı verir.\n" +
        "- Son bölüm üç kısa tekrar satırıdır; her satır sınavda işe yarayan bir kesin bilgi.\n") +
    "- Örnek açarsan verileni, işlemi ve birimli sonucu aynı bölümde söyle; yarım bırakma. Eşitliğin iki tarafını hesapla.\n" +
    "- Formülü ve üssü simgeyle yaz (H₂O, 10²³, n = m/M); ondalık virgül kullan.\n\n" +
    // 20 Ekim 2026: Kerem bir podcast'te dört kez "Notlarındaki örnekte …" dedi. Kod da yakalar
    // (`podcastStructureIssues`, düzeltme turuna yollar); burada yazara söylenir.
    "YAZMA: 'Kaynak:', sayfa numarası, 'PDF', 'belgede yazdığı gibi', 'belgende yazan', 'notlarında', 'notlarındaki', " +
    "'notlarına göre', iç not. Bilgiyi kaynağa değil konuya bağla ('Notlarındaki örnekte 9 ayda…' değil, " +
    "'9 aylık bir bebek…')." +
    (mode === "topic" ? "" : " 'Belgende geçmiyor ama bilmen iyi olur:' etiketi bu yasağın dışındadır.") +
    "\n\n" +
    `${CONTENT_STYLE}\n\n` +
    `Yalnızca bu şemada JSON döndür:\n${duo ? SCHEMA_DUO : SCHEMA_SINGLE}`
  );
}

export function podcastSystem(mode: TeacherLessonMode = "document", length: PodcastLength): string {
  return system(mode, length);
}

export function podcastUserPrompt(input: TeacherPodcastInput): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    examPointsBlock(input.examPoints, "podcast"),
    input.syllabusLine ? `KAPSAM: ${input.syllabusLine}` : "",
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    input.lessonText ? `DERS (öğrencinin aynı konuda okuduğu, belgeden hazırlanmış ders):\n${input.lessonText}` : "",
    input.mode === "topic" ? "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle anlat)" : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const VERIFY_DOCUMENT =
  "Sen titiz bir içerik denetçisisin. Bir podcast metnini, dayandığı KAYNAK (ve verilmişse DERS) ile karşılaştırıyorsun. " +
  "Şunları bul:\n" +
  "A) Kaynakta dayanağı olmayan olgu, tanım, sayı, formül ya da sınıflandırma (yeni bilgi taşımayan gündelik sahne sorun değil; " +
  "'Belgende geçmiyor ama bilmen iyi olur:' diye başlayan cümle kaynakta olmayabilir, onu A'ya göre değil F'ye göre denetle; " +
  "'bu konu sınavda ağırlıklı' ya da 'sınav kapsamında değil' cümlesi hazırlığın konu listesinden gelir, kaynak iddiası değildir, " +
  "A sayma).\n" +
  "B) Kaynakla çelişen ya da anlamı değiştiren ifade.\n" +
  "C) Yanlış hesap, tutmayan eşitlik, yarım bırakılmış örnek.\n" +
  "D) 'Cevap:' satırının sorulan soruya yanlış ya da eksik cevap vermesi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "F) 'Belgende geçmiyor ama bilmen iyi olur:' cümlesinde yanlış, tartışmalı ya da güncel olarak değişebilecek bilgi; " +
  "bu işaretle ikiden fazla cümle; kaynakta olmayan bilginin bu işaret olmadan söylenmesi A'dır.\n" +
  "Kaynakta açıkça bozuk bir cümlenin kaynağın kendi örnekleriyle tutarlı anlamıyla söylenmesi sorun değildir.\n";

const VERIFY_TOPIC =
  "Sen titiz bir içerik denetçisisin. Belgesi olmayan bir podcast metnini doğruluk açısından denetliyorsun. Şunları bul:\n" +
  "A) Yanlış ya da tartışmalı olgu, tanım, sayı, formül; emin olunamayacak kadar ayrıntılı ya da güncel değişebilecek bilgi.\n" +
  "B) Ders içinde çelişki.\n" +
  "C) Yanlış hesap, tutmayan eşitlik, yarım bırakılmış örnek.\n" +
  "D) 'Cevap:' satırının sorulan soruya yanlış ya da eksik cevap vermesi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n";

/*
  Kulak maddeleri (20 Ekim 2026, kör kıyas). Yazarın okuduğu kuralların aynısı (`DUO_TURN_RULE`,
  `REPEAT_RULE`, `TABLE_RULE`). Kurtarmada G ve H satırı çıkar, I (tablo okuma) yalnız düzeltme
  turuna gider ve kurtarmada korunur: okunan satırları silmek bütün bir bölümü düşürebiliyordu.
  Üçü de ikinci taslak sebebi olmaz (`salvagePodcast`).
*/
const EAR_ITEMS =
  `G) (İki konuşmacılı metinde) Konuşma kuralı çiğnenmiş: «${DUO_TURN_RULE}» where: cevapsız ya da başka bir şeyle ` +
  "cevaplanmış sorunun satırı; doğruyu kendisi söyledikten sonra yanılgı itiraf eden satır (ve ona bağlı 'şimdi " +
  "anlıyorum' satırı); kendi önceki cümlesiyle çelişen satır.\n" +
  `H) Tekrar kuralı çiğnenmiş: «${REPEAT_RULE}» where: üçüncü ve sonraki geçişlerin satırları, ilk ikisi değil.\n` +
  `I) Kulak yükü kuralı çiğnenmiş: «${TABLE_RULE}» where: o konuşma sırasının ilk satırı.\n` +
  "G, H ve I'da where her zaman tek satırdır: chapters[i].lines[j].\n";

function verifyJson(mode: TeacherLessonMode): string {
  return (
    (mode === "topic" ? "A-E ve G-I 'high'." : "A-I 'high'.") +
    " Şunlar 'low': tekdüze anlatım, uzunluk, bilgi taşımayan cümle.\n" +
    'JSON döndür: {"issues":[{"where":"chapters[1].lines[3]","rule":"G","severity":"high","problem":"…","fix":"…"}]}. ' +
    "rule: maddenin harfi. Sorun yoksa issues boş dizi."
  );
}

export function podcastVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (mode === "topic" ? VERIFY_TOPIC : VERIFY_DOCUMENT) + EAR_ITEMS + verifyJson(mode);
}

export type PodcastIssue = TeacherIssue & { rule?: string };

/**
 * Denetçinin sorunları ve madde harfi (20 Ekim 2026). Harf kurtarmada önemli: G/H/I satırı ikinci
 * taslak sebebi olmaz, I hiç silinmez. Ortak `parseIssues` bilinmeyen alanı atıyor; harf burada
 * eklenir. Harf yoksa (eski davranış) sorun A-F gibi işlenir.
 */
export function parsePodcastIssues(raw: unknown): PodcastIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const parsed = parseIssues({ issues: [item] });
    if (!parsed.length) return [];
    const rule = (item as { rule?: unknown } | null)?.rule;
    const letter = typeof rule === "string" && /^[A-I]$/i.test(rule.trim()) ? rule.trim().toUpperCase() : undefined;
    return parsed.map((issue) => (letter ? { ...issue, rule: letter } : issue));
  });
}

/** Döngünün sorun satırı: `[where] (G) sorun → düzeltme`. Kurtarma harfi bu biçimden okur. */
export function podcastIssueLine(issue: PodcastIssue): string {
  return `[${issue.where}]${issue.rule ? ` (${issue.rule})` : ""} ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`;
}

export function podcastVerifyUserPrompt(episode: PodcastEpisode, input: TeacherPodcastInput): string {
  if (input.mode === "topic") {
    return `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n(Belgesiz podcast.)\n\nPODCAST (JSON):\n${JSON.stringify(publicShape(episode))}`;
  }
  const source = [input.lessonText ? `DERS:\n${input.lessonText}` : "", `KAYNAK:\n${sourceText(input.pages)}`]
    .filter(Boolean)
    .join("\n\n");
  // Termodinamik denemesi: "300 K, m = 1 kg, R = 0,287 → 59,7 kJ" örneği
  // belgede yoktu ve denetçi kaçırdı. Karar yine denetçinin: kaynaktaki
  // sayılardan hesaplanmış ara sonuç sorun değil.
  const stray = podcastNumbersOutsideLesson(podcastScriptText(episode), source);
  const hint = stray.length
    ? `\n\nKAYNAKTA GEÇMEYEN SAYILAR: ${stray.join(", ")}. Her biri kaynaktaki sayılardan hesaplanmış değilse dayanaksızdır (A).`
    : "";
  return `${source}\n\nPODCAST (JSON):\n${JSON.stringify(publicShape(episode))}${hint}`;
}

export function podcastFixSystem(mode: TeacherLessonMode = "document", length: PodcastLength): string {
  return (
    "Sen aynı podcast'i yazan öğretmensin. Denetçinin bulduğu sorunları düzelt: dayanaksız bilgiyi çıkar ya da " +
    "kaynaktaki doğrusuyla değiştir, hesabı düzelt, yarım örneği tamamla ya da çıkar, bozuk cümleyi yeniden yaz. " +
    "Cevapsız soruyu cevaplat ya da çıkar, tablo okumasını karşılaştırmaya çevir, üçüncü tekrarı yeni bilgiyle " +
    "değiştir, kaynağa göndermeyi kaldır. Önerilen " +
    "düzeltme ('→' sonrası) varsa uygula. Listedeki her yeri mutlaka değiştir; metni aynen geri döndürme. Sorunsuz " +
    "kısımları değiştirme. Kurallar ve şema aynı:\n\n" +
    system(mode, length)
  );
}

export function podcastFixUserPrompt(episode: PodcastEpisode, problems: string[], input: TeacherPodcastInput): string {
  return [
    podcastUserPrompt(input),
    `ŞU ANKİ PODCAST (JSON):\n${JSON.stringify(publicShape(episode))}`,
    `DÜZELTİLECEK SORUNLAR:\n${problems.map((problem, index) => `${index + 1}. ${problem}`).join("\n")}`,
    "Düzeltilmiş podcast'in tamamını aynı şemayla JSON olarak döndür.",
  ].join("\n\n");
}

/** Model ve denetçi "Dur ve düşün:" / "Cevap:" işaretli düz metni görür. */
function publicShape(episode: PodcastEpisode) {
  return {
    title: episode.title,
    chapters: episode.chapters.map((chapter) => ({
      title: chapter.title,
      lines: chapter.lines.map((line) => ({
        speaker: line.speaker,
        text: line.beat === "ask" ? `Dur ve düşün: ${line.text}` : line.beat === "reveal" ? `Cevap: ${line.text}` : line.text,
      })),
    })),
  };
}

/** Taslağı bölüm/satır yapısına oturtur (cümlelere böler, gösterim/seslendirme biçimi). */
export function parseTeacherPodcast(raw: unknown, input: Pick<TeacherPodcastInput, "length" | "topicLabel">): PodcastEpisode | null {
  return coercePodcastDraft(raw, { length: input.length, topicLabel: input.topicLabel });
}

/**
 * Yapı denetimi (saf). Düzeltmez; düzeltme turuna yollar. Hesap denetimi
 * (auditQuantitative) yalnız tutmayan eşitliği söyler, metne dokunmaz.
 */
export function podcastStructureIssues(episode: PodcastEpisode): string[] {
  const issues: string[] = [];
  const spec = podcastLengthSpec(episode.length);
  if (episode.chapters.length < spec.minChapters || episode.chapters.length > spec.maxChapters) {
    issues.push(`Bölüm sayısı ${episode.chapters.length}; ${spec.minChapters}-${spec.maxChapters} olmalı.`);
  }
  episode.chapters.forEach((chapter, index) => {
    if (isScaffoldHeading(chapter.title)) issues.push(`chapters[${index}].title: şablon başlık; kavramın adını yaz.`);
  });
  const lines = episode.chapters.flatMap((chapter) => chapter.lines);
  if (lines.some((line) => /kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b/i.test(line.text))) {
    issues.push("Metinde kaynak/sayfa notu var; çıkar.");
  }
  // Satır numarası bilerek yok: kurtarma satır numarasını silme sayar, bu cümle çoğu zaman gerçek
  // bir bilgi taşıyor ("Notlarındaki örnekte 9 ayda desteksiz oturur"). Yalnız düzeltme turuna gider.
  const attributed = lines.filter((line) => ATTRIBUTION.test(line.text)).slice(0, 3);
  if (attributed.length) {
    const quotes = attributed.map((line) => `"${line.text.slice(0, 60)}…"`).join(", ");
    issues.push(`Kaynağa gönderme var (${quotes}); bilgiyi kaynağı anmadan söyle.`);
  }
  if (episode.length !== "ozet") {
    const asks = lines.filter((line) => line.beat === "ask").length;
    const reveals = lines.filter((line) => line.beat === "reveal").length;
    if (asks < 1) issues.push("En az bir 'Dur ve düşün:' sorusu ve hemen ardından 'Cevap:' satırı olmalı.");
    else if (reveals < asks) issues.push("Her 'Dur ve düşün:' sorusunun hemen ardından 'Cevap:' satırı gelmeli.");
    const last = episode.chapters[episode.chapters.length - 1];
    if (last && last.lines.length < 3) issues.push("Son bölüm üç kısa tekrar satırı olmalı.");
  }
  const arithmetic = auditQuantitative(podcastScriptText(episode), "").issues.filter((issue) => issue.kind === "arithmetic");
  for (const issue of arithmetic) issues.push(`Tutmayan hesap: ${issue.detail}`);
  for (const item of duoTurnProblems(episode)) {
    issues.push(`chapters[${item.chapter}].lines[${item.line}]: ${item.reason}; çıkar ya da düzelt.`);
  }
  // KPSS denemesi: "İptal, idari işlemi; cebri icra ise borcun ödenmesini
  // sağlar." art arda iki kez, ufak farkla söylendi.
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      const previous = chapter.lines[lineIndex - 1];
      if (previous && nearDuplicate(previous.text, line.text)) {
        issues.push(`chapters[${chapterIndex}].lines[${lineIndex}]: bir önceki cümlenin tekrarı; çıkar ya da yeni bilgi söyle.`);
      }
    });
  });
  return issues;
}

function wordSet(text: string): Set<string> {
  return new Set(text.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((word) => word.length > 2));
}

function nearDuplicate(a: string, b: string): boolean {
  const left = wordSet(a);
  const right = wordSet(b);
  if (left.size < 4 || right.size < 4) return false;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / Math.min(left.size, right.size) >= 0.8;
}

/**
 * Kaynağa gönderme (20 Ekim 2026): "Notlarındaki örnekte …", "belgende yazan …". Etiketli genel
 * bilgi ("Belgende geçmiyor ama bilmen iyi olur:") bunun dışında.
 */
const ATTRIBUTION =
  /(?<!\p{L})not(?:lar)?(?:ın|ınız|un|unuz)(?:da|daki|dan|a\s+göre)(?!\p{L})|(?<!\p{L})belge(?:n)?de(?:ki)?\s+(?:yazan|yazdığı|yazıldığı|geçtiği\s+gibi|anlatıl\p{L}*|belirtil\p{L}*|örne\p{L}*)/iu;
const CONFESSION = /(?<!\p{L})(?:sanmışım|varsaymışım|zannetmişim)(?!\p{L})/iu;
const QUESTION_END = /\?\s*$/;
/** Soruya yalnız onay veren çıplak cevap: soru düşünce anlamsız kalır. */
const BARE_REPLY = /^(?:evet|hayır|doğru|aynen|kesinlikle)[.!]?$/iu;

/**
 * İki sunuculu metinde kodun kesin görebildiği konuşma sorunları (20 Ekim 2026, `DUO_TURN_RULE`):
 * bütün podcast'te ikinci ve sonraki "… sanmışım" itirafı (kural en çok bir kez diyor) ve kimsenin
 * cevaplamadığı soru (bölümün son satırı; ardından ya podcast bitiyor ya da sonraki bölümü aynı
 * konuşmacı açıyor). Kod yalnız işaretler; düzeltme turu ve kurtarma bu satırları çıkarır.
 */
function duoTurnProblems(episode: PodcastEpisode): { chapter: number; line: number; reason: string }[] {
  const duo = episode.chapters.some((chapter) => chapter.lines.some((line) => line.speaker === "kerem"));
  if (!duo) return [];
  const out: { chapter: number; line: number; reason: string }[] = [];
  let confessions = 0;
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      if (CONFESSION.test(line.text)) {
        confessions += 1;
        if (confessions > 1) out.push({ chapter: chapterIndex, line: lineIndex, reason: "ikinci yanılgı itirafı" });
        return;
      }
      if (line.beat === "ask" || lineIndex !== chapter.lines.length - 1 || !QUESTION_END.test(line.text)) return;
      const opener = episode.chapters[chapterIndex + 1]?.lines[0];
      if (!opener || opener.speaker === line.speaker) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "cevapsız soru" });
      }
    });
  });
  return out;
}

/**
 * Satır düzeyinde düşürülebilir sorunlar. Kod burada da cümle yazmaz; yalnız hangi satırın
 * çıkacağını söyler: kaynak/sayfa notu, tek satır içinde tutmayan eşitlik, bir öncekinin tekrarı,
 * iki sunuculu metinde ikinci yanılgı itirafı ve cevapsız soru.
 */
export function podcastLineProblems(episode: PodcastEpisode): { chapter: number; line: number; reason: string }[] {
  const out: { chapter: number; line: number; reason: string }[] = [];
  episode.chapters.forEach((chapter, chapterIndex) => {
    chapter.lines.forEach((line, lineIndex) => {
      if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b/i.test(line.text)) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "kaynak/sayfa notu" });
        return;
      }
      if (auditQuantitative(line.text, "").issues.some((issue) => issue.kind === "arithmetic")) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "tutmayan hesap" });
        return;
      }
      const previous = chapter.lines[lineIndex - 1];
      if (previous && nearDuplicate(previous.text, line.text)) {
        out.push({ chapter: chapterIndex, line: lineIndex, reason: "bir önceki cümlenin tekrarı" });
      }
    });
  });
  const seen = new Set(out.map((item) => `${item.chapter}:${item.line}`));
  for (const item of duoTurnProblems(episode)) {
    if (!seen.has(`${item.chapter}:${item.line}`)) out.push(item);
  }
  return out;
}

/**
 * Yayını durdurmayan biçim sorunları: bölüm sayısı, şablon başlık, soru-cevap sayısı, son bölüm
 * uzunluğu, kaynağa gönderme (cümle çoğu zaman gerçek bilgi taşır; yalnız düzeltme turuna gider).
 */
const COSMETIC_PROBLEM =
  /^Bölüm sayısı|şablon başlık|^En az bir 'Dur ve düşün:'|^Her 'Dur ve düşün:'|^Son bölüm üç kısa tekrar|^Kaynağa gönderme/;
/** Satır taramasının karşıladığı yapı sorunları (`podcastLineProblems`). */
const LINE_HANDLED_PROBLEM =
  /^Metinde kaynak\/sayfa notu var|^Tutmayan hesap:|bir önceki cümlenin tekrarı|cevapsız soru|ikinci yanılgı itirafı/;
const LINE_REF = /chapters\[(\d+)\]\.lines\[(\d+)\]/g;
const CHAPTER_ONLY_REF = /chapters\[(\d+)\](?!\.lines)/g;
/** Denetçinin madde harfi (`podcastIssueLine` biçimi: `[where] (G) …`). */
const ISSUE_RULE = /^\[.*?\] \(([A-I])\) /;
/** Bu kadar satırın altındaki podcast yayınlanmaz; ikinci taslak denenir. */
const MIN_SALVAGED_LINES = 4;

/**
 * Son çare (19 Ekim 2026, ürün sahibi: "podcast istendiyse üretilsin; 'üretilemedi' olmasın").
 * Düzeltme turlarından sonra hâlâ sorunlu satır kaldıysa podcast'in tamamı atılmaz, yalnız o
 * satırlar çıkarılır. 18 Ekim'de iki podcast tek bir "bu konu sınavda ağırlıklı" cümlesi ve
 * tutmayan bir eşitlik yüzünden tümden düşmüş, öğrenci "oluşturulamadı" görmüştü.
 *
 * Kod cümle yazmaz, yalnız siler: denetçinin `chapters[i].lines[j]` ile gösterdiği satırlar,
 * `chapters[i]` ile gösterdiği bölümler ve satır taramasının bulduklarını. "Dur ve düşün"
 * sorusu giderse cevabı da gider (ve tersi); iki satırın altına inen bölüm düşer. Biçim
 * sorunları (bölüm sayısı, şablon başlık) yayını durdurmaz. Satıra bağlanamayan bir sorun
 * kaldıysa (ör. satırlar arası tutmayan hesap) kurtarma yok: null → ikinci taslak.
 */
export function salvagePodcast(
  episode: PodcastEpisode,
  problems: string[],
): { episode: PodcastEpisode; removed: number } | null {
  const dropLines = new Set<string>();
  const dropChapters = new Set<number>();
  for (const problem of problems) {
    // Kulak maddeleri (20 Ekim 2026): I (tablo okuma) silinmez, yalnız düzeltme turuna gider;
    // G ve H satırı çıkar. Satır numarası yoksa ikisi de yayını durdurmaz, bölüm de düşürmez.
    const ear = ISSUE_RULE.exec(problem)?.[1];
    if (ear === "I") continue;
    if (ear === "G" || ear === "H") {
      for (const match of problem.matchAll(LINE_REF)) dropLines.add(`${match[1]}:${match[2]}`);
      continue;
    }
    let attributed = false;
    for (const match of problem.matchAll(LINE_REF)) {
      dropLines.add(`${match[1]}:${match[2]}`);
      attributed = true;
    }
    if (!attributed) {
      for (const match of problem.matchAll(CHAPTER_ONLY_REF)) {
        dropChapters.add(Number(match[1]));
        attributed = true;
      }
    }
    if (!attributed && !COSMETIC_PROBLEM.test(problem) && !LINE_HANDLED_PROBLEM.test(problem)) return null;
  }
  for (const item of podcastLineProblems(episode)) dropLines.add(`${item.chapter}:${item.line}`);
  for (const key of [...dropLines]) {
    const [chapterIndex, lineIndex] = key.split(":").map(Number);
    const lines = episode.chapters[chapterIndex]?.lines ?? [];
    const line = lines[lineIndex];
    if (!line) continue;
    if (line.beat === "ask" && lines[lineIndex + 1]?.beat === "reveal") dropLines.add(`${chapterIndex}:${lineIndex + 1}`);
    if (line.beat === "reveal" && lines[lineIndex - 1]?.beat === "ask") dropLines.add(`${chapterIndex}:${lineIndex - 1}`);
    // Konuşmacıdan konuşmacıya soru (20 Ekim 2026): cevabın ilk satırı giderse soru cevapsız kalır;
    // soru giderse ardındaki çıplak "Evet." da anlamsız kalır.
    const previous = lines[lineIndex - 1];
    if (previous && previous.speaker !== line.speaker && previous.beat !== "ask" && QUESTION_END.test(previous.text)) {
      dropLines.add(`${chapterIndex}:${lineIndex - 1}`);
    }
    const next = lines[lineIndex + 1];
    if (line.beat !== "ask" && QUESTION_END.test(line.text) && next && next.speaker !== line.speaker && BARE_REPLY.test(next.text.trim())) {
      dropLines.add(`${chapterIndex}:${lineIndex + 1}`);
    }
  }

  let removed = 0;
  const chapters = episode.chapters
    .map((chapter, chapterIndex) => {
      if (dropChapters.has(chapterIndex)) {
        removed += chapter.lines.length;
        return null;
      }
      const lines = chapter.lines.filter((_, lineIndex) => {
        const drop = dropLines.has(`${chapterIndex}:${lineIndex}`);
        if (drop) removed += 1;
        return !drop;
      });
      if (lines.length < 2) {
        removed += lines.length;
        return null;
      }
      return lines.length === chapter.lines.length ? chapter : { ...chapter, lines };
    })
    .filter((chapter): chapter is PodcastEpisode["chapters"][number] => chapter !== null);
  const total = chapters.reduce((sum, chapter) => sum + chapter.lines.length, 0);
  if (!chapters.length || total < MIN_SALVAGED_LINES) return null;
  const next: PodcastEpisode = removed ? { ...episode, chapters } : episode;

  // Çıkarma yeni bir ardışık tekrar doğurabilir: satıra bağlı sorun kaldıysa bir tur daha.
  const leftover = podcastLineProblems(next);
  if (leftover.length) {
    if (!removed) return null;
    const again = salvagePodcast(
      next,
      leftover.map((item) => `chapters[${item.chapter}].lines[${item.line}]: ${item.reason}`),
    );
    return again ? { episode: again.episode, removed: removed + again.removed } : null;
  }
  // Satıra bağlanamayan sert sorun (satırlar arası tutmayan hesap) kaldıysa kurtarma yok.
  if (podcastStructureIssues(next).some((issue) => !COSMETIC_PROBLEM.test(issue))) return null;
  return { episode: next, removed };
}
