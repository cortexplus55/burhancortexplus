/**
 * Çıkmış sorulardan "🎯 İkiz Sınav" (31 Ekim 2026, Paket J3 #11).
 *
 * Öğrencinin yüklediği belgelerde çıkmış sınav soruları ya da soru bankası varsa (numaralı soru kökleri; şıklı ya da
 * "açıklayınız / hesaplayınız" gibi yazılı soru kalıbı) yazılı deneme bu soruların konu dağılımını, kök kalıbını ve
 * zorluğunu örnek alır. Modelsiz: kod soruları tanır ve konulara sözcük köküyle eşler; yazara yalnız birkaç örnek kök
 * gider ("kopyalama, aynı soruyu sorma"). Kurulum ekranı ve üretim aynı ağırlığı okur (Paket A: gösterilen dağılım
 * teslim edilir). Bulunan soru 4'ten azsa ikiz sınav sunulmaz.
 */

export type PastQuestion = { text: string; kind: "mcq" | "open"; optionCount: number };

export type PastStyle = { count: number; samples: string[] };

export const PAST_MIN_QUESTIONS = 4;
export const TWIN_EXAM_LABEL = "🎯 Çıkmış Sorulara Göre İkiz Sınav";

const QUESTION_START = /^\s*(?:soru\s*)?(\d{1,3})\s*[).:\-–](?!\d)\s*(.+)$/i;
const OPTION_LINE = /^\s*\(?([A-Ea-e])\s*[).:\-–]\s*\S/;
const OPEN_VERB =
  /(açıklayınız|açıklayın|yazınız|hesaplayınız|bulunuz|gösteriniz|tartışınız|tanımlayınız|karşılaştırınız|belirtiniz|çiziniz|ispatlayınız|nelerdir|nedir|kaçtır|hangisidir|hangileridir|değildir)\b/i;

/** Metindeki çıkmış soru biçimli kökler. Ders notundaki düz numaralı liste soru sayılmaz (soru işareti, kalıp ya da şık şart). */
export function detectPastQuestions(text: string): PastQuestion[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const found: PastQuestion[] = [];
  let current: { stem: string; options: number } | null = null;
  const flush = () => {
    if (!current) return;
    const stem = current.stem.replace(/\s+/g, " ").trim();
    const asks = /\?/.test(stem) || OPEN_VERB.test(stem);
    if (stem.length >= 15 && (current.options >= 3 || asks)) {
      found.push({ text: stem.slice(0, 400), kind: current.options >= 3 ? "mcq" : "open", optionCount: current.options });
    }
    current = null;
  };
  for (const line of lines) {
    const start = QUESTION_START.exec(line);
    if (start && !OPTION_LINE.test(line)) {
      flush();
      current = { stem: start[2], options: 0 };
      continue;
    }
    if (!current) continue;
    if (OPTION_LINE.test(line)) {
      current.options += 1;
      continue;
    }
    // Kök birkaç satıra yayılabilir; şıklar başladıktan sonraki satır kökü uzatmaz.
    if (current.options === 0 && line.trim() && current.stem.length < 400) current.stem += ` ${line.trim()}`;
  }
  flush();
  const seen = new Set<string>();
  return found.filter((question) => {
    const key = question.text.toLocaleLowerCase("tr-TR").slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const STOP = new Set(["aşağıdakilerden", "hangisi", "hangisidir", "nedir", "olarak", "ile", "için", "veya", "göre", "ilgili", "verilen", "yukarıdaki"]);

function stems(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase("tr-TR")
      .replace(/[^a-zçğıöşü0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !STOP.has(word))
      .map((word) => word.slice(0, 5)),
  );
}

function bestTopic(question: PastQuestion, topics: Array<{ label: string; words: Set<string> }>): string | null {
  const words = stems(question.text);
  let best: { label: string; score: number } | null = null;
  let tie = false;
  for (const topic of topics) {
    let score = 0;
    for (const word of topic.words) if (words.has(word)) score += 1;
    if (!score) continue;
    if (!best || score > best.score) {
      best = { label: topic.label, score };
      tie = false;
    } else if (score === best.score) tie = true;
  }
  return best && !tie ? best.label : null;
}

/**
 * Çıkmış soruların konu payı (yüzde). Soruların yarısından azı bir konuya bağlanabiliyorsa boş: dağılım uydurulmaz,
 * kurulum kendi ağırlığıyla kalır.
 */
export function pastTopicWeights(questions: PastQuestion[], topicLabels: string[]): Map<string, number> {
  const topics = topicLabels.map((label) => ({ label, words: stems(label) })).filter((topic) => topic.words.size);
  const counts = new Map<string, number>();
  let matched = 0;
  for (const question of questions) {
    const label = bestTopic(question, topics);
    if (!label) continue;
    matched += 1;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  if (!questions.length || matched * 2 < questions.length) return new Map();
  return new Map([...counts].map(([label, count]) => [label, Math.max(1, Math.round((count / matched) * 100))]));
}

/** Yazarın göreceği örnekler: önce konuya bağlananlar, yoksa genel örnekler; en çok 3. */
export function pastSamplesFor(questions: PastQuestion[], topicLabel: string): string[] {
  const topicWords = stems(topicLabel);
  const related = questions.filter((question) => [...stems(question.text)].some((word) => topicWords.has(word)));
  return (related.length ? related : questions).slice(0, 3).map((question) => question.text.slice(0, 240));
}

export function pastStyleBrief(samples: string[]): string {
  if (!samples.length) return "";
  return [
    "ÇIKMIŞ SORU TARZI (hocanın önceki sınavından örnek kökler; KOPYALAMA, aynı soruyu sorma):",
    ...samples.map((sample) => `- ${sample}`),
    "Bu örneklerin kök kalıbını, uzunluğunu ve zorluğunu örnek al; yeni sayılar, yeni durumlar ve konunun başka noktalarıyla yaz.",
  ].join("\n");
}
