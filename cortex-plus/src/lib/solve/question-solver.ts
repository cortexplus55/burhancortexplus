import { stepArithmeticIssues } from "@/lib/solve/step-arithmetic";

/*
  Soru çözücü (23 Ekim 2026; 25 Ekim 2026: sıfır-hata / zorunlu sağlama).

  Doğruluk tek çağrıya bırakılmaz. İki bağımsız çözücü aynı ezber hatasına düşmesin diye
  farklı açıdan çalışır (analitik adım adım + şeytanın avukatı / tersine sağlama). Cevaplar
  tutar ve kod hesabı doğrularsa öğrenciye o çözüm gider; tutmazsa ya da işlemde çelişki
  varsa hakem (gpt-4.1) soruyu baştan kendisi çözer — sağlaması yapılmamış ilk tahmin
  gösterilmez.
*/

export type SolverOption = { letter: string; text: string };
export type SolverStep = { title?: string; math?: string; say: string };
export type SolverAnswer = { letter?: string; value?: string; text: string };
export type SolverOptionWhy = { letter: string; why: string; correct?: boolean };

export type Solution = {
  readable: boolean;
  subject: string;
  question: string;
  options: SolverOption[];
  kind: "mcq" | "open";
  intro: string;
  given: string[];
  asked: string;
  steps: SolverStep[];
  answer: SolverAnswer;
  optionsWhy: SolverOptionWhy[];
  trap: string;
  tip: string;
  check: string;
  /** Görselde birden çok soru varsa çözülen sorunun numarası (24 Ekim 2026; `ONE_QUESTION_RULE`). */
  questionNumber?: string;
  /** Görseldeki öbür soruların numaraları; öğrenciye "nota numarasını yaz" denir. */
  otherQuestions?: string[];
  /** Kökteki olumsuz/kritik kelimeler: değildir, yanlıştır, ulaşılamaz, en az, kesinlikle… */
  criticalWords?: string[];
};

export type QuickAnswer = { letter?: string; value?: string };

/**
 * Tek soru (24 Ekim 2026). Canlıda 6 soruluk bir test sayfasının fotoğrafı ~90 sn sonra "tamamlanamadı" oldu:
 * model bütün soruları çözmeye çalışıp 45 sn'lik çağrı sınırını iki kez aştı. İki bağımsız çözücü, uzlaştırıcı ve
 * denetçi aynı kuralla aynı soruyu seçer; yoksa cevaplar farklı sorulara ait olur.
 */
export const ONE_QUESTION_RULE =
  "TEK SORU: Görselde ya da metinde birden çok soru varsa yalnız birini çöz, öbürlerini çözme ve yazma. Hangisi: " +
  "öğrencinin notunda soru numarası ya da tarifi varsa o soru; yoksa HER ZAMAN sayfadaki ilk tam soru (numarası en " +
  "küçük olan). Kâğıttaki işaret, çarpı, 'doğrusu …' ya da 'tekrar bak' notu soruyu seçmez; yine ilk soru çözülür.";
// 24 Ekim 2026 canlı (Test-14, 6 soru): iki bağımsız çözücüden biri işaretli 2. soruyu, öbürü işaretli 6. soruyu
// seçti; cevaplar uyuşmadı, uzlaştırma gerekti ve öbür sorular listesi boş kaldı. Seçim kesin olmalı.

const PLAIN =
  "Dil: sınava hazırlanan, konuyu yeni öğrenen bir öğrenciye konuşur gibi; kısa cümleler, günlük kelimeler, terimi " +
  "ilk geçtiği yerde bir cümleyle açıkla. Gereksiz giriş, övgü ve 'harika soru' yok.";

/** Çözüme başlamadan önce kâğıdı birebir metne dök; yüzeysel okuma yasak. */
export const READ_FIRST_RULE =
  "ÖNCE TAM OKU (çözüme geçme): Sorudaki bütün sayıları, birimleri, sembolleri, grafik/tablo değerlerini, Romen " +
  "rakamlı öncülleri (I, II, III, IV…) ve bütün şıkları (A, B, C, D, E) kâğıttaki gibi birebir question + options'a yaz. " +
  "Her şık kendi harfiyle; harf uydurma, şık atlama, kelime düzeltme. Kökteki olumsuz/kritik kelimeleri " +
  "(değildir, yanlıştır, ulaşılamaz, en az, en çok, kesinlikle, yalnızca, hariç, değilse) criticalWords dizisine yaz; " +
  "bunlar cevabı tersine çevirir, atlama. Görsel okunmuyorsa ya da soru eksikse readable:false döndür ve çözüm uydurma.";

/** Bulunan cevabı yerine koy; diğer şıkları tek tek ele. İlk tahmini yazma. */
export const BACKCHECK_RULE =
  "ZORUNLU SAĞLAMA: Cevabı yazmadan önce (1) bulduğun değeri/şıkkı denklemde, öncülde veya tanıma yerine koy " +
  "(back-substitution) ve check alanına bir cümleyle yaz; (2) şıklı soruda diğer her şıkkın neden yanlış olduğunu " +
  "optionsWhy'da tek tek işle — yanlış şıkta o sayıyı gerçekten veren tipik hatayı yaz, boş 'doğru olsa bu olmaz' " +
  "cümlesi yok; (3) sağlaması tutmuyorsa cevabı değiştir, ilk tahmini bırakma.";

const SOLUTION_JSON =
  'Yalnızca JSON döndür: {"readable":true,"subject":"Fizik","question":"…","options":[{"letter":"A","text":"…"}],' +
  '"kind":"mcq","intro":"…","given":["…"],"asked":"…","criticalWords":["değildir"],' +
  '"steps":[{"title":"Kuvvetleri bileşenlerine ayıralım","math":"…","say":"…"}],' +
  '"answer":{"letter":"B","value":"40 m","text":"Araç 4 saniyede 40 metre yol alır."},' +
  '"optionsWhy":[{"letter":"A","why":"…","correct":false}],"trap":"…","tip":"…","check":"…",' +
  '"questionNumber":"","otherQuestions":[]}';

export const SOLVER_SYSTEM = [
  "Sen sınav sorularını çözen titiz bir öğretmensin. AÇIN: standart akademik / formül yolu — verilenler, istenen, " +
    "ilgili yasa veya kural, adım adım işlem. Soru fotoğraftan ya da yazılı metinden gelir; her ders olabilir " +
    "(matematik, fizik, kimya, biyoloji, Türkçe, tarih, coğrafya, felsefe, yabancı dil, tıp, hukuk, KPSS, YKS, TUS…).",
  "",
  READ_FIRST_RULE,
  ONE_QUESTION_RULE +
    " Birden çok soru varsa questionNumber çözdüğün sorunun numarası, otherQuestions görseldeki öbür soruların " +
    "numaraları (görselde başka soru varsa boş bırakma).",
  "",
  "SONRA ÇÖZ: İşlemleri tek tek yap, sonucu soruda istenen birimle ver. Şıklı soruda cevap mutlaka şıklardan biri " +
    "olur ve answer.letter o şıkkın harfidir. Cevaptan emin olmadan yazma.",
  BACKCHECK_RULE,
  "",
  "ANLATIM (soruya göre):",
  "- İşlemli soruda: given, asked, steps. Her adımın kısa bir title'ı (ör. \"Kuvvetleri bileşenlerine ayıralım\"), " +
    "bir satır işlemi (math: a = Δv / t = 20 / 4 = 5 m/s²) ve bir cümle mantığı (say) olsun. 3-7 adım.",
  "- Sözel soruda: önce cevap; optionsWhy her şık için bir cümle. steps gerekmez ama kök uzunsa 2-4 adım yaz.",
  "- Şıklı işlemli soruda da optionsWhy her şık için bir cümle.",
  "- trap: öğrencinin en çok karıştırdığı nokta (bir cümle). tip: akılda kalacak kısa kural. " +
    "check: tersine sağlamanın bir cümlesi. intro: nasıl yaklaşacağımızı söyleyen tek cümle.",
  "",
  PLAIN,
  "",
  SOLUTION_JSON,
].join("\n");

/** İkinci çözücü: aynı ezbere düşmesin diye bağımsız açı + şık eleyici. */
export const ADVOCATE_SYSTEM = [
  "Sen aynı sınav sorusunu BAĞIMSIZ çözen ikinci bir öğretmensin. Birinci çözümü görmüyorsun. AÇIN: şeytanın avukatı " +
    "ve şık eleyici — varsayımları tersinden yokla, cevabı denklemde/öncülde yerine koy, diğer şıkları tek tek ele.",
  "",
  READ_FIRST_RULE,
  ONE_QUESTION_RULE,
  "",
  "ÇÖZÜM YOLU (birinciden farklı düşün):",
  "- Şıklı soruda mümkünse eleme ile git: her şıkkı kökteki koşula (özellikle criticalWords) vur; kalan tek şıkkı " +
    "işlemle veya tanımla doğrula.",
  "- İşlemli soruda sonucu başka yoldan bul (ters işlem, birim analizi, uç değer, yerine koyma) ve birinci yolla " +
    "aynı sayıya inip inmediğini check'e yaz.",
  "- Sözel/öncüllü soruda I-II-III öncüllerini tek tek doğru/yanlış işaretle, sonra bileşik şıkkı seç.",
  BACKCHECK_RULE,
  "",
  PLAIN,
  "",
  SOLUTION_JSON,
].join("\n");

/** Eski ad: yalnız-cevap çağrısı. Artık tam bağımsız çözüm (şık eleyici); testler bu adı okur. */
export const QUICK_SYSTEM = ADVOCATE_SYSTEM;

export function solverUserText(note?: string): string {
  return [
    "Görseldeki/aşağıdaki soruyu standart akademik yolla, adım adım çöz. Önce soruyu birebir yaz, sonra çöz, sonra sağlamasını yap.",
    note ? `Öğrencinin notu ya da sorusu: ${note.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function advocateUserText(note?: string): string {
  return [
    "Görseldeki/aşağıdaki soruyu BAĞIMSIZ çöz. Şeytanın avukatı ol: cevabı yerine koy, diğer şıkları ele. " +
      "Başka bir çözümden kopyalama; sen görmüyorsun.",
    note ? `Öğrencinin notu ya da sorusu: ${note.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const str = (value: unknown, max = 2000): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const letterOf = (value: unknown): string | undefined => {
  const text = str(value, 8).toUpperCase().replace(/[^A-EÇĞİÖŞÜ]/g, "");
  return text ? text.charAt(0) : undefined;
};

/** Modelin JSON'unu güvenli çözüme çevirir; bozuksa null. */
export function parseSolution(raw: unknown): Solution | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const readable = row.readable !== false;
  const options = (Array.isArray(row.options) ? row.options : [])
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { letter: letterOf(o.letter) ?? "", text: str(o.text, 400) };
    })
    .filter((o) => o.letter && o.text);
  const answerRow = (row.answer ?? {}) as Record<string, unknown>;
  const answer: SolverAnswer = {
    letter: letterOf(answerRow.letter),
    value: str(answerRow.value, 120) || undefined,
    text: str(answerRow.text, 600),
  };
  const steps = (Array.isArray(row.steps) ? row.steps : [])
    .map((item) => {
      const s = (item ?? {}) as Record<string, unknown>;
      return { title: str(s.title, 80) || undefined, math: str(s.math, 400) || undefined, say: str(s.say, 400) };
    })
    .filter((s) => s.say || s.math)
    .slice(0, 10);
  const optionsWhy = (Array.isArray(row.optionsWhy) ? row.optionsWhy : [])
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return { letter: letterOf(o.letter) ?? "", why: str(o.why, 400), correct: o.correct === true };
    })
    .filter((o) => o.letter && o.why);
  const solution: Solution = {
    readable,
    subject: str(row.subject, 60),
    question: str(row.question, 3000),
    options,
    kind: options.length ? "mcq" : row.kind === "mcq" ? "mcq" : "open",
    intro: str(row.intro, 400),
    given: (Array.isArray(row.given) ? row.given : []).map((g) => str(g, 200)).filter(Boolean).slice(0, 10),
    asked: str(row.asked, 300),
    steps,
    answer,
    optionsWhy,
    trap: str(row.trap, 400),
    tip: str(row.tip, 400),
    check: str(row.check, 400),
    questionNumber: str(row.questionNumber, 12) || undefined,
    otherQuestions: (Array.isArray(row.otherQuestions) ? row.otherQuestions : [])
      .map((item) => str(typeof item === "number" ? String(item) : item, 12))
      .filter(Boolean)
      .slice(0, 30),
    criticalWords: (Array.isArray(row.criticalWords) ? row.criticalWords : [])
      .map((item) => str(item, 40))
      .filter(Boolean)
      .slice(0, 12),
  };
  if (!readable) return solution;
  if (!solution.question || !(answer.text || answer.letter || answer.value)) return null;
  return solution;
}

export function parseQuick(raw: unknown): QuickAnswer {
  const row = (raw ?? {}) as Record<string, unknown>;
  const nested = (row.answer ?? {}) as Record<string, unknown>;
  return {
    letter: letterOf(row.letter) ?? letterOf(nested.letter),
    value: str(row.value, 60) || str(nested.value, 60) || undefined,
  };
}

/** İkinci tam çözümden hızlı cevap; yoksa parseQuick. */
export function quickFrom(raw: unknown): QuickAnswer {
  const solution = parseSolution(raw);
  if (solution?.readable) return { letter: solution.answer.letter, value: solution.answer.value };
  return parseQuick(raw);
}

/** "4,8 cm" → 4.8; "1/2" → 0.5; sayı yoksa null. */
export function numericOf(text: string | undefined): number | null {
  if (!text) return null;
  const fraction = text.match(/(-?\d+)\s*\/\s*(\d+)/);
  if (fraction && Number(fraction[2]) !== 0) return Number(fraction[1]) / Number(fraction[2]);
  const match = text.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(",", "."));
}

/** İki çözüm aynı cevabı mı veriyor: şıklıda harf, açık uçluda sayı (göreli 1e-6) ya da metin. */
export function answersAgree(solution: Solution, quick: QuickAnswer): boolean {
  if (solution.kind === "mcq") return Boolean(solution.answer.letter && quick.letter && solution.answer.letter === quick.letter);
  const a = numericOf(solution.answer.value ?? solution.answer.text);
  const b = numericOf(quick.value);
  if (a !== null && b !== null) return Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-6);
  const norm = (t?: string) => (t ?? "").toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");
  return Boolean(norm(solution.answer.value) && norm(solution.answer.value) === norm(quick.value));
}

/**
 * Kodla doğrulanabilen sorunlar: şıklı soruda cevap şıklardan biri değil; adımların aritmetiği tutmuyor; sayısal
 * şıklarda cevabın değeri işaretlenen şıkla uyuşmuyor. Boş dizi = kod bir sorun görmedi.
 */
export function solutionIssues(solution: Solution): string[] {
  const issues: string[] = [];
  if (solution.kind === "mcq") {
    const option = solution.options.find((o) => o.letter === solution.answer.letter);
    if (!option) issues.push("Cevap şıklardan biri değil.");
    const optionValue = numericOf(option?.text);
    const answerValue = numericOf(solution.answer.value);
    if (option && optionValue !== null && answerValue !== null && /^[\s\d.,/%-]+[\p{L}²³/ ]*$/u.test(option.text)) {
      if (Math.abs(optionValue - answerValue) > Math.max(1e-6, Math.abs(optionValue) * 1e-6)) {
        issues.push(`Bulunan değer (${solution.answer.value}) işaretlenen şıkla (${option.text}) uyuşmuyor.`);
      }
    }
  }
  for (const step of solution.steps) {
    for (const issue of stepArithmeticIssues(step.math ?? "")) issues.push(`Hesap tutmuyor: ${issue}`);
  }
  return issues;
}

export const RECONCILE_SYSTEM = [
  "Sen sınav sorularının hakemisin. Aynı soru iki farklı açıdan çözüldü (analitik yol ve şık eleyici / tersine " +
    "sağlama) ve sonuçlar farklı çıktı ya da hesapta/öncülde çelişki bulundu. İki çözümü ve ara işlemleri karşılaştır; " +
    "en ufak aritmetik, işaret veya öncül çelişkisi varsa soruyu baştan, yüksek dikkatle KENDİN çöz ve doğru sonucu " +
    "kesinleştir. Sağlaması yapılmamış tahmini seçme. Emin değilsen sure:false döndür.",
  READ_FIRST_RULE,
  BACKCHECK_RULE,
  // 24 Ekim 2026 lansman testi: öğrencinin kartına "İlk çözümdeki B cevabı doğrudur. İkinci çözümdeki C cevabı
  // yanlıştır." yazıldı; karşılaştırma iç süreç, öğrenci yalnız soruyu görür.
  "Çözümün hiçbir alanında 'birinci/ikinci çözüm', 'ilk çözüm', 'öbür çözüm' gibi karşılaştırmadan söz etme; öğrenciye " +
    "yalnız sorunun çözümünü yaz.",
  "",
  PLAIN,
  "",
  ONE_QUESTION_RULE,
  "",
  "Aynı JSON şemasında tam çözüm döndür ve ek olarak \"sure\": true|false alanını ekle.",
].join("\n");

export function reconcileUserText(solution: Solution, quick: QuickAnswer, issues: string[], advocate?: Solution | null): string {
  return [
    "ANALİTİK ÇÖZÜM (JSON):",
    JSON.stringify(solution),
    advocate
      ? `ŞEYTANIN AVUKATI ÇÖZÜMÜ (JSON):\n${JSON.stringify(advocate)}`
      : `İKİNCİ ÇÖZÜMÜN CEVABI: ${quick.letter ?? "-"} ${quick.value ?? ""}`.trim(),
    issues.length ? `KODUN BULDUĞU SORUNLAR:\n${issues.map((i) => `- ${i}`).join("\n")}` : "",
    "İki sonuç farklıysa veya işlemde çelişki varsa soruyu baştan kendin çöz; ilk tahmini seçme.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
