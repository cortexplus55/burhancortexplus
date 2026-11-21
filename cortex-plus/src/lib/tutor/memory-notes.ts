import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import { parseModelOutput } from "@/lib/ai/json-repair";
import { isReasoningModel, samplingParams } from "@/lib/ai/model-params";
import { contentModel } from "@/lib/ai/model-router";
import { openaiClient } from "@/lib/ai/openai-client";
import { recordUsage } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { missingRelation } from "@/lib/learning/missing-column";

/*
  Öğretmen notları (Faz 11, teacher.v2, 21 Kasım 2026, ürün sahibinin kararı): oturum bitince öğretmen bir sonraki derste
  işine yarayacak en çok üç kısa öğrenme gözlemi yazar ("… kuralında takılıyor", "kısa adımları tercih ediyor"). Notlar
  yalnız mesajlardaki kanıttan; kişisel ya da hassas bilgi (ad, aile, sağlık, duygu, kişilik, iletişim) yazılmaz, kod da
  ayrıca süzer. Öğrenciden kredi DÜŞMEZ; kullanım `TUTOR_MEMORY_NOTE` koduyla kayda geçer (sohbet başlığı gibi).

  Tetik (yalnız bayrak açıkken ve ana sohbette, yanıttan SONRA `after()` içinde; öğrenciyi bekletmez):
  - oturum bitti: aynı konuşmanın bir önceki öğretmen mesajı bu turdan 30 dakikadan önceyse, önceki bölümün son ≤12 mesajı;
  - uzun konuşma: konuşma her 8. öğretmen mesajına ulaşınca, son ≤12 mesaj.
  Tek küçük model çağrısı (içerik modeli, düşük düşünme, JSON). Tablo yoksa (göç uygulanmadı) sessizce atlanır.
*/

export const TUTOR_NOTES_TABLE = "tutor_memory_notes";
export const NOTE_SESSION_GAP_MS = 30 * 60 * 1000;
export const NOTE_EVERY_ASSISTANT = 8;
export const NOTE_WINDOW = 12;
export const NOTE_MIN_WINDOW = 4;
export const NOTE_MAX = 3;
export const NOTE_MAX_WORDS = 12;
export const NOTE_MAX_CHARS = 160;
export const NOTES_READ_LIMIT = 5;
export const NOTE_KINDS = ["stuck", "preference", "strength"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export type NoteMessage = { role: string; content: string; createdAt: string | null };
export type TutorNote = { note: string; kind: NoteKind };

export type NotesTrigger = {
  /** welcome_answer (öğretmen v3): öğrenci karşılamada nasıl öğrendiğini anlattı; tetik beklenmez, konuşmada bir kez. */
  reason: "session_gap" | "every_eighth" | "welcome_answer";
  /** Özetlenecek mesajlar, eskiden yeniye. */
  window: NoteMessage[];
  /** Bu bölüm için not daha önce yazıldı mı sorusunun eşiği: bu andan sonra yazılmış not varsa atlanır. */
  anchor: string | null;
};

const timeOf = (value: string | null | undefined): number => {
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
};

/** Aynı turun iki mesajı aynı işlemde yazılır (aynı zaman damgası): öğrenci mesajı önce gelir. */
const roleRank = (row: NoteMessage) => (row.role === "user" ? 0 : 1);

/**
 * Bu turda not yazılmalı mı (saf). `newestFirst`: konuşmanın en yeni mesajları (bu turun öğrenci mesajı ve az önce
 * kaydedilen öğretmen cevabı dahil; ikisi aynı zaman damgasını taşıyabilir). `assistantCount`: konuşmadaki toplam
 * öğretmen mesajı (bu tur dahil).
 */
export function notesTrigger(input: {
  newestFirst: readonly NoteMessage[];
  assistantCount: number;
  now?: Date;
  /** Öğretmen v3: karşılama cevabı turu; 30 dk / 8 mesaj tetiği beklenmez (en az bir öğrenci mesajı yeter). */
  force?: "welcome";
}): NotesTrigger | null {
  const chrono = input.newestFirst
    .filter((row) => row.role === "user" || row.role === "assistant")
    .map((row, index) => ({ row, index }))
    .sort((a, b) => timeOf(a.row.createdAt) - timeOf(b.row.createdAt) || roleRank(a.row) - roleRank(b.row) || b.index - a.index)
    .map((entry) => entry.row);
  if (input.force === "welcome") {
    if (!chrono.some((row) => row.role === "user")) return null;
    return { reason: "welcome_answer", window: chrono.slice(-NOTE_WINDOW), anchor: null };
  }
  if (chrono.length < NOTE_MIN_WINDOW) return null;
  const latest = chrono[chrono.length - 1]!;
  const currentAt = timeOf(latest.createdAt) || (input.now ?? new Date()).getTime();
  const previous = [...chrono].reverse().find((row) => row.role === "assistant" && timeOf(row.createdAt) < currentAt);
  if (previous && currentAt - timeOf(previous.createdAt) > NOTE_SESSION_GAP_MS) {
    const segment = chrono.filter((row) => timeOf(row.createdAt) <= timeOf(previous.createdAt)).slice(-NOTE_WINDOW);
    if (segment.length >= NOTE_MIN_WINDOW && segment.some((row) => row.role === "user")) {
      return { reason: "session_gap", window: segment, anchor: previous.createdAt };
    }
  }
  if (input.assistantCount > 0 && input.assistantCount % NOTE_EVERY_ASSISTANT === 0) {
    return { reason: "every_eighth", window: chrono.slice(-NOTE_WINDOW), anchor: latest.createdAt };
  }
  return null;
}

export const NOTES_SYSTEM =
  "Bir özel ders öğretmenisin. Aşağıda öğrencinle yaptığın kısa bir sohbet bölümü var. Bir sonraki derste işine yarayacak " +
  `EN ÇOK ${NOTE_MAX} kısa öğrenme gözlemi çıkar. Kurallar:\n` +
  "- Yalnız bu mesajlarda açık kanıtı olan gözlem: öğrencinin takıldığı kural ya da adım, karıştırdığı iki kavram, tercih " +
  "ettiği anlatım (kısa adımlar, benzetme, örnek gibi), sağlamlaştırdığı bir beceri.\n" +
  `- Her gözlem en çok ${NOTE_MAX_WORDS} kelime, tek cümle, üçüncü tekil şahıs ("… karıştırıyor", "… tercih ediyor").\n` +
  "- Kişisel ya da hassas bilgi YAZMA: ad, yaş, okul, aile, sağlık, duygu durumu, kişilik yorumu, iletişim bilgisi yok.\n" +
  "- Tahmin etme ve uydurma; kanıt yoksa boş dizi döndür.\n" +
  'Yalnız JSON döndür: {"notes":[{"note":"…","kind":"stuck|preference|strength"}]} — stuck: takıldığı nokta, ' +
  "preference: tercih ettiği anlatım, strength: sağlamlaşan beceri.";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Sunucunun eklediği işaretler ([[…]]) ve kaynak listesi modele gitmez. */
function plainTurn(content: string): string {
  return String(content ?? "")
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\n+Kaynaklar:[\s\S]*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Karşılama cevabında öğrencinin kendi anlattığı da kanıttır (hocanın vurgusu tercih notu olarak yazılır). */
export const WELCOME_NOTES_PREFACE =
  "NOT: Bu bölümde öğrenci kendi öğrenme biçimini, zorlandığı yeri ya da hocasının neyi vurguladığını anlattı; " +
  "onun bu söyledikleri de kanıttır. Hocasının vurgusunu 'preference' türüyle yaz ('hocası … vurguluyor' gibi).";

export function notesUserPrompt(window: readonly NoteMessage[], options: { welcome?: boolean } = {}): string {
  const lines = window
    .map((row) => {
      const text = clip(plainTurn(row.content), 600);
      if (!text) return "";
      return `${row.role === "user" ? "Öğrenci" : "Öğretmen"}: ${text}`;
    })
    .filter(Boolean);
  return `${options.welcome ? `${WELCOME_NOTES_PREFACE}\n\n` : ""}SOHBET BÖLÜMÜ:\n${lines.join("\n")}`;
}

/** Türkçe küçük harf, aksansız (eşleştirme için). */
function fold(text: string): string {
  return String(text ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

/**
 * Öğrencinin kendisine dair kişisel ya da hassas bilgi (genel Türkçe sözcükler; ders ya da konu sözcüğü yok). Asıl kural
 * istemde; bu süzgeç yedektir ve dar tutulur: "ilaç etkileşimi", "aile (sınıflandırma)" gibi ders içeriği düşmesin diye
 * yalnız öğrencinin kendi durumunu anlatan biçimler aranır (iyelik ekli aile sözcükleri, "ilaç kullanıyor" …).
 */
const SENSITIVE =
  /\b(?:saglik sorun\w*|saglig\w*|hastalan\w*|hastaligi\w*|rahatsizlig\w*|ilac kullan\w*|tedavi gor\w*|terapi\w*|depres\w*|kaygi\w*|anksiyete\w*|panik atak\w*|stresli\w*|uzgun\w*|mutsuz\w*|aglad\w*|intihar\w*|kendine zarar|ailesi\w*|annesi\w*|babasi\w*|kardesi\w*|bosan\w*|borc\w*|sevgili\w*|cinsel\w*|adresi\w*|telefonu\w*|e ?posta\w*|mail\w*|kimlik\w*|tembel\w*|zeki\b|zekas\w*|aptal\w*|yeteneksiz\w*|kisilig\w*)/u;

export function isSensitiveNote(note: string): boolean {
  const text = fold(note);
  return SENSITIVE.test(text) || /@/.test(text) || /\d{6,}/.test(text.replace(/\s+/g, ""));
}

/** Gözlemi taşımayan genel sözcük kökleri (kanıt sayılmaz). */
const GENERIC_STEMS = new Set([
  "ogren", "ogret", "anlat", "terci", "konud", "konus", "konun", "sorud", "sorul", "sorun", "cevap", "yapiy", "ediyo",
  "karis", "zorla", "takil", "unutu", "gerek", "kolay", "hizli", "basit", "dogru", "yanli", "seviy",
  "istiy", "yapma", "kulla", "bulma", "hatas", "hatal", "sonra", "zaman", "genel",
]);

/** Gözlemin en az bir içerik kökü sohbet bölümünde geçiyor mu (modelsiz kanıt denetimi). */
export function groundedInWindow(note: string, windowText: string): boolean {
  const have = new Set(
    fold(windowText)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 4)
      .map((word) => word.slice(0, 5)),
  );
  return fold(note)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 5)
    .map((word) => word.slice(0, 5))
    .some((stem) => !GENERIC_STEMS.has(stem) && have.has(stem));
}

const wordsOf = (text: string) => text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));

/** Modelin cevabı → en çok 3 geçerli not (kısa, tür doğru, hassas değil, sohbette kanıtı var, tekrarsız). */
export function parseTutorNotes(raw: string, windowText: string): TutorNote[] {
  let parsed: unknown;
  try {
    parsed = parseModelOutput(raw);
  } catch {
    return [];
  }
  const list = Array.isArray((parsed as { notes?: unknown } | null)?.notes) ? (parsed as { notes: unknown[] }).notes : [];
  const out: TutorNote[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (out.length >= NOTE_MAX) break;
    const row = (item ?? {}) as { note?: unknown; kind?: unknown };
    const note = typeof row.note === "string" ? row.note.replace(/\s+/g, " ").trim() : "";
    const kind = (NOTE_KINDS as readonly string[]).includes(String(row.kind)) ? (row.kind as NoteKind) : null;
    if (!note || !kind) continue;
    if (note.length > NOTE_MAX_CHARS || wordsOf(note).length > NOTE_MAX_WORDS || wordsOf(note).length < 2) continue;
    if (isSensitiveNote(note) || !groundedInWindow(note, windowText)) continue;
    const key = fold(note).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ note, kind });
  }
  return out;
}

type ChatClient = Pick<OpenAI, "chat">;

/** Tek küçük model çağrısı; düşerse boş. */
export async function generateTutorNotes(input: {
  client: ChatClient;
  model: string;
  window: readonly NoteMessage[];
  signal?: AbortSignal;
  welcome?: boolean;
}): Promise<{ notes: TutorNote[]; tokensIn: number; tokensOut: number }> {
  const user = notesUserPrompt(input.window, { welcome: input.welcome });
  // Kanıt yalnız mesajlardan: karşılama ön notunun sözcükleri bir gözlemi "kanıtlamaz".
  const evidence = notesUserPrompt(input.window);
  const response = await input.client.chat.completions.create(
    {
      model: input.model,
      ...samplingParams(input.model, { temperature: 0.2, maxTokens: 300 }),
      ...(isReasoningModel(input.model) ? { reasoning_effort: "low" as const } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: NOTES_SYSTEM },
        { role: "user", content: user },
      ],
    },
    { signal: input.signal, timeout: 20_000, maxRetries: 0 },
  );
  return {
    notes: parseTutorNotes(response.choices[0]?.message?.content ?? "", evidence),
    tokensIn: response.usage?.prompt_tokens ?? 0,
    tokensOut: response.usage?.completion_tokens ?? 0,
  };
}

type Rows<T> = { data: T[] | null; error: { message?: string; code?: string } | null; count?: number | null };

export type NotesRunResult = { written: number; reason: string };

/**
 * Yanıttan sonra çağrılır; asla fırlatmaz. Tetik yoksa, tablo yoksa ya da bu bölüm için not zaten yazıldıysa model
 * çağrılmaz. Testte sahte istemci ve model verilebilir.
 */
export async function maybeWriteTutorNotes(
  service: SupabaseClient,
  input: {
    userId: string;
    conversationId: string;
    now?: Date;
    client?: ChatClient;
    model?: string;
    /** Öğretmen v3: karşılama cevabı turunda tetik beklenmez; aynı konuşmada bir kez. */
    force?: "welcome";
  },
): Promise<NotesRunResult> {
  try {
    const [recent, assistants] = await Promise.all([
      service
        .from("messages")
        .select("role, content, created_at")
        .eq("conversation_id", input.conversationId)
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(NOTE_WINDOW + 2) as unknown as PromiseLike<Rows<{ role: string; content: string; created_at: string | null }>>,
      service
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", input.conversationId)
        .eq("user_id", input.userId)
        .eq("role", "assistant") as unknown as PromiseLike<Rows<never>>,
    ]);
    if (recent.error || assistants.error) return { written: 0, reason: "history_unavailable" };
    const trigger = notesTrigger({
      newestFirst: (recent.data ?? []).map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at })),
      assistantCount: Number(assistants.count ?? 0),
      now: input.now,
      force: input.force,
    });
    if (!trigger) return { written: 0, reason: "no_trigger" };

    // Aynı bölüm için not zaten yazıldı mı; aynı sorgu tablonun varlığını da sınar (göç yoksa sessizce atlanır).
    // Karşılama turunda eşik yok: bu konuşmada herhangi bir not varsa yazılmaz (bir kez).
    let existing = service.from(TUTOR_NOTES_TABLE).select("id").eq("user_id", input.userId).eq("conversation_id", input.conversationId);
    if (trigger.anchor) existing = existing.gte("created_at", trigger.anchor);
    const prior = (await (existing.limit(1) as unknown as PromiseLike<Rows<{ id: string }>>));
    if (prior.error) return { written: 0, reason: missingRelation(prior.error) ? "table_missing" : "notes_unavailable" };
    if (prior.data?.length) return { written: 0, reason: "already_noted" };

    const client = input.client ?? (env.OPENAI_API_KEY ? openaiClient({ apiKey: env.OPENAI_API_KEY }) : null);
    if (!client) return { written: 0, reason: "ai_not_configured" };
    const model = input.model ?? contentModel();
    const result = await generateTutorNotes({ client, model, window: trigger.window, welcome: trigger.reason === "welcome_answer" });
    await recordUsage(service, {
      userId: input.userId,
      actionCode: "TUTOR_MEMORY_NOTE",
      model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    }).catch(() => undefined);
    if (!result.notes.length) {
      console.info("tutor_memory_notes", { reason: trigger.reason, written: 0 });
      return { written: 0, reason: "no_notes" };
    }
    const { error } = await service.from(TUTOR_NOTES_TABLE).insert(
      result.notes.map((note) => ({
        user_id: input.userId,
        conversation_id: input.conversationId,
        note: note.note,
        kind: note.kind,
      })),
    );
    if (error) {
      console.warn("tutor_memory_notes_write_failed", { code: error.code ?? null });
      return { written: 0, reason: "write_failed" };
    }
    console.info("tutor_memory_notes", { reason: trigger.reason, written: result.notes.length });
    return { written: result.notes.length, reason: trigger.reason };
  } catch (error) {
    console.warn("tutor_memory_notes_failed", { cause: error instanceof Error ? error.name : "unknown" });
    return { written: 0, reason: "failed" };
  }
}

export const NOTES_LIST_LIMIT = 20;

export type TutorNoteRow = { id: string; note: string; kind: NoteKind; createdAt: string | null };

/**
 * "Öğretmenin seni nasıl tanıyor" (öğretmen v3, Ayarlar): öğrencinin kendi son 20 notu, yeniden eskiye. Yalnız
 * `user_id` süzgeciyle. Tablo yoksa boş liste; başka okuma hatasında null (uç 503 döner).
 */
export async function listTutorNotes(service: SupabaseClient, userId: string): Promise<TutorNoteRow[] | null> {
  try {
    const { data, error } = (await (service
      .from(TUTOR_NOTES_TABLE)
      .select("id, note, kind, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTES_LIST_LIMIT) as unknown as PromiseLike<
      Rows<{ id: string; note: string | null; kind: string | null; created_at: string | null }>
    >));
    if (error) return missingRelation(error) ? [] : null;
    return (data ?? [])
      .map((row) => ({
        id: String(row.id),
        note: String(row.note ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX_CHARS),
        kind: (NOTE_KINDS as readonly string[]).includes(String(row.kind)) ? (row.kind as NoteKind) : "stuck",
        createdAt: row.created_at ?? null,
      }))
      .filter((row) => row.note);
  } catch {
    return null;
  }
}

/**
 * Öğrencinin notunu (`id`) ya da bütün notlarını (`all`) siler; yalnız kendi satırları (`user_id` süzgeci). Tablo yoksa
 * 0. Başka hata null.
 */
export async function deleteTutorNotes(
  service: SupabaseClient,
  userId: string,
  target: { id: string } | { all: true },
): Promise<number | null> {
  try {
    let query = service.from(TUTOR_NOTES_TABLE).delete().eq("user_id", userId);
    if ("id" in target) query = query.eq("id", target.id);
    const { data, error } = (await (query.select("id") as unknown as PromiseLike<Rows<{ id: string }>>));
    if (error) return missingRelation(error) ? 0 : null;
    return (data ?? []).length;
  } catch {
    return null;
  }
}

/** Son notlar (en çok 5, tekrarsız, yeniden eskiye). Tablo yoksa ya da okunamazsa boş. */
export async function loadTutorNotes(service: SupabaseClient, userId: string): Promise<TutorNote[]> {
  try {
    const { data, error } = (await (service
      .from(TUTOR_NOTES_TABLE)
      .select("note, kind, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(NOTES_READ_LIMIT * 3) as unknown as PromiseLike<Rows<{ note: string | null; kind: string | null }>>));
    if (error) {
      if (!missingRelation(error)) console.warn("tutor_memory_notes_read_failed", { code: error.code ?? null });
      return [];
    }
    const seen = new Set<string>();
    const out: TutorNote[] = [];
    for (const row of data ?? []) {
      const note = String(row.note ?? "").replace(/\s+/g, " ").trim();
      if (!note || isSensitiveNote(note)) continue;
      const key = fold(note).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = (NOTE_KINDS as readonly string[]).includes(String(row.kind)) ? (row.kind as NoteKind) : "stuck";
      out.push({ note: note.slice(0, NOTE_MAX_CHARS), kind });
      if (out.length >= NOTES_READ_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}
