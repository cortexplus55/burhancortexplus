/**
 * Konu başı ve konu sonu (28 Kasım 2026, ürün sahibi): ders "Bu Derste Ne Öğreneceğiz?" önsözüyle açılır, "Bu Konudan
 * Aklında Kalsın" kartıyla biter.
 *
 * İki blok da dersin KENDİ verisinden çıkar; model çağrısı yok, kod cümle yazmaz (yalnız seçer, keser, atar):
 * - hedefler: dersin kavramları (ekran kavramı/başlığı) ve kavramın ilk ekranının `lead` satırı;
 * - kilit kavramlar: havuz dersinin "Temel kavramlar" kutusu, yoksa anlatımda koyu yazılan terimler;
 * - sınavda dikkat: ilk sınav tuzağı kartı, yoksa "Sınav ipucu" kutusu, yoksa "Sık yapılan hata";
 * - aklında kalsın: dersin özeti, eksikse "Akılda tut" kutuları ve kavramların ilk satırları.
 *
 * Hazır müfredat (havuz) dersi de aynı biçimdedir (`poolLessonV3`): ekran = kazanım bölümü, "Temel kavramlar" kutusu,
 * özet; bu yüzden ek veri ya da çağrı gerekmez. Veri yetmezse blok çizilmez (önsöz yoksa ders doğrudan başlar).
 *
 * Saf; sunucuda ve tarayıcıda çalışır.
 */
import { fitCramText } from "@/lib/learning/cram-sheet";
import { stripEmphasis } from "@/lib/learning/lesson-board";
import { conceptGroups, screenText } from "@/lib/learning/lesson-v3";
import { planLine } from "@/lib/learning/lesson-play";

export type LessonBriefGoal = { title: string; detail: string | null };

export type LessonBrief = {
  /** "Bu derste ne öğreneceksin?" (0–4; 2'den azsa blok çizilmez). */
  goals: LessonBriefGoal[];
  /** Hedeflerin dışında kalan kavram sayısı ("ve N bölüm daha"). */
  moreGoals: number;
  /** "Kilit kavramlar" (0–4; 2'den azsa blok çizilmez). */
  concepts: string[];
  /** "Sınavda dikkat": tek kutu ya da yok. */
  caution: { title: string | null; text: string } | null;
  /** "Bu Konudan Aklında Kalsın" (0–5; 2'den azsa kart çizilmez). */
  remember: string[];
};

export const BRIEF_GOALS_MAX = 4;
export const BRIEF_CONCEPTS_MAX = 4;
export const BRIEF_REMEMBER_MAX = 5;
/** Bloğun çizilmesi için gereken en az öğe. */
export const BRIEF_MIN_ITEMS = 2;

const GOAL_DETAIL_MAX = 120;
const CAUTION_MAX = 220;
const REMEMBER_ITEM_MAX = 200;
const CONCEPT_MAX_CHARS = 40;
const CONCEPT_MAX_WORDS = 5;

/** Önsözün okuduğu ders biçimi (oynatma paketi de, tam kayıt da uyar). */
type BriefBlock = {
  type: string;
  text?: unknown;
  note?: { title?: unknown; body?: unknown; tone?: unknown };
  trap?: { title?: unknown; wrong?: unknown; right?: unknown; tell?: unknown };
};
export type BriefLesson = {
  screens: { heading: string; concept?: string; lead?: string; blocks: readonly BriefBlock[] }[];
  summary?: readonly string[] | null;
  commonMistake?: { claim?: string; correction?: string } | null;
};

function plain(value: unknown): string {
  return stripEmphasis(String(value ?? ""))
    .replace(/^\s*(?:[•\-–*]|\d+[.)])\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function key(text: string): string {
  return plain(text)
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Satır tam biter ya da hiç yazılmaz (kâğıtla aynı kural). */
function fit(text: unknown, max: number): string | null {
  const value = plain(text);
  if (value.length < 4) return null;
  return fitCramText(value, { max });
}

function goalsOf(lesson: BriefLesson): { goals: LessonBriefGoal[]; more: number } {
  const groups = conceptGroups(lesson.screens).filter(
    (group, index, all) => all.findIndex((other) => key(other.concept) === key(group.concept)) === index,
  );
  // Tek kavramlı derste (bir kavram birkaç ekrana yayıldıysa) ekran başlıkları hedef olur.
  const rows =
    groups.length >= BRIEF_MIN_ITEMS
      ? groups.map((group) => ({ title: group.concept, screen: lesson.screens[group.screens[0]!] }))
      : lesson.screens
          .filter((screen, index, all) => all.findIndex((other) => key(other.heading) === key(screen.heading)) === index)
          .map((screen) => ({ title: screen.heading, screen }));
  const goals = rows
    .map(({ title, screen }) => {
      const name = plain(title);
      if (name.length < 2) return null;
      const line = screen ? planLine({ lead: screen.lead, body: screenText(screen) }) : "";
      const detail = line ? fit(line, GOAL_DETAIL_MAX) : null;
      return { title: name, detail: detail && key(detail) !== key(name) ? detail : null };
    })
    .filter((goal): goal is LessonBriefGoal => goal != null);
  return { goals: goals.slice(0, BRIEF_GOALS_MAX), more: Math.max(0, goals.length - BRIEF_GOALS_MAX) };
}

const BOLD_TERM = /\*\*([^*\n]{2,60})\*\*/g;

function shortTerm(raw: string): string | null {
  const term = plain(raw).replace(/[:;,.]+$/u, "").trim();
  if (term.length < 2 || term.length > CONCEPT_MAX_CHARS) return null;
  if (term.split(/\s+/).length > CONCEPT_MAX_WORDS) return null;
  if (!/\p{L}/u.test(term)) return null;
  return term;
}

/** Kutucukta terim büyük harfle başlar; kendi büyük harfini taşıyan ad ("pH", "mRNA") olduğu gibi kalır. */
function displayTerm(term: string): string {
  const first = term.split(/\s+/)[0] ?? "";
  if (/\p{Lu}/u.test(first) || !/^\p{Ll}/u.test(term)) return term;
  return term.charAt(0).toLocaleUpperCase("tr") + term.slice(1);
}

/**
 * Anlatımdaki koyu sözcüklerin hepsi kavram değil: tek, küçük harfli ve çoğu zaman çekimli sözcük ("karesi") ancak
 * başka kavram yoksa alınır. Önce çok sözcüklü ya da kendi büyük harfiyle yazılmış terimler.
 */
function isStrongTerm(term: string): boolean {
  return /\s/.test(term) || /\p{Lu}/u.test(term);
}

function conceptsOf(lesson: BriefLesson, goals: LessonBriefGoal[]): string[] {
  const seen = new Set<string>();
  const unique = (raw: string): string | null => {
    const term = shortTerm(raw);
    if (!term) return null;
    const id = key(term);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return term;
  };
  const blocks = lesson.screens.flatMap((screen) => screen.blocks);
  // Havuz dersi: "Temel kavramlar" kutusu ("**terim**: tanım" satırları). Bunlar kavramın ta kendisidir.
  const listed: string[] = [];
  for (const block of blocks) {
    if (block.type !== "note" || key(String(block.note?.title ?? "")) !== "temel kavramlar") continue;
    for (const match of String(block.note?.body ?? "").matchAll(BOLD_TERM)) {
      const term = unique(match[1]!);
      if (term) listed.push(term);
    }
  }
  // Öbür dersler: anlatımda koyu yazılan terimler, ilk geçtikleri sırayla. Hedefin aynısı kavram sayılmaz.
  const strong: string[] = [];
  const weak: string[] = [];
  const goalKeys = new Set(goals.map((goal) => key(goal.title)));
  for (const block of blocks) {
    if (block.type !== "text") continue;
    for (const match of String(block.text ?? "").matchAll(BOLD_TERM)) {
      if (goalKeys.has(key(match[1]!))) continue;
      const term = unique(match[1]!);
      if (term) (isStrongTerm(term) ? strong : weak).push(term);
    }
  }
  const picked = [...listed, ...strong];
  const out = picked.length >= BRIEF_MIN_ITEMS ? picked : [...picked, ...weak];
  return out.slice(0, BRIEF_CONCEPTS_MAX).map(displayTerm);
}

function firstLine(body: unknown): string {
  return String(body ?? "")
    .split(/\n+/)
    .map((line) => plain(line))
    .find((line) => line.length >= 4) ?? "";
}

function cautionOf(lesson: BriefLesson): LessonBrief["caution"] {
  const blocks = lesson.screens.flatMap((screen) => screen.blocks);
  const trap = blocks.find((block) => block.type === "exam_trap_card" && block.trap);
  if (trap?.trap) {
    const text = fit(trap.trap.right, CAUTION_MAX);
    if (text) return { title: fit(trap.trap.title, 90), text };
  }
  const exam = blocks.find((block) => block.type === "note" && block.note?.tone === "exam" && key(String(block.note?.title ?? "")) !== "çözümlü örnek");
  // Kutunun kendi başlığı ("Sınav ipucu", "Sık yapılan hata") üst satırda kalır: yanılgı cümlesi çerçevesiz okunmasın.
  if (exam?.note) {
    const text = fit(firstLine(exam.note.body), CAUTION_MAX);
    if (text) return { title: fit(exam.note.title, 90), text };
  }
  const warn = blocks.find((block) => block.type === "note" && block.note?.tone === "warn");
  if (warn?.note) {
    const text = fit(firstLine(warn.note.body), CAUTION_MAX);
    if (text) return { title: fit(warn.note.title, 90) ?? "Sık yapılan hata", text };
  }
  const correction = fit(lesson.commonMistake?.correction, CAUTION_MAX);
  return correction ? { title: "Doğrusu", text: correction } : null;
}

function rememberOf(lesson: BriefLesson): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    if (out.length >= BRIEF_REMEMBER_MAX) return;
    const text = fit(raw, REMEMBER_ITEM_MAX);
    if (!text) return;
    const id = key(text);
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(text);
  };
  for (const point of lesson.summary ?? []) push(point);
  if (out.length < 3) {
    for (const block of lesson.screens.flatMap((screen) => screen.blocks)) {
      if (block.type === "note" && block.note?.tone === "remember" && key(String(block.note?.title ?? "")) !== "temel kavramlar") {
        push(firstLine(block.note.body));
      }
    }
  }
  if (out.length < 3) {
    for (const group of conceptGroups(lesson.screens)) {
      const screen = lesson.screens[group.screens[0]!];
      if (screen) push(planLine({ lead: screen.lead, body: screenText(screen) }));
    }
  }
  return out;
}

/** Dersin önsöz ve kapanış verisi. */
export function lessonBrief(lesson: BriefLesson): LessonBrief {
  const { goals, more } = goalsOf(lesson);
  return {
    goals,
    moreGoals: more,
    concepts: conceptsOf(lesson, goals),
    caution: cautionOf(lesson),
    remember: rememberOf(lesson),
  };
}

/** Önsöz çizilecek kadar veri var mı (yoksa ders doğrudan başlar). */
export function briefHasPreface(brief: LessonBrief): boolean {
  return brief.goals.length >= BRIEF_MIN_ITEMS || brief.concepts.length >= BRIEF_MIN_ITEMS;
}

/** Kapanış kartı çizilecek kadar madde var mı. */
export function briefHasClosing(brief: LessonBrief): boolean {
  return brief.remember.length >= BRIEF_MIN_ITEMS;
}

/** Anlatım düzeyinin kısa adı (rozet). Aşinalık kuşağından: yeni/duymuştum, temel, iyi/güvenli. */
export function lessonLevelLabel(familiarity: string | null | undefined): string | null {
  if (familiarity === "new" || familiarity === "heard") return "Başlangıç";
  if (familiarity === "basics") return "Temel";
  if (familiarity === "good" || familiarity === "confident") return "İleri";
  return null;
}

export const BRIEF_COPY = {
  prefaceTitle: "Bu Derste Ne Öğreneceğiz?",
  goalsTitle: "Bu derste ne öğreneceksin?",
  conceptsTitle: "Kilit kavramlar",
  cautionTitle: "Sınavda dikkat",
  start: "Derse başla",
  reopen: "Ders özeti",
  backToLesson: "Derse dön",
  closingTitle: "Bu Konudan Aklında Kalsın",
  cramLead: "Bütün hazırlığı tek sayfada tekrar etmek için",
} as const;
