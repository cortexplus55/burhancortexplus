import { pickBySeed } from "@/lib/companion/voice";
import { asksDirectAnswer, looksLikeQuestion } from "@/lib/learning/tutor-answer";
import { followUpKind } from "@/lib/learning/tutor-turn";
import { detectMessageEmotion, generalFeelingStatement, carriesLessonQuestion } from "@/lib/learning/message-feelings";
import type { Dossier, DossierCheck, DossierSignals } from "@/lib/teacher/dossier";

/*
  Yönlendirici (PROMPT-V2 §5, PR-4), 15 Kasım 2026. Modelsiz ve deterministik: niyet sınıfı (kural), öncelik sırası,
  seçilen süreye sığan plan, açılış cümlesi (M2), analiz çipleri (M4) ve teşhis (M5). Her plan maddesi var olan bir
  etkinliğe ve kaydına bağlı (`href`); kayıt yoksa madde yok. Öğretmen açık uçlu "ne istersin?" ile bırakmaz: veri
  varsa tek öneri, yoksa dürüstçe "seni daha tanımıyorum". Model çağrısı ve kota yok.
*/

export type Intent =
  | "struggle"
  | "concept"
  | "exam_soon"
  | "solve"
  | "direct"
  | "feeling"
  | "document"
  | "suggest"
  | "chat";

const fold = (text: string) => text.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

const EXAM_WORD = "(?:sınav\\p{L}*|vize\\p{L}*|final\\p{L}*|quiz\\p{L}*|yazılı\\p{L}*|deneme\\p{L}*)";
const SOON_WORD = "(?:yarın|bugün|haftaya|öbür gün|bu hafta|\\d+\\s*gün\\s*(?:sonra|kaldı|var))";
const EXAM_SOON = new RegExp(`${SOON_WORD}[^.?!]{0,40}${EXAM_WORD}|${EXAM_WORD}[^.?!]{0,40}${SOON_WORD}`, "iu");
const SUGGEST = /ne (?:yapmalıyım|yapayım|çalışayım|çalışmalıyım|önerirsin)|nereden başla|neyle başla|bugün ne çalış/iu;
const STRUGGLE = /zorlan\p{L}*|anlamıyorum|anlayamıyorum|yetişemiyorum|geride kaldım|karışıyor|kafam karış|bir şey anlamadım/iu;
const TEACH_ASK = /\b(?:anlat|öğret|açıkla)\p{L}*/iu;

/** Mesajın niyeti (kural; ek model çağrısı yok). */
export function classifyIntent(message: string, options: { hasImage?: boolean; documentAttached?: boolean } = {}): Intent {
  const text = fold(message);
  if (options.hasImage) return "solve";
  if (asksDirectAnswer(message) || followUpKind(message) === "full_solution" || followUpKind(message) === "final_answer") return "direct";
  if (options.documentAttached) return "document";
  if (EXAM_SOON.test(text)) return "exam_soon";
  if ((detectMessageEmotion(message) || generalFeelingStatement(message)) && !carriesLessonQuestion(message)) return "feeling";
  if (SUGGEST.test(text)) return "suggest";
  if (STRUGGLE.test(text) && !looksLikeQuestion(message)) return "struggle";
  if (looksLikeQuestion(message) || TEACH_ASK.test(text)) return "concept";
  return "chat";
}

export type PlanActivity = "Tekrar" | "Yanlışlarım" | "Konu anlatımı" | "Belgenden çalış";

export type PlanItem = {
  key: string;
  title: string;
  activity: PlanActivity;
  minutes: number;
  href: string;
  /** Neden bu madde (veriden, kısa). */
  reason: string;
};

type Candidate = Omit<PlanItem, "minutes"> & { minutes: number };

/**
 * Öncelik (§5, deterministik): vadesi gelmiş tekrar > en az iki kez yanlış yapılan konu > sınav tarihine göre ağırlıklı
 * geciken adım > dokunulmamış ağır belge bölümü > yeni konu (sıradaki açık adım).
 */
export function prioritize(signals: DossierSignals): Candidate[] {
  const out: Candidate[] = [];
  if (signals.reviews) {
    out.push({
      key: "reviews",
      title: `${signals.reviews.count} tekrar`,
      activity: "Tekrar",
      minutes: Math.min(10, Math.max(5, signals.reviews.count)),
      href: signals.reviews.href,
      reason: "vadesi bugün",
    });
  }
  for (const weak of signals.weak.slice(0, 1)) {
    out.push({
      key: `weak:${weak.label}`,
      title: weak.label,
      activity: "Yanlışlarım",
      minutes: 10,
      href: weak.href,
      reason: `${weak.count} kez takıldın`,
    });
  }
  for (const behind of signals.behind.slice(0, 2)) {
    out.push({
      key: `behind:${behind.href}`,
      title: behind.topic,
      activity: "Konu anlatımı",
      minutes: behind.minutes ?? 15,
      href: behind.href,
      reason: `${behind.days} gün gecikti`,
    });
  }
  if (signals.heavySection && !signals.behind.length) {
    out.push({
      key: "document",
      title: signals.heavySection.title,
      activity: "Belgenden çalış",
      minutes: 10,
      href: "/dokumanlar",
      reason: `${signals.heavySection.documentName} içinde en ağırlıklı bölüm`,
    });
  }
  if (signals.nextStep && !out.some((item) => item.href === signals.nextStep!.href)) {
    out.push({
      key: "next",
      title: signals.nextStep.title,
      activity: "Konu anlatımı",
      minutes: signals.nextStep.minutes ?? 15,
      href: signals.nextStep.href,
      reason: "sıradaki adım",
    });
  }
  return out;
}

export const PLAN_MINUTES = [10, 20, 45] as const;
export type PlanMinutes = (typeof PLAN_MINUTES)[number];
const MIN_ITEM = 5;
const MAX_ITEMS = 4;

/** Seçilen süreye sığan plan: en çok 4 madde, toplam tam seçilen süre (son madde kalanı alır). Veri yoksa boş. */
export function buildPlan(signals: DossierSignals, minutes: number): PlanItem[] {
  const items: PlanItem[] = [];
  let left = minutes;
  for (const candidate of prioritize(signals)) {
    if (items.length >= MAX_ITEMS || left < MIN_ITEM) break;
    const take = Math.min(candidate.minutes, left);
    items.push({ ...candidate, minutes: take });
    left -= take;
  }
  if (items.length && left > 0) items[items.length - 1]!.minutes += left;
  return items;
}

/** M2: öğretmenin ilk sözü; gerçek veriden 1-2 cümle + süre sorusu. Veri yoksa yalnız selam ve soru. */
export function openingLine(signals: DossierSignals, options: { name?: string | null; seed: string }): string {
  const hello = options.name ? `Merhaba ${options.name}!` : "Merhaba!";
  const facts: string[] = [];
  const behind = signals.behind[0];
  if (behind) facts.push(`${behind.topic} ${behind.days} gün gecikti.`);
  if (signals.exam && signals.exam.daysLeft <= 30) {
    facts.push(signals.exam.daysLeft === 0 ? `${signals.exam.title} sınavın bugün.` : `${signals.exam.title} sınavına ${signals.exam.daysLeft} gün var.`);
  } else if (signals.reviews) {
    facts.push(`Bugün ${signals.reviews.count} tekrarın bekliyor.`);
  }
  const ask = pickBySeed(["Bugün ne kadar vaktin var?", "Bugün kaç dakika ayırabilirsin?"], options.seed, "opening");
  return [hello, ...facts.slice(0, 2), ask].join(" ");
}

/** M4: analiz çipleri; her biri gerçekten yapılmış bir okuma ve bulduğu sayı. En çok 3, bulgusu olanlar önce. */
export function analysisChips(checks: readonly DossierCheck[]): string[] {
  return [...checks]
    .sort((a, b) => Number(b.count > 0) - Number(a.count > 0))
    .slice(0, 3)
    .map((check) => {
      if (check.source === "mistakes") return `Yanlışlarına baktı · ${check.count} kayıt`;
      if (check.source === "reviews") return `Tekrar kuyruğuna baktı · ${check.count}`;
      if (check.source === "documents") return `Belgelerine baktı · ${check.count}`;
      if (check.source === "plan") return check.count ? `Planına baktı · ${check.count} gecikme` : "Planına baktı";
      return check.label;
    });
}

/** M5: teşhis, en çok iki cümle, veriden; sabit tek kalıp değil (güne göre değişen söz). Veri yoksa dürüst cümle. */
export function diagnosis(signals: DossierSignals, seed: string): string {
  const parts: string[] = [];
  const weak = signals.weak[0];
  if (weak) {
    parts.push(
      pickBySeed(
        [`Baktım: ${weak.label} konusunda ${weak.count} kez takılmışsın.`, `${weak.label} sana ${weak.count} kez zorluk çıkarmış.`],
        seed,
        "weak",
      ),
    );
  }
  const behind = signals.behind[0];
  if (behind) {
    parts.push(
      pickBySeed([`${behind.topic} da ${behind.days} gün gecikmiş.`, `Bir de ${behind.topic} ${behind.days} gün geride kalmış.`], seed, "behind"),
    );
  } else if (signals.reviews && parts.length < 2) {
    parts.push(`Bugün ${signals.reviews.count} tekrarın var.`);
  }
  if (!parts.length) return "Seni daha tanımıyorum; birkaç soruyla başlayalım.";
  return parts.slice(0, 2).join(" ");
}

export type TeacherPlanView = {
  empty: boolean;
  opening: string;
  chips: string[];
  diagnosis: string;
  plans: Record<string, PlanItem[]>;
};

/** Açılış akışının tamamı (M2, M4, M5, M6); tek okumayla, modelsiz. */
export function teacherPlanView(dossier: Dossier, options: { name?: string | null; seed: string }): TeacherPlanView {
  const plans: Record<string, PlanItem[]> = {};
  for (const minutes of PLAN_MINUTES) plans[String(minutes)] = buildPlan(dossier.signals, minutes);
  return {
    empty: dossier.empty,
    opening: openingLine(dossier.signals, options),
    chips: analysisChips(dossier.checks),
    diagnosis: diagnosis(dossier.signals, options.seed),
    plans,
  };
}

/** Sohbet turu için yönlendirici satırı (bayrak açıkken): niyete göre tek öneri; dosyada yoksa iddia yok. */
export function directorTurnLine(intent: Intent, signals: DossierSignals): string {
  if (intent !== "struggle" && intent !== "suggest" && intent !== "exam_soon") return "";
  const plan = buildPlan(signals, intent === "exam_soon" ? 45 : 20);
  if (!plan.length) {
    return (
      "YÖNLENDİRİCİ — BU TUR: Öğrencinin kayıtlı verisi yok. Uydurma geçmiş kurma; dürüstçe onu daha tanımadığını söyle ve " +
      "seviyesini anlamak için tek bir kısa soru sor."
    );
  }
  const first = plan[0]!;
  const exam = intent === "exam_soon" ? " Sınav yaklaşıyor: en çok yanlış yaptığı konudan başla, sınav sabahı kâğıdını an." : "";
  return (
    `YÖNLENDİRİCİ — BU TUR: Açık uçlu "ne istersin?" diye sorma. Öğrencinin dosyasına göre TEK öneri sun: ` +
    `${first.title} (${first.activity}, ${first.minutes} dk; neden: ${first.reason}). Öneriyi tek cümlede söyle, sonra ` +
    `öğrencinin değiştirebileceğini belirt.${exam}`
  );
}
