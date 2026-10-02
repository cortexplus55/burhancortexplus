import { lessonV2Schema, type LessonV2 } from "@/lib/learning/teaching-standards";
import { CONTENT_STYLE } from "@/lib/ai/content-style";

/**
 * Öğretmen ders motoru (2 Ekim 2026, ürün sahibinin kararı).
 *
 * Eski yol: model dersi yazıyor, sonra ~16 bin satırlık onarım katmanı
 * metni değiştiriyordu — "Kaynak:" ekliyor, kalıp özet uyduruyor, kaynaktan
 * cümle yapıştırıyordu. Öğrenci "sıradan yapay zekâ" sesini buradan duydu.
 *
 * Yeni yol: tek, güçlü bir öğretmen istemi (aynı belgeyle okunan Astra
 * dersinin akışı, docs/delivery/ICERIK-KALITE-YOL-HARITASI.md), ardından
 * belgeyle eşleme yapan ikinci bir model çağrısı ve gerekirse modelin kendi
 * düzeltmesi. Kod metne hiçbir şey EKLEMEZ; yalnız denetler.
 */

export type TeacherLessonInput = {
  topicLabel: string;
  prepTitle: string;
  /** Temiz kaynak sayfaları, sırayla. */
  pages: { page: number; text: string }[];
  /** Sıradaki gerçek konular; nextFocus yalnız bunlardan. */
  upcomingTopics: string[];
  /** Hazırlıktaki bir önceki konu; varsa derse bağlanılır. */
  previousTopic?: string | null;
  /** Aşinalık ve ruh hali satırı (session-signals). */
  learnerLine?: string;
  /** Sayfa kenarında tekrar eden satırlar: başlık olamaz. */
  runningHeaders?: string[];
};

export function sourceText(pages: TeacherLessonInput["pages"]): string {
  return pages.map((item) => `[s.${item.page}]\n${item.text.trim()}`).join("\n\n");
}

const SCHEMA = `{
  "title": "konunun içerikten adı, en fazla 9 kelime",
  "overview": "kanca: 1-2 cümle; konunun neden önemli olduğunu kaynaktaki bir gerçekle söyler",
  "objective": "bu dersten sonra öğrencinin YAPABİLECEĞİ tek şey",
  "sections": [
    {
      "heading": "kavramın adı",
      "body": "60-140 kelime; anahtar terimler **koyu**",
      "checkFirst": true,
      "cards": [{"title": "kardeş kavram", "body": "tek cümle tanım"}],
      "table": {"caption": "…", "columns": ["…","…"], "rows": [["…","…"]]},
      "procedure": {"title": "…", "steps": [{"label": "…", "detail": "…"}]},
      "formula": {"title": "…", "expression": "…", "note": "…"},
      "note": {"title": "X ile Y farkı", "body": "…", "tone": "warn"},
      "check": {
        "type": "mcq",
        "prompt": "…",
        "options": ["…","…","…","…"],
        "answerIndex": 0,
        "explanation": "doğru cevabın nedeni + her çeldiricinin gerçekte ne olduğu",
        "optionWhy": ["şık 1 için tek cümle", "şık 2", "şık 3", "şık 4"],
        "review": {"prompt": "aynı kavramı farklı yönden soran durum sorusu; şıklar aynı kalır"}
      }
    }
  ],
  "example": {"prompt": "…", "givens": ["…"], "unknown": "…", "steps": ["…"], "result": "…", "solution": "…"},
  "commonMistake": {"claim": "öğrencinin gerçekten yaptığı hata", "correction": "…"},
  "summary": ["sınavda işe yarayan kesin bilgi", "…", "…"],
  "nextFocus": ["SIRADAKİ KONULAR listesinden aynen"]
}`;

/** Öğretmen istemi — Astra'nın aynı belgeyle gözlenen ders akışı. */
export const TEACHER_SYSTEM =
  "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor ve sana yalnızca kendi ders belgesini verdi. " +
  "Bu belgeyi, iyi bir öğretmenin tahtada anlatacağı gibi, kendi cümlelerinle, kısa ve net bir derse dönüştürüyorsun.\n\n" +
  "KAYNAK KURALI (kesin): Her olgu, tanım, sayı, tarih, madde numarası, kural, sınıflandırma ve olay örneği yalnızca " +
  "KAYNAK metninden gelir. Kaynakta yoksa yazma; tahmin etme, genel kültürden ekleme. " +
  "Kavramı ayırt ettirmek için gündelik hayattan kısa bir örnek ya da benzetme kullanabilirsin, ama o örnek yeni bir " +
  "bilgi (sayı, kural, yasa, tarih, sonuç) taşımaz ve kaynaktaki tanımla çelişmez. " +
  "Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz; kaynaktan uzun cümle kopyalama. " +
  "Kaynakta bir cümle açıkça bozuksa (olumsuzluk eki düşmüş, kelime kaymış, kendi açıklaması ve örnekleriyle çelişiyor), " +
  "onu kopyalama: kaynağın kendi açıklamalarından ve örneklerinden anlaşılan anlamı yaz. Örnek: 'işlemin kanunun " +
  "öngördüğü şekilde yapılması durumunda hüküm doğurmamasıdır' bozuk; kastedilen 'yapılmaması nedeniyle'. " +
  "Bu yeni bilgi değil, kaynağın düzeltilmesidir. Düzeltmeyi sessizce yap: derste kaynağın hatasından, " +
  "'kaynakta yanlış yazılmış' gibi bir nottan hiç söz etme.\n\n" +
  "ANLATIM: 'Sen' diye konuşan, sakin, sınav odaklı bir öğretmen. Kısa cümleler. Önce kavramın ne olduğunu, sonra neyle " +
  "karıştırıldığını, sonra sınavda nasıl tanınacağını söyle. Zıtlıkla anlat (X böyledir, Y ise şöyle). " +
  "Kaynak bir karşılaştırma ya da tablo veriyorsa 'table' kullan; kardeş kavramları (aynı ailedeki 2-6 terim) 'cards' " +
  "ile tek cümlelik tanımlar olarak ver; sıralı bir işlem varsa 'procedure'; hesaplanabilir bağıntı varsa 'formula'. " +
  "Öğrencinin sık karıştırdığı iki kavram varsa bölümün içine 'note' (tone: warn) koy: 'X ile Y farkı'. " +
  "Gündelik örneği 'note' (tone: info) içinde ver; başlığı örneği anlatsın.\n\n" +
  "AKIŞ:\n" +
  "1) overview: dersin kancası — konuya girmeden önce öğrenciyi düşündüren 1-2 cümle.\n" +
  "2) Bölümler: 3-4 bölüm (kaynak darsa 2). Her bölüm tek kavram; başlık kavramın adı. " +
  "Kaynakta başlık büyük harfle yazılmış olsa bile sen normal yazımla yaz ('MADDİ YAPTIRIMLAR' değil 'Maddi Yaptırımlar'). " +
  "Bölüm numarası, 'Giriş/Özet/Örnek/Yaygın hata/Bilgi kontrolü' gibi şablon başlık yok.\n" +
  "3) İlk bölümde checkFirst=true: konu anlatılmadan önce öğrencinin ön bilgisini yoklayan, yaygın yanılgıyı ölçen bir " +
  "doğru/yanlış sorusu (trueFalse, options ['Doğru','Yanlış']).\n" +
  "4) Her bölüm bir kontrolle biter. Çoktan seçmeli soruda 4 şık; çeldiriciler aynı ailedeki kardeş terimler ya da " +
  "öğrencinin gerçekten karıştırdığı ifadeler. Tek doğru şık. Soru cevabı vermesin; sayma sorusu ('kaç tür vardır') yok. " +
  "explanation doğru cevabın nedenini söyler VE her çeldiricinin gerçekte ne olduğunu söyler. optionWhy her şık için bir " +
  "cümle (şık sayısı kadar). review: aynı kavramı farklı yönden soran soru — tanımdan terim soruldaysa bu kez " +
  "bir durumdan (olaydan) terim sorulur; şıklar aynı kalır.\n" +
  "5) example yalnız kaynakta çözümlü bir örnek ya da hesap varsa; verilen, istenen, adımlar ve birimli sonuç kaynaktan.\n" +
  "6) commonMistake: kaynağa göre öğrencinin yapacağı somut hata ve düzeltmesi (öğüt değil, hata).\n" +
  "7) summary: 3-5 madde; sınavda soruyu çözdürecek kesin bilgiler, anahtar kelimeleriyle.\n" +
  "8) nextFocus yalnız verilen SIRADAKİ KONULAR listesinden, aynen; liste boşsa boş dizi.\n\n" +
  "YAZMA: 'Kaynak:', sayfa numarası, 's.12', 'PDF', 'bu derste ... öğreneceğiz' gibi boş cümle, kendini tekrar, " +
  "iç not. Gövdede başlığı tekrar etme.\n\n" +
  `${CONTENT_STYLE}\n\n` +
  `Yalnızca bu şemada JSON döndür (kullanmadığın isteğe bağlı alanları yazma):\n${SCHEMA}`;

export function teacherUserPrompt(input: TeacherLessonInput): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    input.previousTopic ? `ÖNCEKİ KONU (gerekirse tek cümleyle bağlan): ${input.previousTopic}` : "",
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    `SIRADAKİ KONULAR: ${input.upcomingTopics.length ? input.upcomingTopics.join(" | ") : "(yok)"}`,
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu ya da bölüm adı değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const VERIFY_SYSTEM =
  "Sen titiz bir ders denetçisisin. Bir dersi, yazıldığı KAYNAK ile karşılaştırıyorsun. Şunları bul:\n" +
  "A) Kaynakta dayanağı olmayan olgu, tanım, sayı, tarih, kural ya da sınıflandırma. (Yeni bilgi taşımayan gündelik " +
  "örnek ya da benzetme sorun değildir.)\n" +
  "B) Kaynakla çelişen ya da kaynağın anlamını değiştiren ifade.\n" +
  "C) Yanlış cevap anahtarı, birden fazla doğru şık, cevabı soru metninde veren soru.\n" +
  "D) explanation ya da optionWhy'da yanlış bilgi.\n" +
  "E) Bozuk, anlamsız ya da yarım Türkçe cümle; kaynağın bozuk kelimesinin ya da bozuk cümlesinin kopyası.\n" +
  "F) Ders içinde tutarsızlık (bir yerde üç tür deyip başka yerde farklı saymak gibi).\n" +
  "G) Derste kaynağın kendisinden söz eden iç not ('kaynakta yanlış yazılmış', 'kaynaktaki ifade hatalıdır' gibi).\n" +
  "Kaynakta açıkça bozuk bir cümlenin (olumsuzluk eki düşmüş, kelime kaymış, kendi açıklaması ve örnekleriyle " +
  "çelişen) derste kaynağın kendi açıklama ve örnekleriyle tutarlı anlamıyla yazılması SORUN DEĞİLDİR; bunu A ya da B " +
  "sayma.\n" +
  "A-G 'high'. Şunlar 'low': öğretici olmayan soru, gereksiz uzunluk, zayıf kanca.\n" +
  'JSON döndür: {"issues":[{"where":"sections[1].check","severity":"high","problem":"…","fix":"…"}]}. ' +
  "Sorun yoksa issues boş dizi.";

export function verifyUserPrompt(lesson: LessonV2, pages: TeacherLessonInput["pages"]): string {
  return `KAYNAK:\n${sourceText(pages)}\n\nDERS (JSON):\n${JSON.stringify(lesson)}`;
}

export const FIX_SYSTEM =
  "Sen aynı dersi yazan öğretmensin. Denetçinin bulduğu sorunları düzelt. Kaynakta dayanağı olmayan bilgiyi çıkar ya da " +
  "kaynaktaki doğrusuyla değiştir; yanlış anahtarı düzelt; bozuk cümleyi doğru Türkçeyle yeniden yaz. " +
  "Listedeki her alanı mutlaka değiştir; önerilen düzeltme ('→' sonrası) varsa onu uygula. Dersi aynen geri döndürme. " +
  "Sorunsuz kısımları değiştirme. Kurallar ve şema aynı:\n\n" +
  TEACHER_SYSTEM;

export function fixUserPrompt(
  lesson: LessonV2,
  issues: TeacherIssue[],
  input: TeacherLessonInput,
): string {
  return [
    teacherUserPrompt(input),
    `ŞU ANKİ DERS (JSON):\n${JSON.stringify(lesson)}`,
    `DÜZELTİLECEK SORUNLAR:\n${issues.map((issue, i) => `${i + 1}. [${issue.where}] ${issue.problem}${issue.fix ? ` → ${issue.fix}` : ""}`).join("\n")}`,
    "Düzeltilmiş dersin tamamını aynı şemayla JSON olarak döndür.",
  ].join("\n\n");
}

export type TeacherIssue = { where: string; severity: "high" | "low"; problem: string; fix?: string };

export function parseIssues(raw: unknown): TeacherIssue[] {
  const list = (raw as { issues?: unknown } | null)?.issues;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const problem = typeof row.problem === "string" ? row.problem.trim() : "";
    if (!problem) return [];
    return [
      {
        where: typeof row.where === "string" ? row.where.slice(0, 80) : "ders",
        severity: row.severity === "low" ? ("low" as const) : ("high" as const),
        problem: problem.slice(0, 400),
        fix: typeof row.fix === "string" ? row.fix.slice(0, 400) : undefined,
      },
    ];
  });
}

/**
 * Model çıktısını şemaya oturtur. Metne bir şey eklemez; yalnız liste dışı
 * nextFocus'u düşürür ve kaynaktan aynen alınmış BÜYÜK HARF başlığı normal
 * yazıma çevirir (KPSS altın denemesinde iki düzeltme turu da başlıkları
 * değiştirmedi; yazım yüzünden ders reddedilmesin).
 */
export function parseTeacherLesson(raw: unknown, upcomingTopics: string[]): LessonV2 | null {
  const parsed = lessonV2Schema.safeParse(raw);
  if (!parsed.success) return null;
  const lesson = parsed.data;
  const allowed = new Set(upcomingTopics.map((topic) => topic.trim().toLocaleLowerCase("tr")));
  const nextFocus = (lesson.nextFocus ?? []).filter((item) => allowed.has(item.trim().toLocaleLowerCase("tr")));
  return {
    ...lesson,
    title: calmHeading(lesson.title),
    sections: lesson.sections.map((section) => ({
      ...section,
      heading: calmHeading(section.heading),
      ...(section.cards ? { cards: section.cards.map((card) => ({ ...card, title: calmHeading(card.title) })) } : {}),
    })),
    nextFocus,
  };
}

const MINOR_WORDS = new Set(["ve", "ile", "veya", "ya", "da", "de", "ki", "için", "gibi", "ya da"]);

/**
 * "KESİN HÜKÜMSÜZLÜK VE İPTAL" → "Kesin Hükümsüzlük ve İptal". Yalnız
 * bağıran başlığa dokunur; ünlüsüz kısaltmalar (KPSS, TBMM) olduğu gibi kalır.
 */
export function calmHeading(text: string): string {
  if (!shouting(text)) return text.trim();
  return text
    .trim()
    .split(/(\s+)/)
    .map((word, index) => {
      if (/^\s+$/.test(word) || !/\p{L}/u.test(word)) return word;
      if (!/[aeıioöuüAEIİOÖUÜ]/.test(word)) return word;
      const lower = word.toLocaleLowerCase("tr");
      if (index > 0 && MINOR_WORDS.has(lower)) return lower;
      const first = lower.search(/\p{L}/u);
      return lower.slice(0, first) + lower.charAt(first).toLocaleUpperCase("tr") + lower.slice(first + 1);
    })
    .join("");
}

const SCAFFOLD_HEADING = /^(giriş|özet|örnek|yaygın hata|sık yapılan hata|bilgi kontrolü|kapanış|sonuç|tekrar)\b/i;

function shouting(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return upper / letters.length > 0.7;
}

function sameKey(a: string, b: string): boolean {
  const key = (s: string) => s.toLocaleLowerCase("tr").replace(/[^\p{L}\d]+/gu, " ").trim();
  return key(a) === key(b);
}

/**
 * Yapı denetimi (saf). Sorunu düzeltmez; düzeltme turuna "high" olarak
 * gider. Gözlenen her eski kusur burada bir kural: BÜYÜK HARF başlık
 * (sayfa üst bilgisi), "Kaynak:" yapıştırma, bariz kontrol, eksik gerekçe.
 */
export function lessonStructureIssues(lesson: LessonV2, input: Pick<TeacherLessonInput, "runningHeaders">): TeacherIssue[] {
  const issues: TeacherIssue[] = [];
  const add = (where: string, problem: string) => issues.push({ where, severity: "high", problem });
  const headers = input.runningHeaders ?? [];

  if (shouting(lesson.title)) add("title", "Başlık BÜYÜK HARFLE yazılmış; içerikten, normal yazımla bir konu adı ver.");
  if (headers.some((line) => sameKey(line, lesson.title))) add("title", "Başlık sayfa kenarında tekrar eden kitap başlığı; konunun kendi adını ver.");
  if (!lesson.overview?.trim()) add("overview", "Kanca (overview) yok.");
  if (lesson.sections.length < 2) add("sections", "En az iki bölüm olmalı.");
  if (lesson.sections.length > 5) add("sections", "En fazla dört bölüm; konuyu daralt.");
  if (!lesson.sections[0]?.checkFirst || lesson.sections[0]?.check?.type !== "trueFalse") {
    add("sections[0]", "İlk bölüm 'önce dene' ile açılmalı: checkFirst=true ve trueFalse kontrolü.");
  }

  lesson.sections.forEach((section, index) => {
    const where = `sections[${index}]`;
    if (shouting(section.heading)) add(`${where}.heading`, "Bölüm başlığı BÜYÜK HARF.");
    if (SCAFFOLD_HEADING.test(section.heading.trim())) add(`${where}.heading`, "Şablon başlık; kavramın adını yaz.");
    if (headers.some((line) => sameKey(line, section.heading))) add(`${where}.heading`, "Başlık sayfa üst bilgisi; kavramın adını yaz.");
    if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b/i.test(section.body)) {
      add(`${where}.body`, "Gövdede kaynak/sayfa notu var; metinden çıkar (kaynak ekranda ayrıca gösteriliyor).");
    }
    // KPSS altın denemesi: düzeltme turu "Kaynaktaki … ifadesi anlatım hatasıdır" diye derse not düştü.
    if (/kayna(?:kta|ktaki|ğın)\s[^.]{0,80}?(?:hata|yanlış|bozuk)/i.test(section.body)) {
      add(`${where}.body`, "Gövdede kaynağın hatasından söz eden iç not var; düzeltmeyi sessizce yap, notu çıkar.");
    }
    const words = section.body.split(/\s+/).filter(Boolean).length;
    if (words > 220) add(`${where}.body`, `Gövde çok uzun (${words} kelime); 60-140 kelimeye indir, ayrıntıyı karta/tabloya taşı.`);
    const check = section.check;
    if (!check) {
      add(`${where}.check`, "Bölüm bir kontrolle bitmeli.");
      return;
    }
    if (check.type === "mcq") {
      const options = check.options ?? [];
      if (options.length !== 4) add(`${where}.check`, "Çoktan seçmeli soruda 4 şık olmalı.");
      if (typeof check.answerIndex !== "number" || check.answerIndex < 0 || check.answerIndex >= options.length) {
        add(`${where}.check`, "answerIndex şıklarla uyuşmuyor.");
      }
      if (!check.optionWhy || check.optionWhy.length !== options.length) {
        add(`${where}.check`, "optionWhy her şık için bir cümle olmalı.");
      }
      if (new Set(options.map((option) => option.trim().toLocaleLowerCase("tr"))).size !== options.length) {
        add(`${where}.check`, "Aynı şık iki kez yazılmış.");
      }
      // \b Türkçe harfi tanımıyor ("kaç" ç ile biter); boşlukla sınırla.
      if (/(?:^|\s)kaç\s+(?:\S+\s+){0,2}(tür|çeşit|başlık|madde|unsur|aşama|basamak)/i.test(check.prompt)) {
        add(`${where}.check`, "Sayma sorusu öğretici değil; kavramı ayırt ettiren bir soru sor.");
      }
      if (!check.review?.prompt) add(`${where}.check.review`, "review (farklı yönden tekrar sorusu) yok.");
    }
    if (check.type === "trueFalse") {
      const options = check.options ?? [];
      if (options.length !== 2 || typeof check.answerIndex !== "number" || check.answerIndex > 1) {
        add(`${where}.check`, "Doğru/yanlış sorusunda şıklar ['Doğru','Yanlış'] ve answerIndex 0 ya da 1 olmalı.");
      }
    }
  });

  const summary = lesson.summary ?? [];
  if (summary.length < 3 || summary.length > 5) add("summary", "Özet 3-5 madde olmalı.");
  return issues;
}
