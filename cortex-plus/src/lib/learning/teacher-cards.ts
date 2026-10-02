import { CONTENT_STYLE } from "@/lib/ai/content-style";
import { sourceText, type TeacherLessonMode } from "@/lib/learning/teacher-lesson";
import { issuesByItem, teacherItemLoop, type Reviewed } from "@/lib/learning/teacher-item-loop";

/**
 * Öğretmen kart motoru (2 Ekim 2026, ürün sahibinin kararı: tüm içerik yeni
 * motora). Kart: ön yüz öğrenciyi HATIRLAMAYA zorlayan bir ipucu, arka yüz
 * kısa ve kesin cevap. Taslak → her kartı belgeyle eşleyen model denetimi →
 * sorunlu kartın düzeltilmesi. Kod kart metnine dokunmaz (eski yol
 * verifyFlashcard ile ön ve arka yüzü "cilalıyordu").
 */

export type TeacherCard = { front: string; back: string; difficulty?: "easy" | "medium" | "hard" };

export type TeacherCardsInput = {
  topicLabel: string;
  prepTitle: string;
  pages: { page: number; text: string }[];
  mode?: TeacherLessonMode;
  count: number;
  /** "spaced": aralıklı tekrar — çekirdek tanım ve formül önce. */
  focus?: "cards" | "spaced";
  learnerLine?: string;
  runningHeaders?: string[];
};

const SCHEMA = `{
  "cards": [
    { "front": "hatırlatan ipucu ya da soru (cevabı içermez)", "back": "kısa, kesin cevap; 1-2 cümle", "difficulty": "hard" | "medium" | "easy" }
  ]
}`;

const RULE_DOCUMENT =
  "KAYNAK KURALI (kesin): Her kartın bilgisi yalnızca KAYNAK'tan gelir; kaynakta yoksa kart yazma, genel kültürden " +
  "ekleme. Kaynaktaki bozuk ya da yanlış yazılmış kelimeleri doğru Türkçeyle yaz; açıkça bozuk bir kaynak cümlesinin " +
  "kaynağın kendi örnekleriyle tutarlı anlamını kullan ve bundan söz etme.\n\n";

const RULE_TOPIC =
  "BİLGİ KURALI (belgesiz, kesin): Öğrencinin belgesi yok. Kartları sınav müfredatındaki yerleşik, tartışmasız bilgiden " +
  "yaz; emin olmadığın sayı, tarih, madde ya da kuralı yazma; güncel olarak değişebilecek bilgiyi yazma.\n\n";

function system(mode: TeacherLessonMode, focus: TeacherCardsInput["focus"]): string {
  return (
    "Sen Cortex Plus'ın usta öğretmenisin. Öğrencin sınava hazırlanıyor; ona tekrar kartları hazırlıyorsun. " +
    (mode === "topic" ? "Belgesi yok; konuyu ondan duydun.\n\n" : "Kartlar onun kendi ders belgesinden.\n\n") +
    (mode === "topic" ? RULE_TOPIC : RULE_DOCUMENT) +
    "KART TASARIMI:\n" +
    "- Ön yüz öğrenciyi hatırlamaya zorlar: bir soru, bir durum ya da bir ipucu. Cevabı ya da cevabın kelimelerini içermez.\n" +
    "- Türleri karıştır: terimden tanıma; tanımdan terime; bir durumdan kavrama; karıştırılan iki kavramın farkı " +
    "('X ile Y'yi ayıran ne?'); kaynakta formül ya da sayı varsa onun anlamı.\n" +
    "- Arka yüz kısa ve kesin: 1-2 cümle; ayırt ettiren noktayı söyler. Tek kart tek bilgi.\n" +
    "- Ön yüzün tek doğru cevabı olsun; birden fazla terim akla geliyorsa ipucunu daralt.\n" +
    "- difficulty: zor kartlar listenin başında.\n" +
    (focus === "spaced" ? "- ARALIKLI TEKRAR: konunun çekirdek tanımları ve formülleri önce gelsin.\n" : "") +
    "\nYAZMA: 'Kaynak:', sayfa numarası, 'metne göre', 'belgede'.\n\n" +
    `${CONTENT_STYLE}\n\nYalnızca bu şemada JSON döndür:\n${SCHEMA}`
  );
}

export function cardsSystem(mode: TeacherLessonMode = "document", focus: TeacherCardsInput["focus"] = "cards"): string {
  return system(mode, focus);
}

export function cardsUserPrompt(input: TeacherCardsInput, ask = input.count): string {
  return [
    `SINAV: ${input.prepTitle}`,
    `KONU: ${input.topicLabel}`,
    `KART SAYISI: ${ask}`,
    input.learnerLine ? `ÖĞRENCİ: ${input.learnerLine}` : "",
    input.runningHeaders?.length
      ? `Şu satırlar sayfa kenarında tekrar eden başlıklardır, konu değildir: ${input.runningHeaders.join(" | ")}`
      : "",
    input.mode === "topic" ? "KAYNAK: (yok — belgesiz; konunun yerleşik bilgisiyle yaz)" : `KAYNAK:\n${sourceText(input.pages)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function cardsVerifySystem(mode: TeacherLessonMode = "document"): string {
  return (
    "Sen titiz bir içerik denetçisisin. Tekrar kartlarını " +
    (mode === "topic" ? "doğruluk açısından denetliyorsun (belge yok). " : "yazıldıkları KAYNAK ile karşılaştırıyorsun. ") +
    "Her kartın ön yüzünü önce kendin cevapla, sonra arka yüzle karşılaştır. Şunları bul:\n" +
    (mode === "topic"
      ? "A) Arka yüzde yanlış ya da tartışmalı bilgi; emin olunamayacak kadar ayrıntılı ya da güncel değişebilecek bilgi.\n"
      : "A) Arka yüzde kaynakta dayanağı olmayan ya da kaynakla çelişen bilgi.\n") +
    "B) Arka yüz ön yüzün sorduğunu cevaplamıyor ya da eksik cevaplıyor.\n" +
    "C) Ön yüzün birden fazla doğru cevabı var; ipucu belirsiz.\n" +
    "D) Ön yüz cevabı veriyor.\n" +
    "E) Bozuk, anlamsız ya da yarım Türkçe cümle.\n" +
    "A-E 'high'. Şunlar 'low': kolay kart.\n" +
    'JSON döndür: {"issues":[{"item":0,"severity":"high","problem":"…","fix":"…"}]} — item, 0\'dan başlayan kart ' +
    "sırasıdır. Sorun yoksa issues boş dizi."
  );
}

export function cardsVerifyUserPrompt(cards: TeacherCard[], input: TeacherCardsInput): string {
  const head =
    input.mode === "topic"
      ? `SINAV: ${input.prepTitle}\nKONU: ${input.topicLabel}\n(Belgesiz kartlar.)`
      : `KAYNAK:\n${sourceText(input.pages)}`;
  return `${head}\n\nKARTLAR (JSON):\n${JSON.stringify({ cards })}`;
}

export function cardsFixSystem(mode: TeacherLessonMode = "document", focus: TeacherCardsInput["focus"] = "cards"): string {
  return (
    "Sen aynı kartları yazan öğretmensin. Denetçinin sorun bulduğu kartları düzelt; düzeltilemiyorsa aynı bilgiyi soran " +
    "yeni bir kart yaz. Önerilen düzeltme ('→' sonrası) varsa uygula. Yalnız verilen kartları, aynı sayıda ve sırayla " +
    "döndür. Kurallar ve şema aynı:\n\n" +
    system(mode, focus)
  );
}

export function cardsFixUserPrompt(failing: Reviewed<TeacherCard>[], input: TeacherCardsInput): string {
  return [
    cardsUserPrompt(input, failing.length),
    `DÜZELTİLECEK KARTLAR (JSON):\n${JSON.stringify({ cards: failing.map((row) => row.item) })}`,
    `SORUNLAR:\n${failing.map((row, index) => `Kart ${index}: ${row.problems.join(" | ")}`).join("\n")}`,
    "Düzeltilmiş kartları aynı şemayla JSON olarak döndür.",
  ].join("\n\n");
}

/** Model çıktısını kart tipine oturtur; yalnız boşluk kırpar. */
export function parseTeacherCards(raw: unknown): TeacherCard[] | null {
  const list = (raw as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(list)) return null;
  const cards = list.flatMap((entry): TeacherCard[] => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const front = typeof row.front === "string" ? row.front.trim() : "";
    const back = typeof row.back === "string" ? row.back.trim() : "";
    if (front.length < 4 || back.length < 2) return [];
    const difficulty = row.difficulty === "hard" || row.difficulty === "medium" || row.difficulty === "easy" ? row.difficulty : undefined;
    return [{ front: front.slice(0, 200), back: back.slice(0, 400), ...(difficulty ? { difficulty } : {}) }];
  });
  return cards.length ? cards : null;
}

/** Yapı denetimi (saf): cevabı sızdıran ön yüz, aynı yüzler, kaynak notu. */
export function cardStructureIssues(card: TeacherCard): string[] {
  const issues: string[] = [];
  const front = card.front.toLocaleLowerCase("tr");
  const back = card.back.toLocaleLowerCase("tr").replace(/[.!]+$/, "");
  if (front === back) issues.push("Ön ve arka yüz aynı.");
  else if (back.length > 3 && back.split(/\s+/).length <= 4 && front.includes(back)) issues.push("Ön yüz cevabı içeriyor.");
  if (/kaynak\s*:|\bs\.\s?\d+|\bsayfa\s+\d+|\bpdf\b|metne göre|belgede/i.test(`${card.front} ${card.back}`)) {
    issues.push("Kartta kaynak/sayfa notu ya da 'metne göre' var; çıkar.");
  }
  return issues;
}

/** Kartlar zor → orta → kolay sıralanır (sıra değişir, metin değişmez). */
export function hardFirst(cards: TeacherCard[]): TeacherCard[] {
  const rank = (card: TeacherCard) => (card.difficulty === "hard" ? 0 : card.difficulty === "medium" ? 1 : card.difficulty === "easy" ? 2 : 1);
  return cards.map((card, index) => ({ card, index })).sort((a, b) => rank(a.card) - rank(b.card) || a.index - b.index).map((row) => row.card);
}

export type AskJson = (system: string, user: string) => Promise<unknown | null>;

export const CARD_SPARE = 2;

export async function teacherCardsLoop(ask: AskJson, input: TeacherCardsInput, started = Date.now()) {
  const mode = input.mode ?? "document";
  const focus = input.focus ?? "cards";
  const loop = await teacherItemLoop<TeacherCard>({
    count: input.count,
    started,
    deadlineMs: 200_000,
    maxFixRounds: 2,
    draft: async () => parseTeacherCards(await ask(cardsSystem(mode, focus), cardsUserPrompt(input, input.count + CARD_SPARE))),
    review: async (cards) => {
      const structural = cards.map(cardStructureIssues);
      try {
        const factual = issuesByItem(await ask(cardsVerifySystem(mode), cardsVerifyUserPrompt(cards, input)), cards.length);
        return cards.map((_, index) => [...structural[index], ...factual[index]]);
      } catch (error) {
        const note = `Denetim yapılamadı: ${error instanceof Error ? error.message.slice(0, 80) : "bilinmiyor"}`;
        return cards.map(() => [note]);
      }
    },
    fix: async (failing) => parseTeacherCards(await ask(cardsFixSystem(mode, focus), cardsFixUserPrompt(failing, input))),
  });
  return { cards: hardFirst(loop.items), rejected: loop.rejected, rounds: loop.rounds };
}
