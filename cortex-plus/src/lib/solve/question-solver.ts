import { stepArithmeticIssues } from "@/lib/solve/step-arithmetic";

/*
  Soru çözücü (23 Ekim 2026; ürün sahibi: "fotoğraftan ya da yazılı her soru, en çok 15 sn, en anlaşılır dil,
  Astra tarzı, kendi tasarımımızla; doğruluk %100'e yakın").

  Astra'da on dersten on soru çözdürüldü (`docs/delivery/SORU-COZUCU-23-EKIM.md`): hepsi doğru; sözel sorular 3-10 sn,
  işlemli sorular 17-27 sn. Yaklaşımı derse göre değişiyor: işlemli soruda "verilenler → istenen → adım adım çözüm
  tahtası → cevap"; sözel soruda "cevap önce → her şık neden doğru/yanlış → karıştırılan nokta / unutma kutusu".

  Bizde doğruluk tek çağrıya bırakılmaz: aynı soru iki bağımsız çağrıyla çözülür (biri tam anlatım, biri yalnız
  cevap). Cevaplar tutarsa ve kod hesabı doğrularsa çözüm gösterilir; tutmazsa üçüncü çağrı iki çözümü karşılaştırır,
  yine tutmazsa öğrenciye "emin değiliz" denir. Model yalnız luna (ürün sahibinin kararı); denetçi ayrı.
*/

export type SolverOption = { letter: string; text: string };
export type SolverStep = { math?: string; say: string };
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
};

export type QuickAnswer = { letter?: string; value?: string };

const PLAIN =
  "Dil: sınava hazırlanan, konuyu yeni öğrenen bir öğrenciye konuşur gibi; kısa cümleler, günlük kelimeler, terimi " +
  "ilk geçtiği yerde bir cümleyle açıkla. Gereksiz giriş, övgü ve 'harika soru' yok.";

export const SOLVER_SYSTEM = [
  "Sen sınav sorularını çözen ve öğrenciye en anlaşılır biçimde anlatan bir öğretmensin. Soru bir fotoğraftan ya da " +
    "yazılı metinden gelir; her ders olabilir (matematik, fizik, kimya, biyoloji, Türkçe, tarih, coğrafya, felsefe, " +
    "yabancı dil, tıp, hukuk, KPSS, YKS, TUS…).",
  "",
  "ÖNCE OKU: Soruyu ve şıkları kâğıttaki gibi aynen yaz; her şık kendi harfiyle. Görsel okunmuyorsa ya da soru eksikse " +
    "readable:false döndür ve çözüm uydurma.",
  "",
  "SONRA ÇÖZ, DOĞRU ÇÖZ: Cevaptan emin olmadan yazma; işlemleri tek tek yap, sonucu soruda istenen birimle ver. Şıklı " +
    "soruda cevap mutlaka şıklardan biri olur ve answer.letter o şıkkın harfidir.",
  "",
  "ANLATIM (soruya göre):",
  "- İşlemli soruda (hesap, formül, problem): given (verilenler), asked (istenen), steps: her adım bir satır işlem " +
    "(math, sembolle: a = Δv / t = 20 / 4 = 5 m/s²) ve bir cümle açıklama (say). 3-7 adım.",
  "- Sözel soruda (kavram, kural, tarih, dil): önce cevap; optionsWhy: her şık için bir cümle, neden doğru ya da " +
    "neden yanlış (şık hangi kavrama/döneme/kurala ait). steps gerekmez.",
  "- trap: öğrencinin en çok karıştırdığı nokta (bir cümle). tip: akılda kalacak kısa kural ya da kısa yol (bir cümle). " +
    "check: işlemli soruda sonucun mantıklı olduğunu gösteren kısa kontrol (bir cümle); sözel soruda boş bırak.",
  "- intro: soruya nasıl yaklaşacağımızı söyleyen tek cümle.",
  "",
  PLAIN,
  "",
  'Yalnızca JSON döndür: {"readable":true,"subject":"Fizik","question":"…","options":[{"letter":"A","text":"…"}],' +
    '"kind":"mcq","intro":"…","given":["…"],"asked":"…","steps":[{"math":"…","say":"…"}],' +
    '"answer":{"letter":"B","value":"40 m","text":"Araç 4 saniyede 40 metre yol alır."},' +
    '"optionsWhy":[{"letter":"A","why":"…","correct":false}],"trap":"…","tip":"…","check":"…"}',
].join("\n");

export const QUICK_SYSTEM =
  "Sen sınav sorusu çözen bir öğretmensin. Soruyu dikkatle oku ve çöz; işlemleri tek tek yap. Yalnız cevabı ver. " +
  'Şıklı soruda şıkkın harfi, sayısal soruda sayı (birimsiz, ondalık virgülle). JSON: {"letter":"B","value":"40"}. ' +
  "Şık yoksa letter boş, okunmuyorsa ikisi de boş.";

export function solverUserText(note?: string): string {
  return ["Görseldeki/aşağıdaki soruyu çöz.", note ? `Öğrencinin notu ya da sorusu: ${note.slice(0, 1500)}` : ""]
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
      return { math: str(s.math, 400) || undefined, say: str(s.say, 400) };
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
  };
  if (!readable) return solution;
  if (!solution.question || !(answer.text || answer.letter || answer.value)) return null;
  return solution;
}

export function parseQuick(raw: unknown): QuickAnswer {
  const row = (raw ?? {}) as Record<string, unknown>;
  return { letter: letterOf(row.letter), value: str(row.value, 60) || undefined };
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
  "Sen sınav sorularını çözen titiz bir öğretmensin. Aynı soru iki kez çözüldü ve sonuçlar farklı çıktı ya da hesapta " +
    "sorun bulundu. Soruyu baştan, dikkatle kendin çöz; iki çözümü ve sorunları kontrol et; doğru olanı seç ya da " +
    "düzelt. Emin değilsen sure:false döndür.",
  "",
  PLAIN,
  "",
  "Aynı JSON şemasında tam çözüm döndür ve ek olarak \"sure\": true|false alanını ekle.",
].join("\n");

export function reconcileUserText(solution: Solution, quick: QuickAnswer, issues: string[]): string {
  return [
    "BİRİNCİ ÇÖZÜM (JSON):",
    JSON.stringify(solution),
    `İKİNCİ ÇÖZÜMÜN CEVABI: ${quick.letter ?? "-"} ${quick.value ?? ""}`.trim(),
    issues.length ? `KODUN BULDUĞU SORUNLAR:\n${issues.map((i) => `- ${i}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
