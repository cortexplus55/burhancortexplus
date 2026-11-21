import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MASTERY_ROW_COLUMNS,
  masterySnapshotFromRow,
  topicBadge,
  topicMasteryPercent,
} from "@/lib/learning/learning-tracking";
import type { MasteryBadge } from "@/lib/learning/mastery-policy";
import { withoutOutcomeCode } from "@/lib/learning/path-labels";
import { MEMORY_HEADER, studentMemoryLines } from "@/lib/learning/student-memory/prompt";
import { topicLabelsMatch } from "@/lib/learning/topic-identity";
import { DOSSIER_TTL_MS, loadStudentDossier } from "@/lib/teacher/dossier-load";
import type { Dossier } from "@/lib/teacher/dossier";
import { loadTutorNotes, type TutorNote } from "@/lib/tutor/memory-notes";

/*
  Öğrenci bağlamı (Faz 11, teacher.v2, 21 Kasım 2026). Öğretmenin bir turda bilmesi gereken her şey tek bloktan: Öğrenci
  Dosyası (yükleyicisi ve 10 dk önbelleği aynen kullanılır), öğrenme hafızası (dosyayla birlikte okunur), çözülmemiş son
  yanlışlar, ölçülen konu durumu (Zayıf / Gelişiyor / bildiğini düşünüp çeldiricide yanılma), yaklaşan sınavlar ve
  öğretmen notları. Aynı okumadan modelsiz en çok dört karşılama kartı çıkar.

  Kurallar: istem bloğunda iç tablo ya da sistem adı yok; "geçen gün" gibi anı uydurulmaz, yalnız kayıtta olan yazılır.
  Dosyanın üstüne yalnız üç sorgu (açık yanlışlar, konu hâkimiyeti, notlar); hepsi öğrencinin `user_id`'siyle, sınırlı ve
  aynı anda; sonuç dosyanın süresiyle önbellekte. Bir kaynak düşerse o satır yoktur, bağlam yine kurulur.
*/

export type TutorOpenMistake = { topicLabel: string | null; question: string; wrongCount: number };

export type TutorTopicState = {
  prepId: string;
  prepTitle: string;
  topic: string;
  badge: MasteryBadge;
  /** Yeterlilik yanılsaması: bildiğini düşünüyor ama çeldirici noktalarda yanılıyor. */
  illusion: boolean;
  percent: number;
};

export type TutorStartCardKind = "weak" | "exam" | "photo" | "analogy";

export type TutorStartCard = {
  id: string;
  kind: TutorStartCardKind;
  emoji: string;
  /** Kartta görünen metin (emojisiz). */
  label: string;
  /** Kart seçilince öğrencinin adına gönderilecek mesaj. */
  prompt: string;
  /** Kartın bağlandığı hazırlık (varsa): sohbet o hazırlığın bağlamında başlar. */
  prepId: string | null;
};

export type TutorContextSignals = {
  weak: TutorTopicState[];
  developing: TutorTopicState[];
  illusion: TutorTopicState[];
  openMistakes: TutorOpenMistake[];
  exams: { prepId: string; title: string; daysLeft: number }[];
  notes: TutorNote[];
};

export type TutorStudentContext = {
  /** Öğretmen istemine giden blok; kayıt yoksa boş. */
  promptBlock: string;
  cards: TutorStartCard[];
  /** Hiçbir kayıt yok (yalnız iki genel kart). */
  empty: boolean;
  signals: TutorContextSignals;
};

export type TutorContextExtras = {
  openMistakes: TutorOpenMistake[];
  masteryRows: Record<string, unknown>[];
  notes: TutorNote[];
};

export const TUTOR_CONTEXT_LIMIT = 1800;
export const TUTOR_CARD_MAX = 4;
/** Karşılamada "yaklaşan sınav" kartı bu kadar gün kalınca çıkar (açılış cümlesiyle aynı ufuk). */
export const EXAM_CARD_DAYS = 30;
const OPEN_MISTAKE_LIMIT = 5;
const MASTERY_LIMIT = 120;

export const TUTOR_CONTEXT_HEADER =
  "ÖĞRENCİNİN ÇALIŞMA KAYITLARI (yalnız bu satırlar gerçek kayıttır; bir cümleyi YALNIZ burada eşleşen bir kayıt varsa " +
  "kur; anı uydurma, burada olmayan geçmişi kurma; tanı, sağlık ve kişilik yorumu yapma; listeyi öğrenciye okuma, " +
  "yalnız konuyla ilgiliyse tek cümleyle kullan):";
export const TUTOR_NOTES_HEADER = "Öğretmen notları (önceki derslerden kısa gözlemler; yalnız bunlar gerçek):";

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const clean = (text: unknown) => withoutOutcomeCode(String(text ?? "").replace(/\s+/g, " ").trim());

/** Konu hâkimiyeti satırları → bilinen hazırlıklardaki ölçülmüş konular (rozet ekrandaki kuraldan). */
export function topicStates(dossier: Pick<Dossier, "preps"> | null, rows: readonly Record<string, unknown>[]): TutorTopicState[] {
  const preps = new Map((dossier?.preps ?? []).map((prep) => [prep.id, prep] as const));
  const out: TutorTopicState[] = [];
  for (const row of rows) {
    const prep = preps.get(String(row.exam_prep_id ?? ""));
    if (!prep) continue;
    const snapshot = masterySnapshotFromRow(row);
    const topic = clean(snapshot.topicKey);
    if (!topic) continue;
    const badge = topicBadge(snapshot, prep.targetScore);
    if (badge === "unmeasured") continue;
    out.push({
      prepId: prep.id,
      prepTitle: prep.title,
      topic,
      badge,
      illusion: snapshot.policy?.guidance === "illusion_of_competence",
      percent: topicMasteryPercent(snapshot),
    });
  }
  return out;
}

const byPercent = (a: TutorTopicState, b: TutorTopicState) => a.percent - b.percent || a.topic.localeCompare(b.topic, "tr");

function topicList(states: readonly TutorTopicState[], multiplePreps: boolean): string {
  return states.map((state) => (multiplePreps ? `${state.topic} (${state.prepTitle})` : state.topic)).join(", ");
}

/** Karşılama kartları (en çok dört, modelsiz): zayıf/açık hatalı konu, yaklaşan sınav, fotoğraf, benzetmeyle anlatım. */
export function startCards(input: { signals: TutorContextSignals; dossier: Pick<Dossier, "signals"> | null }): TutorStartCard[] {
  const { signals } = input;
  const cards: TutorStartCard[] = [];
  const all = [...signals.illusion, ...signals.weak.filter((state) => !signals.illusion.includes(state))];
  const openTopics = signals.openMistakes.map((row) => clean(row.topicLabel)).filter(Boolean);
  // Öncelik: açık yanlışı da olan zayıf/yanılsamalı konu > zayıf/yanılsamalı konu > açık yanlışlı konu > tekrar eden yanlış.
  const withMistake = all.find((state) => openTopics.some((topic) => topicLabelsMatch(topic, state.topic)));
  let weak: { topic: string; prepId: string | null; prepTitle: string | null } | null = null;
  const pick = withMistake ?? all[0] ?? null;
  if (pick) weak = { topic: pick.topic, prepId: pick.prepId, prepTitle: pick.prepTitle };
  else {
    const fallback = openTopics[0] ?? clean(input.dossier?.signals.weak[0]?.label);
    if (fallback) {
      const known = [...signals.weak, ...signals.developing, ...signals.illusion].find((state) => topicLabelsMatch(state.topic, fallback));
      weak = { topic: fallback, prepId: known?.prepId ?? null, prepTitle: known?.prepTitle ?? null };
    }
  }
  if (weak) {
    const topic = clip(weak.topic, 60);
    const prep = weak.prepTitle ? clip(weak.prepTitle, 60) : null;
    cards.push({
      id: "weak",
      kind: "weak",
      emoji: "⚠️",
      label: prep
        ? `${prep} — ${topic} ünitesindeki açık hatalarını birlikte kapatalım`
        : `${topic} konusundaki açık hatalarını birlikte kapatalım`,
      prompt: `${prep ? `${prep} hazırlığımda ` : ""}${topic} konusundaki açık hatalarımı birlikte kapatalım. Önce nerede yanıldığımı bulalım.`,
      prepId: weak.prepId,
    });
  }
  const exam = signals.exams.find((entry) => entry.daysLeft >= 0 && entry.daysLeft <= EXAM_CARD_DAYS);
  if (exam) {
    const title = clip(exam.title, 60);
    cards.push({
      id: "exam",
      kind: "exam",
      emoji: "🎯",
      label:
        exam.daysLeft === 0
          ? `${title} sınavın bugün: hızlı tekrar turu yapalım`
          : `${title} sınavına ${exam.daysLeft} gün kaldı: hızlı tekrar turu yapalım`,
      prompt:
        exam.daysLeft === 0
          ? `${title} sınavım bugün. Bana hızlı bir tekrar turu yaptır.`
          : `${title} sınavıma ${exam.daysLeft} gün kaldı. Bana hızlı bir tekrar turu yaptır.`,
      prepId: exam.prepId,
    });
  }
  cards.push({
    id: "photo",
    kind: "photo",
    emoji: "📷",
    label: "Soru veya defter fotoğrafı yükle, adım adım çözelim",
    prompt: "Sana bir soru ya da defter fotoğrafı göndereceğim; birlikte adım adım çözelim.",
    prepId: null,
  });
  cards.push({
    id: "analogy",
    kind: "analogy",
    emoji: "💡",
    label: "Bir konuyu bana sıfırdan analojiyle anlat",
    prompt: "Bir konuyu bana sıfırdan, günlük hayattan bir benzetmeyle anlat. Önce hangi konuyu istediğimi sor.",
    prepId: null,
  });
  return cards.slice(0, TUTOR_CARD_MAX);
}

/** Saf: dosya + ek okumalar → istem bloğu, kartlar ve sinyaller. */
export function composeTutorContext(input: { dossier: Dossier | null; extras: TutorContextExtras }): TutorStudentContext {
  const { dossier, extras } = input;
  const states = topicStates(dossier, extras.masteryRows);
  const illusion = states.filter((state) => state.illusion).sort(byPercent).slice(0, 2);
  const weak = states.filter((state) => state.badge === "weak" && !state.illusion).sort(byPercent).slice(0, 3);
  const developing = states.filter((state) => state.badge === "developing" && !state.illusion).sort(byPercent).slice(0, 3);
  const exams = (dossier?.preps ?? [])
    .filter((prep) => prep.daysLeft != null && prep.daysLeft >= 0)
    .map((prep) => ({ prepId: prep.id, title: prep.title, daysLeft: prep.daysLeft as number }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);
  const signals: TutorContextSignals = {
    weak,
    developing,
    illusion,
    openMistakes: extras.openMistakes.slice(0, 3),
    exams,
    notes: extras.notes,
  };

  // Satırlar önem sırasıyla; blok sınırı aşılırsa sondakiler düşer. Ekran sırası aynı.
  const multiplePreps = new Set(states.map((state) => state.prepId)).size > 1;
  const lines: string[] = [];
  const topicParts = [
    weak.length ? `zayıf: ${topicList(weak, multiplePreps)}` : "",
    illusion.length ? `bildiğini düşünüp çeldiricide yanıldığı: ${topicList(illusion, multiplePreps)}` : "",
    developing.length ? `gelişiyor: ${topicList(developing, multiplePreps)}` : "",
  ].filter(Boolean);
  if (topicParts.length) lines.push(`- Ölçülen konular: ${topicParts.join(" · ")}`);
  if (signals.openMistakes.length) {
    const items = signals.openMistakes.map((row) => {
      const topic = clean(row.topicLabel);
      return `«${clip(clean(row.question), 90)}»${topic ? ` (${clip(topic, 50)})` : ""}`;
    });
    lines.push(`- Çözülmemiş son yanlışları: ${items.join("; ")}`);
  }
  if (exams.length) {
    lines.push(
      `- Yaklaşan sınavlar: ${exams
        .map((exam) => `${clip(exam.title, 60)} (${exam.daysLeft === 0 ? "bugün" : `${exam.daysLeft} gün sonra`})`)
        .join("; ")}`,
    );
  }
  for (const line of dossier?.lines ?? []) {
    if (line.key === "exam") continue; // yaklaşan sınavlar satırı zaten var
    lines.push(`- ${line.text} [${line.sourceLabel}]`);
  }
  lines.push(...(dossier?.noteLines ?? []));
  const memory = studentMemoryLines(dossier?.memory ?? null, { max: 3 }).filter((line) => line !== MEMORY_HEADER);
  lines.push(...memory.map((line) => `- ${line}`));
  const noteLines = extras.notes.map((note) => `- ${clip(note.note, 160)}`);

  const head = TUTOR_CONTEXT_HEADER.length + 1;
  let budget = TUTOR_CONTEXT_LIMIT - head - (noteLines.length ? TUTOR_NOTES_HEADER.length + 2 : 0);
  // Notlar öğretmenin kendi gözlemleri: önce onlara yer ayrılır (en çok beş kısa satır).
  const keptNotes: string[] = [];
  for (const line of noteLines) {
    if (line.length + 1 > budget) break;
    keptNotes.push(line);
    budget -= line.length + 1;
  }
  const keptLines: string[] = [];
  for (const raw of lines) {
    const line = clip(raw, 320);
    if (line.length + 1 > budget) continue;
    keptLines.push(line);
    budget -= line.length + 1;
  }
  const empty = !keptLines.length && !keptNotes.length;
  const promptBlock = empty
    ? ""
    : [
        TUTOR_CONTEXT_HEADER,
        ...keptLines,
        ...(keptNotes.length ? [TUTOR_NOTES_HEADER, ...keptNotes] : []),
      ].join("\n");
  return { promptBlock, cards: startCards({ signals, dossier }), empty, signals };
}

type Rows<T> = { data: T[] | null; error: { message?: string; code?: string } | null };

async function settle<T>(work: PromiseLike<T>, fallback: T, source: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    console.warn("tutor_context_source_failed", { source, cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return fallback;
  }
}

/** Dosyanın üstüne üç sorgu: açık son yanlışlar, konu hâkimiyeti, öğretmen notları (aynı anda, sınırlı). */
export async function readTutorContextExtras(service: SupabaseClient, userId: string): Promise<TutorContextExtras> {
  const [mistakes, mastery, notes] = await Promise.all([
    settle(
      service
        .from("mistake_entries")
        .select("topic_label, question_text, wrong_count")
        .eq("user_id", userId)
        .is("mastered_at", null)
        .order("created_at", { ascending: false })
        .limit(OPEN_MISTAKE_LIMIT) as unknown as PromiseLike<
        Rows<{ topic_label: string | null; question_text: string | null; wrong_count: number | null }>
      >,
      { data: [], error: null },
      "mistakes",
    ),
    settle(
      service
        .from("exam_prep_topic_mastery")
        .select(`exam_prep_id, ${MASTERY_ROW_COLUMNS}`)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(MASTERY_LIMIT) as unknown as PromiseLike<Rows<Record<string, unknown>>>,
      { data: [], error: null },
      "mastery",
    ),
    settle(loadTutorNotes(service, userId), [] as TutorNote[], "notes"),
  ]);
  return {
    openMistakes: (mistakes.error ? [] : (mistakes.data ?? []))
      .map((row) => ({
        topicLabel: row.topic_label ?? null,
        question: String(row.question_text ?? "").replace(/\s+/g, " ").trim(),
        wrongCount: Number(row.wrong_count ?? 1),
      }))
      .filter((row) => row.question),
    masteryRows: mastery.error ? [] : (mastery.data ?? []),
    notes,
  };
}

type CacheEntry = { at: number; value: TutorContextExtras };
const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 500;

export function clearTutorContextCache(): void {
  cache.clear();
}

/** Bir öğrencinin önbelleğini düşürür (ör. yeni not ya da defter kaydından sonra). */
export function forgetTutorContext(userId: string): void {
  cache.delete(userId);
}

/**
 * Öğretmenin öğrenci bağlamı. Dosya, verilen söz (sohbet ucu dosyayı zaten okuyorsa aynı okumayı paylaşır) ya da
 * önbellekli yükleyiciden; ek okumalar dosyanın süresiyle (10 dk) önbellekte. `fresh` ikisini de atlar.
 */
export async function buildTutorStudentContext(
  service: SupabaseClient,
  userId: string,
  options: { now?: Date; fresh?: boolean; dossier?: Promise<Dossier | null> | Dossier | null } = {},
): Promise<TutorStudentContext> {
  const now = options.now ?? new Date();
  const dossierWork: Promise<Dossier | null> =
    options.dossier !== undefined
      ? Promise.resolve(options.dossier).catch(() => null)
      : loadStudentDossier(service, userId, { now, fresh: options.fresh }).catch(() => null);
  const hit = cache.get(userId);
  const extrasWork: Promise<TutorContextExtras> =
    !options.fresh && hit && now.getTime() - hit.at < DOSSIER_TTL_MS
      ? Promise.resolve(hit.value)
      : readTutorContextExtras(service, userId).then((value) => {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
          cache.set(userId, { at: now.getTime(), value });
          return value;
        });
  const [dossier, extras] = await Promise.all([dossierWork, extrasWork]);
  return composeTutorContext({ dossier, extras });
}
