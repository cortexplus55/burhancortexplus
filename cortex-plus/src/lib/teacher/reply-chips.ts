import { TEACH_MODE_SUMMARY, type TeachModeV2 } from "@/lib/learning/tutor-style";
import { parseQuickCheck } from "@/lib/teacher/quick-check";

/*
  Tepki çipleri (Faz 11, teacher.v2, 21 Kasım 2026). Öğretmen yanıtının altındaki tek dokunuşluk eylemler; saf ve
  modelsiz. Yanıt bir soruyla ya da mini yoklamayla bitiyorsa "soru adımı" çipleri (ipucu, Yanlışlar Defterine ekle, mini
  test), bitmiyorsa "anlatım" çipleri (anladım devam, günlük hayattan örnek, burayı aç). Hızlı Özet modunda anlatım
  çiplerinden ikisi. Çip istemleri öğretmenin tur tanıyıcılarıyla uyumlu: "Anladım, devam et." takip sayılır, ipucu
  isteği cevabı açtırmaz.
*/

export type ReplyChipKind = "prompt" | "mistake" | "quiz";

export type ReplyChip = {
  id: string;
  label: string;
  kind: ReplyChipKind;
  /** `prompt` türünde öğrencinin adına gönderilecek metin. */
  prompt?: string;
};

export const QUESTION_STEP_CHIPS: readonly ReplyChip[] = [
  { id: "hint", label: "🤔 Küçük bir ipucu ver", kind: "prompt", prompt: "Küçük bir ipucu ver; cevabı söyleme." },
  { id: "mistake", label: "📝 Bunu Yanlışlar Defterime ekle", kind: "mistake" },
  { id: "quiz", label: "🎯 Bu konudan mini test aç", kind: "quiz" },
];

export const EXPLANATION_CHIPS: readonly ReplyChip[] = [
  { id: "continue", label: "✅ Anladım, devam et", kind: "prompt", prompt: "Anladım, devam et." },
  { id: "example", label: "💡 Günlük hayattan örnek ver", kind: "prompt", prompt: "Bunu günlük hayattan bir örnekle anlat." },
  { id: "expand", label: "❓ Burayı biraz daha aç", kind: "prompt", prompt: "Burayı biraz daha açar mısın?" },
];

/** Hızlı Özet: özet zaten eksiksiz; sıradaki doğal istek örnek ya da ayrıntı. */
const SUMMARY_CHIP_IDS = ["example", "expand"] as const;

/** Sunucunun eklediği işaretler ([[…]]) ve kaynak listesi yanıtın sonu sayılmaz. */
function replyBody(reply: string): string {
  return String(reply ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/\n+Kaynaklar:\n[\s\S]*$/u, "")
    .trimEnd();
}

/** Yanıt öğrenciye bir soruyla ya da mini yoklamayla mı bitiyor (kutu ve formül dışındaki son blok). */
export function endsWithQuestion(reply: string): boolean {
  const body = replyBody(reply);
  if (!body) return false;
  const check = parseQuickCheck(body);
  if (check && !check.after) return true;
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const last = blocks[blocks.length - 1] ?? "";
  if (!last || /^>/.test(last) || /^\$\$/.test(last)) return false;
  return /\?\s*(?:\*\*)?\s*$/u.test(last.replace(/\$\$[\s\S]*?\$\$/g, ""));
}

export function replyChips(reply: string, mode: TeachModeV2): ReplyChip[] {
  if (mode === TEACH_MODE_SUMMARY) {
    return EXPLANATION_CHIPS.filter((chip) => (SUMMARY_CHIP_IDS as readonly string[]).includes(chip.id)).map((chip) => ({ ...chip }));
  }
  return (endsWithQuestion(reply) ? QUESTION_STEP_CHIPS : EXPLANATION_CHIPS).map((chip) => ({ ...chip }));
}

const STUDIO_QUIZ_PATH = "/studio/quiz";
const TOPIC_MAX = 80;

/** Genel sohbette mesajın başına eklenen ders etiketi ("[Ders] …") konunun parçası değildir. */
function topicText(value: string | null | undefined): string {
  const text = String(value ?? "")
    .replace(/^\s*\[[^\]\n]{1,40}\]\s*/, "")
    .replace(/\p{Extended_Pictographic}️?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > TOPIC_MAX ? `${text.slice(0, TOPIC_MAX - 1).trimEnd()}…` : text;
}

/**
 * "🎯 Bu konudan mini test aç": stüdyo testi konu metniyle öntanımlı açılır (`/studio/quiz?topic=…`). Konu önce
 * verilen konu adından (sohbet başlığı, hazırlık konusu), yoksa öğrencinin sorusundan; ikisi de yoksa boş stüdyo.
 */
export function miniQuizHref(input: { topic?: string | null; question?: string | null }): string {
  const topic = topicText(input.topic) || topicText(input.question);
  return topic ? `${STUDIO_QUIZ_PATH}?topic=${encodeURIComponent(topic)}` : STUDIO_QUIZ_PATH;
}
