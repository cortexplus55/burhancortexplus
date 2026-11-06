/**
 * Sınav düzeyinde dengeli şık karıştırma (6 Kasım 2026, Paket 2).
 *
 * Canlıda havuzdan kurulan bir yazılı denemenin 10 sorusunun 10'unda doğru şık A ya da B'ydi: havuz sorusu şıkları
 * yazıldığı sırayla geliyordu (doğrulanmış havuzda doğru cevap %56 A, %24 B). Öğretmen motoru soru başına sabit
 * karıştırıyordu (`shuffleOptions`) ama testin bütününe bakan yoktu: beş soruda üç kez aynı harf olabiliyordu.
 *
 * Bu modül bir soru dizisine, soruların kimliğine bağlı ve deterministik bir şık sırası verir:
 * - tek doğrulu soruda doğru cevabın harfi o ana kadar en az kullanılan harftir (eşitlikte kimliğe bağlı sıra), yani
 *   her önekte harf sayıları en çok bir farklıdır;
 * - ardışık üç soruda aynı harf olmaz;
 * - 4 ve 5 şıklı (karışık da) sorular desteklenir; çok cevaplı soru kimliğine bağlı sırayla karışır, doğru şıkları
 *   sayıma girer;
 * - şıklara gönderme yapan soru ("Yalnız I", "I ve II", "Hepsi", açıklamada "B seçeneği") karıştırılmaz, harfi sayılır.
 *
 * Sıra ancak önceki sorulara bağlıdır: akan testte gösterilen soru sonradan değişmez, kalan sorular aynı geçmişle
 * devam eder. Saf; model çağrısı yok. Ders adı yok.
 */

export type BalanceInput = {
  /** Kimlik (havuz soru kimliği ya da soru metni): sıra buna bağlıdır. */
  key: string;
  options: readonly string[];
  /** Doğru şıkların bugünkü sıradaki yeri. */
  correct: readonly number[];
  /** Sırası değiştirilemeyen soru (şıklar birbirine ya da harfe gönderme yapıyor). */
  pinned?: boolean;
};

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function random(seed: string): () => number {
  let state = hash(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

/** `values` dizisinin kimliğe bağlı karışık hâli (Fisher-Yates, sabit tohum). */
function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const next = random(seed);
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(next() * (index + 1));
    [out[index], out[pick]] = [out[pick]!, out[index]!];
  }
  return out;
}

const fold = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr").replace(/[.!]+$/u, "");

/**
 * Şıkkın yeri anlam taşıyor mu: öncül kümesi (Roma rakamlarıyla "Yalnız I", "I ve II", "I, II ve III"), öbür şıklara
 * gönderme ("Hepsi", "Hiçbiri", "Yukarıdakilerin hepsi", "Her ikisi de", "A ve B").
 */
function crossReferenceOption(option: string): boolean {
  const text = fold(option);
  return (
    // Türkçe küçük harfte "I" → "ı".
    /^(yalnız\s+)?[iıvx]+(\s*(,|ve)\s*[iıvx]+)*$/u.test(text) ||
    /^(yukarıdaki(lerin|ler)?\s+)?(hepsi|hiçbiri|hiç biri|tümü)(\s+de)?$/u.test(text) ||
    /^her\s+ikisi(\s+de)?$/u.test(text) ||
    /^[a-e](\s*(,|ve|ile)\s*[a-e])+$/u.test(text)
  );
}

/** Açıklama şıkkı harfiyle anıyor ("B seçeneği", "C şıkkında"): karıştırılırsa açıklama yanlış şıkkı gösterir. */
const LETTER_REFERENCE = /(?<![\p{L}\p{N}])[A-E]\s*(?:şıkk|şık\b|seçeneğ|seçenek\b)/u;

/** Soru karıştırılmaz: şıklardan biri öbürlerine gönderme yapıyor ya da açıklama şıkkı harfiyle anıyor. */
export function orderSensitive(options: readonly string[], notes: readonly (string | null | undefined)[] = []): boolean {
  if (options.some(crossReferenceOption)) return true;
  return notes.some((note) => Boolean(note && LETTER_REFERENCE.test(note)));
}

/**
 * Her soru için yeni sıra: `order[gösterilen yer] = bugünkü yer`. `history` bu dizinin önündeki soruların doğru harfleri
 * (akan testte gösterilmiş sorular; çok cevaplı ya da şıksız soru için null).
 */
export function planBalancedOrders(items: readonly BalanceInput[], history: readonly (number | null)[] = []): number[][] {
  const counts = new Map<number, number>();
  const recent: (number | null)[] = [...history];
  for (const letter of history) if (letter !== null) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  const bump = (letter: number) => counts.set(letter, (counts.get(letter) ?? 0) + 1);
  const identity = (count: number) => Array.from({ length: count }, (_, index) => index);

  return items.map((item) => {
    const count = item.options.length;
    const correct = [...new Set(item.correct)].filter((index) => index >= 0 && index < count);
    if (count < 2 || !correct.length) {
      recent.push(null);
      return identity(count);
    }
    if (item.pinned) {
      for (const index of correct) bump(index);
      recent.push(correct.length === 1 ? correct[0]! : null);
      return identity(count);
    }
    if (correct.length > 1) {
      const order = seededShuffle(identity(count), `multi:${item.key}`);
      for (const index of correct) bump(order.indexOf(index));
      recent.push(null);
      return order;
    }
    const last = recent[recent.length - 1];
    const banned = recent.length >= 2 && last !== null && last !== undefined && recent[recent.length - 2] === last ? last : null;
    const candidates = identity(count).filter((letter) => letter !== banned);
    const fewest = Math.min(...candidates.map((letter) => counts.get(letter) ?? 0));
    const target = candidates
      .filter((letter) => (counts.get(letter) ?? 0) === fewest)
      .sort((a, b) => hash(`${item.key}:${a}`) - hash(`${item.key}:${b}`) || a - b)[0]!;
    const answer = correct[0]!;
    const rest = seededShuffle(
      identity(count).filter((index) => index !== answer),
      `rest:${item.key}`,
    );
    const order = [...rest.slice(0, target), answer, ...rest.slice(target)];
    bump(target);
    recent.push(target);
    return order;
  });
}

/** `order[gösterilen yer] = bugünkü yer` sırasını bir diziye uygular. Uzunluk tutmazsa dizi olduğu gibi. */
export function applyOrder<T>(values: readonly T[], order: readonly number[]): T[] {
  if (values.length !== order.length) return [...values];
  return order.map((index) => values[index]!);
}

/** Doğru şıkların gösterilen yerleri (sayım ve testler için). */
export function correctLetters(options: readonly string[], correct: readonly string[]): number[] {
  const keys = new Set(correct.map(fold));
  return options.map((option, index) => (keys.has(fold(option)) ? index : -1)).filter((index) => index >= 0);
}

/** Tek doğrulu sorunun harfi; çok cevaplı ya da eşleşmeyen soru için null. */
export function singleLetter(options: readonly string[], correct: readonly string[]): number | null {
  if (correct.length !== 1) return null;
  const letters = correctLetters(options, correct);
  return letters.length === 1 ? letters[0]! : null;
}

type OptionQuestion = {
  text: string;
  options: string[];
  correct: string[];
  explanation?: string;
  optionWhy?: string[];
  steps?: string[];
};

/**
 * Test motorunun soru listesi (konu testi, Araçlar, düello, odaklı pratik …): ilk `keep` soru (öğrenciye gösterilmiş)
 * olduğu gibi kalır ve harfleri geçmiş olur; kalanların şıkları dengelenir. Doğru cevap şık metniyle tutulduğu için
 * notlama değişmez; şık açıklaması (`optionWhy`) şıkkıyla birlikte taşınır.
 */
export function balanceQuizQuestions<T extends OptionQuestion>(questions: readonly T[], keep = 0): T[] {
  const kept = questions.slice(0, keep);
  const rest = questions.slice(keep);
  const history = kept.map((question) => singleLetter(question.options, question.correct));
  const orders = planBalancedOrders(
    rest.map((question) => {
      const correct = correctLetters(question.options, question.correct);
      return {
        key: question.text,
        options: question.options,
        correct,
        pinned:
          correct.length !== new Set(question.correct.map(fold)).size ||
          orderSensitive(question.options, [question.explanation, ...(question.optionWhy ?? []), ...(question.steps ?? [])]),
      };
    }),
    history,
  );
  return [
    ...kept,
    ...rest.map((question, index) => {
      const order = orders[index]!;
      const whyAligned = question.optionWhy?.length === question.options.length;
      return {
        ...question,
        options: applyOrder(question.options, order),
        ...(whyAligned ? { optionWhy: applyOrder(question.optionWhy!, order) } : {}),
      };
    }),
  ];
}

type ExamDraft = {
  text: string;
  type: string;
  options: string[];
  correctAnswers: string[];
  explanation?: string;
  optionWhy: string[];
};

const SHUFFLED_EXAM_TYPES = new Set(["mcq", "multi_mcq"]);

/**
 * Yazılı denemenin kâğıdı (öğretmen motoru): yalnız çoktan seçmeli ve çok cevaplı sorular sıraya girer; açık uçlu ve
 * doğru/yanlış olduğu gibi kalır. Kâğıt kaydına yazılmadan hemen önce çağrılır (`mockQuestionRows`): notlama, inceleme
 * ve yeniden açılış kayıttaki sırayı okur. Deterministik: aynı kâğıt yeniden yazılırsa aynı sıra çıkar.
 */
export function balanceExamDrafts<T extends ExamDraft>(questions: readonly T[]): T[] {
  const choice = questions.filter((question) => SHUFFLED_EXAM_TYPES.has(question.type) && question.options.length >= 2);
  const orders = planBalancedOrders(
    choice.map((question) => {
      const correct = correctLetters(question.options, question.correctAnswers);
      return {
        key: question.text,
        options: question.options,
        correct,
        pinned:
          correct.length !== new Set(question.correctAnswers.map(fold)).size ||
          orderSensitive(question.options, [question.explanation, ...question.optionWhy]),
      };
    }),
  );
  const byQuestion = new Map(choice.map((question, index) => [question, orders[index]!]));
  return questions.map((question) => {
    const order = byQuestion.get(question);
    if (!order) return question;
    return {
      ...question,
      options: applyOrder(question.options, order),
      optionWhy: question.optionWhy.length === question.options.length ? applyOrder(question.optionWhy, order) : question.optionWhy,
    };
  });
}

/** Havuz sorusu (item_bank): şıklar ve doğru şıkkın yeri. */
export type PoolChoiceItem = { id: string; choices: readonly unknown[]; answer: number; explanation?: string | null };

/**
 * Havuzdan gelen soru dizisi (Hızlı Tarama, Ünite Seviye Kontrolü, Pekiştirme, havuz testi, havuz denemesi): her
 * soruya gösterilecek sıra. `salt` aynı sorunun başka bir oturumda başka harfe düşmesini sağlar (deneme kimliği gibi);
 * sıra yine soru kimliğine bağlıdır.
 */
export function poolChoiceOrders(items: readonly PoolChoiceItem[], salt = ""): number[][] {
  return planBalancedOrders(
    items.map((item) => {
      const options = item.choices.map((choice) => String(choice ?? ""));
      return {
        key: `${salt}:${item.id}`,
        options,
        correct: [Number(item.answer)],
        pinned: orderSensitive(options, [item.explanation]),
      };
    }),
  );
}

/** `order` geçerli bir sıra mı (0..n-1, her biri bir kez). */
export function validOrder(order: unknown, length: number): order is number[] {
  if (!Array.isArray(order) || order.length !== length) return false;
  const seen = new Set<number>();
  for (const value of order) {
    if (!Number.isInteger(value) || value < 0 || value >= length || seen.has(value)) return false;
    seen.add(value);
  }
  return true;
}
