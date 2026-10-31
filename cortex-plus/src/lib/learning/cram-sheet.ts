import type { LessonBlock, LessonV3 } from "@/lib/learning/lesson-v3";

/**
 * Sınav sabahı kâğıdı (31 Ekim 2026, Paket J3 #14, ürün sahibinin isteği): hazırlığın kayıtlı derslerinden,
 * öğretmen analizinin "Sınavda sorulur" maddelerinden ve öğrencinin en çok yanıldığı noktalardan tek sayfalık
 * son tekrar. **Model çağrısı yok**: her satır zaten kayıtlı ve denetlenmiş bir içeriğin kopyası; kod metin yazmaz,
 * yalnız seçer, tekrarı atar ve kırpar. Konular yolun sırasıyla; kâğıt yazdırılınca yaklaşık bir A4 sayfasına
 * sığsın diye sayı sınırlı (`CRAM_LIMITS`). Yükleyici `cram-sheet-load.ts`; bu dosya saf (istemci de okur).
 */

export const CRAM_SHEET_TITLE = "⚡ Sınav Sabahı 15 Dakikalık Son Tekrar & Formül Kağıdı";
export const CRAM_PRINT_LABEL = "Yazdır / PDF olarak kaydet";
export const CRAM_EMPTY_TEXT =
  "Önce birkaç ders bitir: formüller, sınav tuzakları, hafıza çivileri ve en çok yanıldığın noktalar burada tek sayfada toplanır.";
export const CRAM_WEAK_HEADING = "🎯 En çok yanıldığın noktalar";

export function examPrepCramSheetHref(prepId: string): string {
  return `/deneme-sinavlari/${prepId}/sinav-sabahi`;
}

export type CramKind = "formula" | "exam" | "trap" | "mnemonic" | "hook" | "remember" | "warn" | "point" | "procedure";

/** Kâğıtta satırın önündeki küçük etiket. */
export const CRAM_KIND_LABEL: Record<CramKind, string> = {
  formula: "Formül",
  exam: "Sınav ipucu",
  trap: "Sınav tuzağı",
  mnemonic: "Ezber kodu",
  hook: "Hafıza çivisi",
  remember: "Akılda tut",
  warn: "Dikkat",
  point: "Sınavda sorulur",
  procedure: "Adımlar",
};

/** Konunun payı dolunca önce bunlar kalır: formül ve sınav ipucu, sonra tuzak ve hafıza, en son adım listesi. */
const KIND_ORDER: readonly CramKind[] = ["formula", "exam", "trap", "mnemonic", "hook", "remember", "warn", "point", "procedure"];

export const CRAM_LIMITS = {
  /** Bütün konuların toplam satırı (iki sütunlu A4). */
  total: 36,
  perTopicMax: 6,
  perTopicMin: 2,
  weakSpots: 8,
  focusTopics: 3,
  text: 170,
  title: 70,
} as const;

export type CramItem = { kind: CramKind; title: string | null; text: string };
export type CramSection = { topic: string; percent: number | null; weak: boolean; items: CramItem[] };
export type CramWeakSpot = { text: string; topic: string | null };
export type CramFocusTopic = { label: string; percent: number | null };

export type CramSheet = {
  sections: CramSection[];
  weakSpots: CramWeakSpot[];
  focusTopics: CramFocusTopic[];
  itemCount: number;
  empty: boolean;
};

export type CramSheetInput = {
  /** Yolun sırasıyla konular; `key` derslerin ve maddelerin bağlandığı anahtar. */
  topics: readonly { key: string; label: string }[];
  /** Kayıtlı dersler (eskiden yeniye). `topicKey` yoksa ya da hiçbir konuya uymuyorsa dersin adıyla ayrı bölüm. */
  lessons: readonly { topicKey: string | null; lesson: LessonV3 }[];
  examPoints?: readonly { topicKey: string; points: readonly string[] }[];
  /** Öncelik sırasıyla (en çok yanılınan önce). */
  weakSpots?: readonly CramWeakSpot[];
  /** En zayıf konular (tek seçici `rankFinalStepTopics`). */
  focusTopics?: readonly CramFocusTopic[];
};

const clean = (value: unknown): string => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/** Tekrar anahtarı: vurgu ve matematik işaretleri, noktalama ve büyük harf yok sayılır. */
export function cramKey(text: string): string {
  return text
    .replace(/\*\*|==|\$/g, " ")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}=+\-*/^<>≤≥≠%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uzun metni kelime sınırında kırpar. Kırpılan yerde açık kalan `$…$` matematiği ve `**`/`==` vurgusu
 * yarım bırakılmaz (yarım işaret ekranda ham karakter olarak görünürdü).
 */
export function clipCramText(text: string, max: number = CRAM_LIMITS.text): string {
  const value = clean(text);
  if (value.length <= max) return value;
  let cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  if (space > max * 0.6) cut = cut.slice(0, space);
  if ((cut.match(/\$/g)?.length ?? 0) % 2 === 1) cut = cut.slice(0, cut.lastIndexOf("$"));
  for (const mark of ["**", "=="]) {
    if (cut.split(mark).length % 2 === 0) cut = cut.slice(0, cut.lastIndexOf(mark));
  }
  return `${cut.replace(/[\s,;:.–-]+$/u, "")}…`;
}

function item(kind: CramKind, title: unknown, text: unknown): CramItem | null {
  const body = clean(text);
  if (body.length < 2) return null;
  // Ders notunun başlığı çoğu zaman türün adıyla başlıyor ("Sınav ipucu: Deflasyon ile dezenflasyon"); kâğıtta tür zaten
  // etiket olarak duruyor, başlık onu ikinci kez yazmasın (31 Ekim 2026 canlı deneme: "Sınav ipucu Sınav ipucu: …").
  const label = CRAM_KIND_LABEL[kind].toLocaleLowerCase("tr-TR");
  let head = clean(title);
  if (head.toLocaleLowerCase("tr-TR").startsWith(label)) head = head.slice(label.length).replace(/^[\s:·–-]+/u, "");
  return { kind, title: head ? clipCramText(head, CRAM_LIMITS.title) : null, text: body };
}

function blockItems(block: LessonBlock, fallbackTitle: string): CramItem[] {
  switch (block.type) {
    case "formula": {
      const symbols = block.formula.symbols?.length
        ? block.formula.symbols.map((entry) => `${entry.symbol}: ${entry.meaning}`).join("; ")
        : clean(block.formula.note);
      const row = item("formula", block.formula.title, block.formula.expression);
      return row ? [{ ...row, text: symbols ? `${row.text} — ${symbols}` : row.text }] : [];
    }
    case "procedure": {
      const steps = block.procedure.steps.map((step) => clean(step.label)).filter(Boolean);
      const row = steps.length >= 2 ? item("procedure", block.procedure.title ?? fallbackTitle, steps.join(" → ")) : null;
      return row ? [row] : [];
    }
    case "note": {
      const tone = block.note.tone;
      const kind: CramKind | null =
        tone === "exam" ? "exam" : tone === "remember" ? "remember" : tone === "mnemonic" ? "mnemonic" : tone === "warn" ? "warn" : null;
      // Genel bilgi, birim ve düz bilgi kutusu sabah kâğıdına girmez: kâğıt sınavın vurduğu yeri taşır.
      const row = kind ? item(kind, block.note.title, block.note.body) : null;
      return row ? [row] : [];
    }
    case "exam_trap_card": {
      const { title, wrong, right } = block.trap;
      const row = item("trap", title, `Sakın: ${clean(wrong)} · Doğrusu: ${clean(right)}`);
      return row ? [row] : [];
    }
    case "memory_hook_card": {
      const row = item("hook", block.hook.title, block.hook.body);
      return row ? [row] : [];
    }
    default:
      return [];
  }
}

/** Bir dersin kâğıda girebilecek satırları (ekran sırasıyla) ve dersin "sık yapılan hata"sı. */
export function collectLessonCram(lesson: LessonV3): CramItem[] {
  const rows: CramItem[] = [];
  for (const screen of lesson.screens) {
    const fallback = clean(screen.concept) || clean(screen.heading);
    for (const block of screen.blocks) rows.push(...blockItems(block, fallback));
  }
  if (lesson.commonMistake) {
    const row = item(
      "trap",
      "Sık yapılan hata",
      `Sakın: ${clean(lesson.commonMistake.claim)} · Doğrusu: ${clean(lesson.commonMistake.correction)}`,
    );
    if (row) rows.push(row);
  }
  return rows;
}

function rankOf(kind: CramKind): number {
  const index = KIND_ORDER.indexOf(kind);
  return index < 0 ? KIND_ORDER.length : index;
}

type Bucket = { topic: string; key: string | null; candidates: CramItem[] };

/** Aynı satır iki kez yazılmaz: birebir anahtar ya da ilk 60 karakteri aynı (aynı formül iki derste). */
function makeDeduper() {
  const seen = new Set<string>();
  const prefixes = new Set<string>();
  return (row: { kind?: CramKind; text: string }): boolean => {
    const base = cramKey(row.text);
    if (!base) return false;
    const key = row.kind === "formula" ? `f:${cramKey(row.text.split(" — ")[0] ?? row.text)}` : base;
    const prefix = base.length >= 40 ? base.slice(0, 60) : null;
    if (seen.has(key) || (prefix && prefixes.has(prefix))) return false;
    seen.add(key);
    if (prefix) prefixes.add(prefix);
    return true;
  };
}

/**
 * Kâğıdı kurar. Her konu önce adil payını alır (toplam ÷ konu, 2 ile 6 arası); kalan yer yolun sırasıyla
 * dolar. Bölümde satırlar türe göre (formül önce), türün içinde dersteki sırayla.
 */
export function buildCramSheet(input: CramSheetInput): CramSheet {
  const fresh = makeDeduper();
  const buckets: Bucket[] = input.topics.map((topic) => ({ topic: clean(topic.label), key: topic.key, candidates: [] }));
  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket] as const));
  const extra = new Map<string, Bucket>();

  for (const { topicKey, lesson } of input.lessons) {
    let bucket = topicKey ? byKey.get(topicKey) : undefined;
    if (!bucket) {
      const name = clean(lesson.title) || "Diğer";
      bucket = extra.get(name.toLocaleLowerCase("tr"));
      if (!bucket) {
        bucket = { topic: name, key: null, candidates: [] };
        extra.set(name.toLocaleLowerCase("tr"), bucket);
      }
    }
    bucket.candidates.push(...collectLessonCram(lesson));
  }
  for (const { topicKey, points } of input.examPoints ?? []) {
    const bucket = byKey.get(topicKey);
    if (!bucket) continue;
    for (const point of points) {
      const row = item("point", null, point);
      if (row) bucket.candidates.push(row);
    }
  }

  const ordered = [...buckets, ...extra.values()];
  // Tekrarı baştan at: aynı formül iki konuda varsa yolun ilk konusunda kalır.
  for (const bucket of ordered) {
    bucket.candidates = bucket.candidates
      .map((row, index) => ({ row, index }))
      .sort((a, b) => rankOf(a.row.kind) - rankOf(b.row.kind) || a.index - b.index)
      .map(({ row }) => row)
      .filter((row) => fresh(row));
  }

  const filled = ordered.filter((bucket) => bucket.candidates.length > 0);
  const share = Math.max(
    CRAM_LIMITS.perTopicMin,
    Math.min(CRAM_LIMITS.perTopicMax, Math.floor(CRAM_LIMITS.total / Math.max(1, filled.length))),
  );
  const taken = new Map<Bucket, number>();
  let budget: number = CRAM_LIMITS.total;
  for (const bucket of filled) {
    const count = Math.min(share, bucket.candidates.length, budget);
    taken.set(bucket, count);
    budget -= count;
  }
  for (const bucket of filled) {
    if (budget <= 0) break;
    const now = taken.get(bucket) ?? 0;
    const more = Math.min(CRAM_LIMITS.perTopicMax - now, bucket.candidates.length - now, budget);
    if (more > 0) {
      taken.set(bucket, now + more);
      budget -= more;
    }
  }

  const focusTopics = (input.focusTopics ?? [])
    .filter((topic) => clean(topic.label))
    .slice(0, CRAM_LIMITS.focusTopics)
    .map((topic) => ({ label: clean(topic.label), percent: topic.percent ?? null }));
  const focusByKey = new Map(focusTopics.map((topic) => [topic.label.toLocaleLowerCase("tr"), topic] as const));

  const sections: CramSection[] = filled
    .map((bucket) => {
      const focus = focusByKey.get(bucket.topic.toLocaleLowerCase("tr"));
      return {
        topic: bucket.topic,
        percent: focus?.percent ?? null,
        weak: Boolean(focus),
        items: bucket.candidates
          .slice(0, taken.get(bucket) ?? 0)
          .map((row) => ({ ...row, text: clipCramText(row.text) })),
      };
    })
    .filter((section) => section.items.length > 0);

  const freshSpot = makeDeduper();
  const weakSpots: CramWeakSpot[] = [];
  for (const spot of input.weakSpots ?? []) {
    if (weakSpots.length >= CRAM_LIMITS.weakSpots) break;
    const text = clean(spot.text);
    if (text.length < 4 || !freshSpot({ text })) continue;
    weakSpots.push({ text: clipCramText(text), topic: clean(spot.topic) || null });
  }

  const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  return { sections, weakSpots, focusTopics, itemCount, empty: itemCount === 0 && weakSpots.length === 0 };
}

/** Kayıtlı tekrar öğesinin kâğıt satırı: soru → doğrusu. Doğru/yanlışta yanlış önermenin doğru hâli. */
export function reviewItemCramText(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  if (row.mode === "recall") {
    const front = clean(row.front);
    const back = clean(row.back);
    return front && back ? `${front} → ${back}` : null;
  }
  const prompt = clean(row.prompt);
  if (!prompt) return null;
  const correct = Array.isArray(row.correct) ? row.correct.map(clean).filter(Boolean) : [];
  if (row.trueFalse === true) {
    const corrected = clean(row.corrected);
    if (corrected) return `${prompt} → Doğrusu: ${corrected}`;
    return correct.length ? `${prompt} → ${correct[0]}` : null;
  }
  return correct.length ? `${prompt} → Doğrusu: ${correct.join(", ")}` : null;
}

/** Yanlış defteri satırı: soru → doğru cevap. */
export function mistakeCramText(question: unknown, answer: unknown): string | null {
  const prompt = clean(question);
  const correct = clean(answer);
  if (!prompt) return null;
  return correct ? `${prompt} → Doğrusu: ${correct}` : null;
}
