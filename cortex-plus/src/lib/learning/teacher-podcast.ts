import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { coercePodcastDraft, podcastScriptText, type PodcastEpisode } from "@/lib/learning/podcast-episode";
import { DUO_NARRATOR_SCHEMA, podcastDuoBrief, podcastLengthSpec, type PodcastLength } from "@/lib/learning/podcast-formats";
import { podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import { SINGLE_NARRATOR_SCHEMA, podcastNarrationBrief } from "@/lib/learning/teacher-brain";
import { isScaffoldHeading } from "@/lib/learning/teaching-standards";
import { auditQuantitative } from "@/lib/learning/tutor-quant";
import { sourceText, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";

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
  runningHeaders?: string[];
};

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Her olgu, tanım, sayı, formül, tarih ve sınıflandırma yalnızca KAYNAK'tan (ve verilmişse " +
  "öğrencinin aynı konudaki DERS'inden) gelir. Kaynakta yoksa söyleme; genel kültürden ekleme. Kaynaktaki bozuk ya da " +
  "yanlış yazılmış kelimeleri doğru Türkçeyle söyle; kaynakta açıkça bozuk bir cümle varsa kaynağın kendi örnekleriyle " +
  "tutarlı anlamını söyle ve bundan söz etme.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Konuyu sınav müfredatındaki yerleşik, ders kitaplarında " +
  "tartışmasız bilgiyle anlat. Emin olmadığın sayı, tarih, madde numarası, eşik ya da kuralı söyleme; güncel olarak " +
  "değişebilecek bilgiyi verme. Aşağıda 'kaynak' denen her yer konunun yerleşik bilgisi anlamına gelir.\n\n";

const SCHEMA_DUO = '{"title":"…","chapters":[{"title":"kavramın adı","lines":[{"speaker":"ada"|"kerem","text":"tek cümle"}]}]}';
const SCHEMA_SINGLE = '{"title":"…","chapters":[{"title":"kavramın adı","lines":[{"speaker":"ada","text":"tek cümle"}]}]}';

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
    "- Gündelik hayattan kısa, somut bir sahne kurabilirsin; yeni bilgi (sayı, kural, tarih, sonuç) taşımaz.\n" +
    (length === "ozet"
      ? ""
      : "- Bir ya da iki yerde dinleyene soru sor: satır 'Dur ve düşün:' ile başlar, hemen sonraki satır 'Cevap:' ile " +
        "başlar ve cevabı verir.\n" +
        "- Son bölüm üç kısa tekrar satırıdır; her satır sınavda işe yarayan bir kesin bilgi.\n") +
    "- Örnek açarsan verileni, işlemi ve birimli sonucu aynı bölümde söyle; yarım bırakma. Eşitliğin iki tarafını hesapla.\n" +
    "- Formülü ve üssü simgeyle yaz (H₂O, 10²³, n = m/M); ondalık virgül kullan.\n\n" +
    "YAZMA: 'Kaynak:', sayfa numarası, 'PDF', 'belgede yazdığı gibi', iç not.\n\n" +
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
  "A) Kaynakta dayanağı olmayan olgu, tanım, sayı, formül ya da sınıflandırma (yeni bilgi taşımayan gündelik sahne sorun değil).\n" +
  "B) Kaynakla çelişen ya da anlamı değiştiren ifade.\n" +
  "C) Yanlış hesap, tutmayan eşitlik, yarım bırakılmış örnek.\n" +
  "D) 'Cevap:' satırının sorulan soruya yanlış ya da eksik cevap vermesi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
  "Kaynakta açıkça bozuk bir cümlenin kaynağın kendi örnekleriyle tutarlı anlamıyla söylenmesi sorun değildir.\n";

const VERIFY_TOPIC =
  "Sen titiz bir içerik denetçisisin. Belgesi olmayan bir podcast metnini doğruluk açısından denetliyorsun. Şunları bul:\n" +
  "A) Yanlış ya da tartışmalı olgu, tanım, sayı, formül; emin olunamayacak kadar ayrıntılı ya da güncel değişebilecek bilgi.\n" +
  "B) Ders içinde çelişki.\n" +
  "C) Yanlış hesap, tutmayan eşitlik, yarım bırakılmış örnek.\n" +
  "D) 'Cevap:' satırının sorulan soruya yanlış ya da eksik cevap vermesi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n";

const VERIFY_JSON =
  "A-E 'high'. Şunlar 'low': tekdüze anlatım, uzunluk.\n" +
  'JSON döndür: {"issues":[{"where":"chapters[1].lines[3]","severity":"high","problem":"…","fix":"…"}]}. Sorun yoksa issues boş dizi.';

export function podcastVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (mode === "topic" ? VERIFY_TOPIC : VERIFY_DOCUMENT) + VERIFY_JSON;
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
    "kaynaktaki doğrusuyla değiştir, hesabı düzelt, yarım örneği tamamla ya da çıkar, bozuk cümleyi yeniden yaz. Önerilen " +
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
