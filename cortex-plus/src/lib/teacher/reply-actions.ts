import { displayUserText } from "@/lib/chat/chat-display";
import { quickCheckAnswerPrompt, type QuickCheck } from "@/lib/teacher/quick-check";
import { miniQuizHref, replyChips } from "@/lib/teacher/reply-chips";
import type { TeachModeV2 } from "@/lib/learning/tutor-style";

/*
  Öğretmen sohbetinin istemci tarafındaki tepki eylemleri (Faz 11, teacher.v2, 21 Kasım 2026). Saf ve modelsiz; sohbet
  paneli ve yanıt görünümü bu dosyadan okur. Sunucu sözleşmeleri: `reply-chips.ts` (çipler), `quick-check.ts` (mini
  yoklama), `POST /api/teacher/mistake` (Yanlışlar Defteri).
*/

/** Yanıtın altındaki tek sıradaki bir eylem: öğrencinin mesajı, bağlantı ya da özel eylem (deftere ekle). */
export type ReplyAction = {
  id: string;
  label: string;
  /** Öğrencinin adına gönderilecek metin. */
  prompt?: string;
  /** Uygulama içi bağlantı. */
  href?: string;
  /** Özel eylem. */
  onSelect?: () => void;
  disabled?: boolean;
  busy?: boolean;
};

export type MistakeStatus = "saving" | "saved" | "already";

export const MISTAKE_NOTEBOOK_PATH = "/yanlislarim";
export const MISTAKE_SAVED_LINE = "Yanlışlar Defterine eklendi";
export const MISTAKE_ALREADY_LINE = "Zaten defterinde";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sunucu yalnız kayıtlı konuşma ve mesaj kimliğiyle ekler; kimlik yoksa çip hiç çizilmez (hiçbir şey yapmayan düğme yok). */
export function isSavedId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Konuşmanın varsayılan başlığı konu sayılmaz. */
const PLACEHOLDER_TITLES = new Set(["yeni sohbet"]);

/** Mini test konusu: konuşmanın başlığı, yoksa ana ekranda seçili hazırlığın konusu; ikisi de yoksa null (soru kullanılır). */
export function miniQuizTopic(input: { conversationTitle?: string | null; cockpitTopic?: string | null }): string | null {
  const title = String(input.conversationTitle ?? "").trim();
  if (title && !PLACEHOLDER_TITLES.has(title.toLocaleLowerCase("tr"))) return title;
  const topic = String(input.cockpitTopic ?? "").trim();
  return topic || null;
}

type ThreadMessage = { role: "user" | "assistant"; content: string };

/** Öğretmen yanıtının sorusu: yanıttan önceki en yakın öğrenci mesajı (ders etiketi atılır). */
export function questionBefore(messages: readonly ThreadMessage[], index: number): string | null {
  for (let at = index - 1; at >= 0; at -= 1) {
    const message = messages[at]!;
    if (message.role === "user") return displayUserText(message.content).trim() || null;
  }
  return null;
}

/**
 * Yoklamada seçilen şık: yanıtın hemen ardından gelen öğrenci mesajı bir şıkkın gönderdiği metinse o şıkkın harfi.
 * Seçim böylece sayfa yenilenince de görünür (kayıtlı sohbetten okunur).
 */
export function chosenQuickCheckLetter(check: QuickCheck, nextUser: string | null | undefined): string | null {
  if (!nextUser) return null;
  const sent = displayUserText(nextUser).trim();
  return check.options.find((option) => quickCheckAnswerPrompt(option) === sent)?.letter ?? null;
}

/**
 * Son öğretmen yanıtının eylemleri, `replyChips` sırasıyla. "Deftere ekle" yalnız kayıtlı mesajda (kimlikler yoksa çip
 * yok); beklerken ve eklendikten sonra kilitli. Mini test, stüdyo testine bağlantı.
 */
export function replyActions(input: {
  content: string;
  mode: TeachModeV2;
  messageId?: string | null;
  conversationId?: string | null;
  mistake?: MistakeStatus | null;
  quizTopic?: string | null;
  question?: string | null;
  onMistake?: () => void;
}): ReplyAction[] {
  const actions: ReplyAction[] = [];
  for (const chip of replyChips(input.content, input.mode)) {
    if (chip.kind === "prompt" && chip.prompt) {
      actions.push({ id: chip.id, label: chip.label, prompt: chip.prompt });
    } else if (chip.kind === "quiz") {
      actions.push({ id: chip.id, label: chip.label, href: miniQuizHref({ topic: input.quizTopic, question: input.question }) });
    } else if (chip.kind === "mistake" && isSavedId(input.messageId) && isSavedId(input.conversationId)) {
      actions.push({
        id: chip.id,
        label: chip.label,
        onSelect: input.onMistake,
        disabled: Boolean(input.mistake),
        busy: input.mistake === "saving",
      });
    }
  }
  return actions;
}

export type MistakeResult = { ok: true; already: boolean } | { ok: false; status: number };

/** `POST /api/teacher/mistake`. Ağ hatası 0 durumla döner; fırlatmaz. */
export async function postChatMistake(
  input: { conversationId: string; messageId: string },
  fetcher: typeof fetch = fetch,
): Promise<MistakeResult> {
  try {
    const response = await fetcher("/api/teacher/mistake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body = (await response.json().catch(() => null)) as { ok?: boolean; already?: boolean } | null;
    return body?.ok ? { ok: true, already: body.already === true } : { ok: false, status: 503 };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Başarısız eklemenin sade iletisi: mesaj bulunamadıysa ya da sorusu yoksa eklenemez; öbür durumlarda yeniden dene. */
export function mistakeErrorLine(status: number): string {
  if (status === 404 || status === 422) return "Bu yanıt deftere eklenemedi.";
  if (status === 429) return "Çok hızlı denedin; biraz sonra yeniden dene.";
  return "Şu an deftere eklenemedi; biraz sonra yeniden dene.";
}
