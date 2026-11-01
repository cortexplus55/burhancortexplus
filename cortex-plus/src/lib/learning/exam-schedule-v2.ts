/**
 * Stage 4 — exam-date / daily-time / topic-scope schedule builder (pure).
 * Legacy buildExamPlan stays for pdf_learning_v2 OFF.
 */

import { officialExamOn, schoolBreakOn } from "@/lib/curriculum/calendar";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type { MeasuredLevel } from "@/lib/learning/diagnostic";
import { extraPracticeForTopic } from "@/lib/learning/cross-material-topics";
import { sourceCitation } from "@/lib/learning/path-source-label";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";
import { addDays, istanbulDay, isoWeekday } from "@/lib/istanbul-day";
import { SHORT_PLAN_DAYS, pinFinalSessionsInPlace } from "@/lib/learning/path-dates";
import { HOLIDAY_LOAD_SHARE, turkishHolidayOn, type ScheduleCheckpoint } from "@/lib/learning/tr-calendar";
import {
  extraPracticeForTarget,
  masteryBarForTarget,
  reviewPassesForTarget,
  targetPlanMode,
  targetTempoFactor,
  type TargetPlanMode,
} from "@/lib/learning/target-plan";

export type ScheduleSessionRole = "learn" | "practice" | "review" | "mock";

export type ScheduleTopicInput = {
  id: string;
  title: string;
  objective?: string | null;
  prerequisites?: string[];
  pageNumbers?: number[];
  /** Measured diagnostic; unknown if unmeasured. */
  measuredLevel?: MeasuredLevel | null;
  /** Self-report hard topic — priority boost only, not measured. */
  selfHard?: boolean;
  /** Öz bildirim "Biliyorum" — ölçüm değil; yalnız süreyi hafifletir (resmî kurulum, 1 Kasım 2026). */
  selfKnown?: boolean;
  /** Explicit priority 1 (high) .. 5 (low). */
  priority?: number | null;
  /** Müfredattaki pay. Yoksa süre formülü değişmez. */
  weightPercent?: number | null;
  /** Müfredat "sınavda ağırlıklı" diyorsa. */
  examHeavy?: boolean;
  /** Öğretmen analizinin önem sırası. Müfredat payı yokken süreye girer. */
  importance?: "important" | "medium" | "less" | null;
  /** Birleşmiş konunun dayandığı dosyalar. Takvim bunu okumaz. */
  sourceRefs?: TopicSourceRef[];
  /**
   * Kavram birimleri (konu haritasından, 2 Ekim 2026). Varsa her birim ayrı
   * ders olur ve adını taşır; yoksa mekanik 3 sayfalık bölme.
   */
  units?: { title: string; pages: number[] }[];
};

export type ScheduleBuildInput = {
  daysToExam: number;
  dailyMinutes: number;
  /** ISO weekday 1=Mon .. 7=Sun */
  studyDays: number[];
  topics: ScheduleTopicInput[];
  targetScore?: number | null;
  /** Calendar start (its Europe/Istanbul day); defaults to now. */
  fromDate?: Date;
  /**
   * Okuyarak + pratik (ses yok) seçildiyse podcast ve sözlü konmaz.
   * Varsayılan true: eski çağrılar sesli adımı korur.
   */
  includeAudio?: boolean;
  /**
   * Final sınavından önceki ara sınavlar (vize, quiz …): belgeden ya da öğrencinin takviminden
   * (`tr-calendar.ts`). Her birinin bir gün öncesine "Ara Deneme / Kontrol" adımı konur.
   */
  checkpoints?: ScheduleCheckpoint[];
};

/**
 * Öğrenci çalışma günü seçmediyse her gün sayılır (19 Ekim 2026). Sihirbaz gün sormuyor; yalnız hafta
 * içi sayılınca 25 gün sonraki sınavın planı 18 güne iniyor, son güne konu yığılıyordu. Seçim
 * hazırlık ayarlarından yapılır ve kayda geçer; boş kayıt da "her gün" demektir.
 */
export const DEFAULT_STUDY_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
/** Günlük süre sorulmuyor; takvim etkinlikleri güne bu bütçeyle dağıtır (özette saat yazılmaz). */
export const DEFAULT_DAILY_MINUTES = 45;

/** Kayıttaki çalışma günleri; boşsa ya da bozuksa her gün. ISO hafta günü 1=Pzt … 7=Paz. */
export function prepStudyDays(stored: unknown): number[] {
  const days = Array.isArray(stored)
    ? stored.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7)
    : [];
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_STUDY_DAYS];
}

/** Kayıttaki günlük dakika; yoksa varsayılan. */
export function prepDailyMinutes(stored: unknown): number {
  return typeof stored === "number" && Number.isFinite(stored) && stored >= 5 ? Math.min(480, stored) : DEFAULT_DAILY_MINUTES;
}

export type ScheduleSession = {
  dayIndex: number;
  calendarDate: string;
  topicId: string;
  topicTitle: string;
  objective: string;
  sourcePages: number[];
  durationMinutes: number;
  role: ScheduleSessionRole;
  kind: PlanNodeKind;
  sortOrder: number;
  /** Aynı konunun ikinci ve üçüncü pratiği farklı iştir. */
  practiceVariant: number | null;
  /** Tek dosyada "pdf-12 s.1–3". Birden fazla dosyada boş. */
  sourceLabel: string | null;
  /** Büyük konunun kaçıncı dersi (1'den). Tek dersli konuda yok. */
  lessonPart?: number;
  lessonParts?: number;
  /** Kavram biriminin adı (birimli konuda). */
  unitTitle?: string;
  /** Resmî tatile düşen oturum: tatilin adı (gün esnek, yük yarıya iner). */
  holiday?: string;
  /** MEB çalışma takvimindeki okul tatiline (ara tatil, yarıyıl) düşen oturum: tatilin adı. */
  schoolBreak?: string;
  /** Resmî merkezî sınav günü (ÖSYM / LGS) ise sınavın adı. */
  officialExam?: string;
  /** Ara sınav öncesi kontrol adımı: ara sınavın adı ve günü. */
  checkpoint?: string;
  checkpointDate?: string;
  /**
   * Uzun planın tarihe bağlı tekrarı (30 Ekim 2026, Paket I): 1, 2, 3 … öğrenmeden 21, 45, 90, 150 gün
   * sonraki "Kartlarla tekrar"; 0 boş kalacak haftaya konan bakım tekrarı. Yolda tarihine göre yer alır
   * (konunun bloğuna değil), "🔁 Aralıklı Tekrar ve Kontrol" bölümünde görünür.
   */
  longReview?: number;
};

/** Ara sınav öncesi kontrolün süresi; günün bütçesinden düşmez (kısa karışık pratik). */
export const CHECKPOINT_MINUTES = 20;

export type SchedulePlanMode = "short" | "normal" | "long";

/**
 * Bu günden uzun hazırlık "uzun kip" (30 Ekim 2026, Paket I). Canlıda 7,5 ay sonraki finalin planı
 * 29 Eki – 25 Şub arasına yığıldı, 26 Şub – 7 Haz (~15 hafta) boş kaldı: takvim 120 günde kesiliyordu.
 * Uzun kipte öğrenme dönemin bir bölümüne yayılır; kalanı tarihe bağlı tekrara, ara kontrole ve finale.
 * 45 gün ve altı eskisi gibi (öğrenme son üç güne kadar yayılır).
 */
export const LONG_PLAN_DAYS = 45;

/** Teknik tavan (≈3 yıl): bozuk bir tarih sonsuz takvim kurmasın. 120 gün sınırı kalktı. */
export const MAX_PLAN_DAYS = 1100;

/**
 * Yolun "Kartlarla tekrar" düğümünün uzun aralıkları (gün, konunun ilk dersinden). Soru düzeyindeki günü
 * gelen tekrar (`review-items.ts`, 1/3/7/14 gün, "Bugün N tekrar") ayrı kalır ve yolu kilitlemez; yol
 * düğümü onun bittiği yerden devam eder: ilk tekrar dersin ertesi günü (eskisi gibi), sonra 21, 45, 90,
 * 150 gün. Finalin son haftasına giren aralık konmaz; o hafta finalin kendi tekrarı var.
 */
export const PATH_REVIEW_LADDER_DAYS: readonly number[] = [21, 45, 90, 150];

/** Uzun planda kendiliğinden konan ara kontrolün aralığı (gün) ve adı. */
export const LONG_CHECK_EVERY_DAYS = 28;
export const LONG_CHECK_LABEL = "Aylık kontrol";

/** Finale ayrılan son çalışma günleri (`pinFinalSessionsInPlace` ile aynı pencere). */
const FINAL_STUDY_DAYS = 7;

/** Sınava kalan güne göre takvim kipi: 7 günden kısa "short", 45 günden uzun "long". */
export function schedulePlanMode(daysToExam: number): SchedulePlanMode {
  const days = Math.floor(Number.isFinite(daysToExam) ? daysToExam : 1);
  if (days < SHORT_PLAN_DAYS) return "short";
  if (days > LONG_PLAN_DAYS) return "long";
  return "normal";
}

/**
 * Yeni konuların öğrenilmediği son çalışma günleri. Normal planda son üç gün (deneme ve tekrar). Uzun
 * planda pay süreyle büyür: 45 günde ~%7, 90 günde ~%25, 228 günde ~%37, en çok %45 — kalan süre aralıklı
 * tekrar, ara kontrol ve finale kalır. Sıçrama yok: 45 ile 46 gün aynı planı verir.
 */
export function learningTailDays(lastIdx: number, daysToExam: number): number {
  const base = Math.min(3, Math.max(0, lastIdx));
  if (schedulePlanMode(daysToExam) !== "long") return base;
  const days = Math.max(1, Math.floor(daysToExam));
  const share = Math.min(0.45, (3 + 0.45 * (days - (LONG_PLAN_DAYS - 1))) / days);
  return Math.min(Math.max(0, lastIdx - 1), Math.max(base, Math.round(lastIdx * share)));
}

/**
 * Kısa kipte konuların günleri: her gün bütçesi oranında yük alır (konunun süresi, yani sınav ağırlığı,
 * zorluk ve sayfa sayısı), sıra değişmez. Ağır konu günün daha büyük payını alır; iki günlük planda
 * sekiz konunun yedisi aynı güne yığılmaz. `capacities` verilirse gün payı bütçesiyle orantılı: resmî
 * tatil (esnek gün, yarım bütçe) daha az konu alır. Verilmezse günler eşit.
 */
export function spreadByLoad(loads: readonly number[], days: number, capacities?: readonly number[]): number[] {
  const span = Math.max(1, Math.floor(days));
  const weights = loads.map((load) => (Number.isFinite(load) ? Math.max(0, load) : 0));
  const total = weights.reduce((sum, load) => sum + load, 0);
  const rooms = Array.from({ length: span }, (_, day) => {
    const room = capacities?.[day];
    return typeof room === "number" && Number.isFinite(room) && room > 0 ? room : capacities ? 0 : 1;
  });
  const roomTotal = rooms.reduce((sum, room) => sum + room, 0) || span;
  // Günlerin yükteki sınırları: gün d, toplam yükün [önceki günlerin payı, kendi payı) aralığını alır.
  const bounds: number[] = [];
  let edge = 0;
  for (const room of rooms) {
    edge += room / roomTotal;
    bounds.push(edge);
  }
  let cumulative = 0;
  return weights.map((load) => {
    const middle = cumulative + load / 2;
    cumulative += load;
    if (total <= 0) return 0;
    const share = middle / total;
    const day = bounds.findIndex((bound) => share < bound);
    return Math.min(span - 1, day < 0 ? span - 1 : day);
  });
}

/**
 * Günlük bütçe (28 Ekim 2026): resmî tatil esnek gündür, yükün yarısı komşu günlere kayar. Son gün
 * (deneme günü) tatil olsa da tam kalır.
 */
export function studyDayBudgets(studyDayDates: readonly string[], daily: number): number[] {
  const lastIdx = studyDayDates.length - 1;
  return studyDayDates.map((date, index) =>
    index !== lastIdx && turkishHolidayOn(date) ? Math.max(10, Math.round(daily * HOLIDAY_LOAD_SHARE)) : daily,
  );
}

/**
 * Bir dersin okuduğu sayfa sayısı.
 *
 * Ders kaynaktan en fazla 6.000 karakter okuyor, sayfa başına 2.200
 * (`source-context.ts`). Ana konu 18 sayfaya çıkınca tek ders her sayfanın
 * 300 karakterini görürdü. Ana konular 10–15'e toplandığından beri
 * (30 Eylül 2026) büyük konu ardışık derslere bölünür: Astra'da da bir
 * konunun birden fazla dersi var.
 */
export const LESSON_PAGE_SPAN = 3;

/** Konunun sayfaları ders ders. 4 sayfaya kadar tek ders; tek sayfalık artık öncekine katılır. */
export function lessonPageChunks(pageNumbers: number[]): number[][] {
  const pages = [...new Set(pageNumbers)].sort((a, b) => a - b);
  if (pages.length <= LESSON_PAGE_SPAN + 1) return [pages];
  const chunks: number[][] = [];
  for (let i = 0; i < pages.length; i += LESSON_PAGE_SPAN) {
    chunks.push(pages.slice(i, i + LESSON_PAGE_SPAN));
  }
  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last.length === 1) {
    chunks.pop();
    chunks[chunks.length - 1].push(...last);
  }
  return chunks;
}

type LessonChunk = { pages: number[]; part: number; parts: number; title?: string };

/** Konunun dersleri: kavram birimleri varsa onlar, yoksa mekanik sayfa dilimleri. */
export function topicLessonChunks(topic: Pick<ScheduleTopicInput, "pageNumbers" | "units">): { pages: number[]; title?: string }[] {
  const units = (topic.units ?? []).filter((unit) => unit.pages.length && unit.title.trim());
  if (units.length > 1) return units.map((unit) => ({ pages: [...unit.pages], title: unit.title.trim() }));
  return lessonPageChunks(topic.pageNumbers ?? []).map((pages) => ({ pages }));
}

export type ScheduleFitOption =
  | "increase_daily_time"
  | "prioritize_topics"
  | "cut_scope"
  | "extend_days";

export type ScheduleBuildResult = {
  sessions: ScheduleSession[];
  availableMinutes: number;
  requiredMinutes: number;
  fits: boolean;
  cutTopicIds: string[];
  optionsIfTight: ScheduleFitOption[];
  orderedTopicIds: string[];
  studyDayDates: string[];
  summary: string;
  /** Hedef puanın plan kipi. Eski kayıtlarda yok; o zaman solid. */
  targetMode?: TargetPlanMode;
  /** Konu hâkimiyeti eşiği: peak ≥85, solid 75, pass ≤65. */
  masteryBar?: number;
  /** Takvimin ara sınavları; yeniden planlama bunları korur. */
  checkpoints?: ScheduleCheckpoint[];
};

/**
 * Öğrenme adımı ders, podcast değil.
 *
 * Uzun süre `learn: "podcast"` idi: planda her konunun "· Öğren" düğümü
 * bir podcast üretiyordu. İki sonucu vardı. Birincisi, öğretme en kırılgan
 * ve en pahalı üretim türüne bağlıydı — podcast üretimi düştüğünde öğrenci
 * o konuda okuyacak hiçbir şey bulamıyordu. İkincisi, sesli metin geri
 * dönüp bakılamıyor: formülü tekrar okuyamıyor, bölüm başlığına göz
 * atamıyor.
 *
 * Ders sisteminde bunların hepsi var ve doğrulanmış: bölüm başlıkları,
 * ara kontroller, çözümlü örneğin adım adım doğruluğu. Referans ürünün öğrenme
 * adımı da metin ("Akıllı Metin"); podcast onda da seçmeli.
 */
const ROLE_KIND: Record<ScheduleSessionRole, PlanNodeKind> = {
  learn: "lesson",
  practice: "quiz",
  review: "spaced",
  mock: "written_exam",
};

/**
 * Sıkıştırmanın tabanı. Bunun altına inen bir konu, planda görünse de
 * öğrenciye bir şey öğretemeyecek kadar kısa kalır.
 */
const MIN_TOPIC_MINUTES = 12;

/**
 * Her konu bloğunda konu testinin yanında iki adım (25 Ekim 2026, canlı test P1-2 ve P1-6):
 *
 * - Gerçek bir Doğru/Yanlış düğümü. İlk testin adı "Testler ve Doğru/Yanlış"tı ama test çoktan
 *   seçmeliydi ve şablon `true_false` düğümünü "test zaten içerir" diye atlıyordu: söz tutulmuyordu.
 * - Dönüşümlü bir etkileşimli ya da sesli adım (podcast → soru-cevap → sözlü → podcast …). Şablon
 *   bu türleri yolun tamamına bir kez koyuyordu; konu bloklarının çoğu yalnız ders + test + kartlardı.
 *
 * Konu testinin gününe konur; günün bütçesinden düşmez: bütçe yeni dersleri güne dağıtmak için var,
 * kısa pratik adımı onu kaydırıp dersleri son güne yığmasın.
 */
export const BLOCK_TRUE_FALSE_MINUTES = 10;
export const BLOCK_INTERACTIVE_MINUTES = 10;
export const BLOCK_INTERACTIVE_ROTATION: readonly PlanNodeKind[] = ["podcast", "qa", "oral"];

export function blockInteractiveKind(topicIndex: number, includeAudio?: boolean): PlanNodeKind {
  if (includeAudio === false) return "quiz";
  return BLOCK_INTERACTIVE_ROTATION[Math.abs(topicIndex) % BLOCK_INTERACTIVE_ROTATION.length]!;
}

const LEVEL_LOAD: Record<MeasuredLevel, number> = {
  unknown: 1.15,
  weak: 1.35,
  emerging: 1.0,
  solid: 0.75,
};

/**
 * Sınava kadarki çalışma günleri, `from` anının Türkiye gününden başlayarak.
 *
 * Takvim eskiden sunucunun yerel gününden kuruluyordu. Sunucu UTC'de; gece
 * 00:00–03:00 arası kurulan planın ilk oturumu dünün tarihini alıyor ve
 * doğar doğmaz "kaçırılmış" sayılıyordu, gün filtresi de dünün haftanın
 * gününe bakıyordu.
 *
 * 30 Ekim 2026: 120 günlük tavan kalktı. 228 gün sonraki sınavın takvimi 120. günde bitiyor, son 15
 * hafta (23 Nisan, 1 ve 19 Mayıs, Kurban Bayramı dahil) planda hiç yoktu. Tavan yalnız teknik
 * (`MAX_PLAN_DAYS`).
 */
export function listStudyDayDates(
  daysToExam: number,
  studyDays: number[],
  from = new Date(),
): string[] {
  const span = Math.max(1, Math.min(MAX_PLAN_DAYS, Math.floor(Number.isFinite(daysToExam) ? daysToExam : 1)));
  const allowed = new Set(prepStudyDays(studyDays));
  const start = istanbulDay(from);
  const dates: string[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = addDays(start, offset);
    if (allowed.has(isoWeekday(day))) dates.push(day);
  }
  // Always keep at least one study slot if exam is tomorrow and filter emptied the list.
  if (!dates.length) {
    dates.push(start);
  }
  return dates;
}

export function estimateTopicMinutes(topic: ScheduleTopicInput): number {
  const pages = topic.pageNumbers?.length ?? 2;
  // Her ek ders için süre; tek dersli konuda formül değişmez.
  const extraLessons = topicLessonChunks(topic).length - 1;
  const base = 25 + Math.min(40, pages * 4) + extraLessons * 15;
  const level = topic.measuredLevel ?? "unknown";
  const hardBoost = topic.selfHard ? 1.2 : topic.selfKnown ? 0.75 : 1;
  const weightBoost =
    topic.weightPercent == null
      ? 1
      : 0.8 + Math.min(40, topic.weightPercent) / 50;
  const heavyBoost = topic.examHeavy || topic.importance === "important" ? 1.15 : 1;
  const priority =
    topic.priority && topic.priority >= 1 && topic.priority <= 5
      ? 1.25 - (topic.priority - 1) * 0.05
      : 1;
  return Math.round(base * LEVEL_LOAD[level] * hardBoost * heavyBoost * weightBoost * priority);
}

/**
 * Ön koşul, sonra belgenin sırası. Eşitlik bozucu BELGENİN KENDİ SIRASI, alfabe değil: konular
 * buraya belgeden çıktıkları sırayla geliyor, yazarın öğretim sırası.
 *
 * Sınav ağırlığı, ölçülen zayıflık ve öğrencinin "zorlandığım" seçimi SIRAYI DEĞİŞTİRMEZ (19 Ekim
 * 2026): süre ve ek pratik verir (`estimateTopicMinutes`, `extraPracticeForTopic`). Eskiden
 * öne alıyordu; AYT Biyoloji setinde yol "Sinir Dokusu, Nöron Yapısı"nı yedinci sıraya itti, yeniden
 * planlamada da öğrencinin odak seçtiği konular yolun başına sıçrıyordu.
 */
export function orderTopicsByPrerequisites(
  topics: ScheduleTopicInput[],
): ScheduleTopicInput[] {
  const byTitle = new Map(
    topics.map((t) => [t.title.trim().toLocaleLowerCase("tr"), t]),
  );
  const documentOrder = new Map(topics.map((t, index) => [t.id, index]));
  const remaining = new Set(topics.map((t) => t.id));
  const ordered: ScheduleTopicInput[] = [];

  while (remaining.size) {
    const ready = topics.filter((t) => {
      if (!remaining.has(t.id)) return false;
      const prereqs = t.prerequisites ?? [];
      return prereqs.every((p) => {
        const node = byTitle.get(p.trim().toLocaleLowerCase("tr"));
        return !node || !remaining.has(node.id);
      });
    });
    const pick = (ready.length ? ready : topics.filter((t) => remaining.has(t.id))).sort(
      (a, b) => (documentOrder.get(a.id) ?? 0) - (documentOrder.get(b.id) ?? 0),
    )[0];
    if (!pick) break;
    remaining.delete(pick.id);
    ordered.push(pick);
  }
  return ordered;
}

/**
 * Aynı türün tekrarı, öğrenciye aynı iş gibi görünmesin.
 *
 * 20 Ekim 2026: ek testlerin adı "Tekrar testi (karışık)" ve "Zor sorular"dı; ikisi de olmayan bir
 * şey vaat ediyordu. `practiceVariant` düğüme yazılmıyor, test motoru tek konunun sayfalarından
 * öğrencinin seçtiği zorlukta yazıyor — ne karışık ne daha zor. Ad dürüstçe sırayı söyler (ürün
 * sahibinin kararı: karışık/zor test kurulmaz).
 *
 * 25 Ekim 2026: `practiceVariant` artık düğümün `session_meta`'sına yazılır; test motoru varyanta
 * göre konunun başka bir dilimini sorar (`practiceCoverage`) ve önceki testlerin köklerini tekrarlamaz.
 * İlk testin adı "Konu testi": doğru/yanlış ayrı düğüm.
 */
export function practiceActivity(variant: number): { label: string; reason: string | null } {
  if (variant <= 0) return { label: "Konu testi", reason: null };
  if (variant === 1) {
    return {
      label: "İkinci test",
      reason: "Sınavda ağırlıklı konu olduğu için ikinci bir test.",
    };
  }
  return {
    label: "Üçüncü test",
    reason: "Sınavda ağırlıklı konu olduğu için üçüncü bir test.",
  };
}

function roleMinutes(role: ScheduleSessionRole, topicMinutes: number): number {
  if (role === "learn") return Math.round(topicMinutes * 0.45);
  if (role === "practice") return Math.round(topicMinutes * 0.35);
  if (role === "review") return Math.round(topicMinutes * 0.2);
  return Math.min(45, Math.max(20, Math.round(topicMinutes * 0.3)));
}

function objectiveFor(topic: ScheduleTopicInput, role: ScheduleSessionRole): string {
  if (topic.objective?.trim()) {
    if (role === "learn") return topic.objective.trim();
    if (role === "practice") return `Uygula: ${topic.objective.trim()}`;
    if (role === "review") return `Tekrar: ${topic.objective.trim()}`;
    return `Deneme hazırlığı: ${topic.objective.trim()}`;
  }
  if (role === "learn") return `${topic.title} konusunu öğren`;
  if (role === "practice") return `${topic.title} alıştırması`;
  if (role === "review") return `${topic.title} tekrarı`;
  return "Kapsamlı yazılı deneme";
}

/**
 * Build a real calendar: prereq order, load vs available time, honest cuts.
 * Never stacks brand-new learn sessions on the last study day — except in a plan of one or two
 * study days (the exam is tomorrow or the day after), where the last day is all there is.
 *
 * Kipler (30 Ekim 2026, Paket I, `schedulePlanMode`):
 * - kısa (sınav 7 günden yakın): konular günlere yükleriyle paylaştırılır (`spreadByLoad`), hepsi
 *   bugüne yığılmaz; iki günlük planda son gün de yeni konu alır.
 * - normal: eskisi gibi.
 * - uzun (45 günden uzak): öğrenme dönemin bir bölümüne (`learningTailDays`), kalanı tarihe bağlı
 *   tekrara (`PATH_REVIEW_LADDER_DAYS`), aylık ara kontrole ve finale; hiçbir hafta boş kalmaz.
 */
export function buildExamScheduleV2(input: ScheduleBuildInput): ScheduleBuildResult {
  const daily = Math.max(5, Math.min(480, Math.floor(input.dailyMinutes || 45)));
  const studyDayDates = listStudyDayDates(
    input.daysToExam,
    input.studyDays,
    input.fromDate,
  );
  const capacity = studyDayBudgets(studyDayDates, daily);
  const availableMinutes = capacity.reduce((sum, minutes) => sum + minutes, 0);
  const targetMode = targetPlanMode(input.targetScore);
  const masteryBar = masteryBarForTarget(input.targetScore);
  const tempo = targetTempoFactor(input.targetScore);
  const planMode = schedulePlanMode(input.daysToExam);
  // Konular yolun sırasıyla gelir (kurulumda öğrencinin onayladığı liste, yeniden planlamada
  // hazırlığın konu sırası); takvim yeniden dizmez.
  const ordered = input.topics.slice();
  const loads = ordered.map((t) => ({
    topic: t,
    minutes: Math.max(MIN_TOPIC_MINUTES, Math.round(estimateTopicMinutes(t) * tempo)),
  }));

  const mockBuffer = Math.min(45, daily);
  let required = loads.reduce((s, x) => s + x.minutes, 0) + mockBuffer;
  // Mock exam buffer on last day.
  const kept = [...loads];
  const cutTopicIds: string[] = [];
  const optionsIfTight: ScheduleFitOption[] = [];

  /**
   * Süre yetmediğinde konu ATILMAZ, sıkıştırılır.
   *
   * Eskiden en düşük öncelikli konular plandan çıkarılıyordu: öğrenci sekiz
   * konu onaylayıp dördünü alıyordu. Sınavda o dört konu da çıkacağı için
   * plan, kapsamı daraltarak değil yalnızca kendi vaadini daraltarak
   * "sığıyor" hâline geliyordu. Konu başına süreyi kısmak dürüst olan:
   * her konu planda kalır, dar zamanda her birine daha az yer düşer.
   */
  if (required > availableMinutes) {
    optionsIfTight.push("increase_daily_time", "prioritize_topics");
    if (input.daysToExam < 60) optionsIfTight.push("extend_days");

    const topicTotal = required - mockBuffer;
    const budget = Math.max(0, availableMinutes - mockBuffer);
    const factor = topicTotal > 0 ? budget / topicTotal : 1;
    for (const load of kept) {
      // Zorlandığı ve ölçülmemiş konular sıkıştırmadan daha az etkilenir.
      const shield =
        load.topic.selfHard || (load.topic.measuredLevel ?? "unknown") === "unknown"
          ? 1.1
          : 1;
      load.minutes = Math.max(
        MIN_TOPIC_MINUTES,
        Math.round(load.minutes * factor * shield),
      );
    }
    required = kept.reduce((s, x) => s + x.minutes, 0) + mockBuffer;
  }

  // Taban süreye rağmen sığmıyorsa gerçekten süre yetmiyor — yine de kapsam
  // daraltılmaz, durum olduğu gibi bildirilir.
  const fits = required <= availableMinutes;
  const sessions: ScheduleSession[] = [];
  let sortOrder = 0;

  // Day budgets
  const dayBudget = [...capacity];
  const lastIdx = studyDayDates.length - 1;
  /**
   * Kısa ya da bir-iki çalışma günlük plan: konular günlere yükleriyle paylaştırılır. Bir ya da iki
   * çalışma günü varsa son gün de yeni konu alır (sınav yarın ya da öbür gün; başka gün yok). Eskiden
   * son gün yalnız denemeye kalıyordu: iki günlük vize planında sekiz konunun yedisi bugüne yığıldı,
   * yarın sınavı olan planda bütün dersler "tekrar"a çevriliyordu.
   */
  const compact = planMode === "short" || studyDayDates.length < 3;
  const learnLimit = compact
    ? studyDayDates.length >= 3
      ? lastIdx
      : studyDayDates.length
    : Math.max(0, lastIdx);
  const learnsOnLastDay = learnLimit > lastIdx;

  const cite = (topic: ScheduleTopicInput, pages: number[] = topic.pageNumbers ?? []) =>
    sourceCitation(topic.sourceRefs, pages);

  const partFields = (chunk: LessonChunk | null) =>
    chunk && chunk.parts > 1
      ? { lessonPart: chunk.part, lessonParts: chunk.parts, ...(chunk.title ? { unitTitle: chunk.title } : {}) }
      : {};
  // Kavram birimi varsa dersin hedefi birimin adıdır; yoksa "(2/5)".
  const partObjective = (objective: string, chunk: LessonChunk | null) =>
    chunk && chunk.parts > 1 ? (chunk.title ? chunk.title : `${objective} (${chunk.part}/${chunk.parts})`) : objective;

  /**
   * Oturumu günün bütçesine bakmadan yazar ve bütçeden düşer. Bütçe sıfırın altına inebilir: taşan gün
   * "en boş gün" aramasında arkaya düşsün (dolu günlere aynı konu yığılmasın).
   */
  const pushSession = (
    dayIndex: number,
    topic: ScheduleTopicInput,
    role: ScheduleSessionRole,
    duration: number,
    practiceVariant: number | null = null,
    chunk: LessonChunk | null = null,
    extra: Partial<ScheduleSession> = {},
  ) => {
    dayBudget[dayIndex] -= duration;
    const pages = chunk ? chunk.pages : (topic.pageNumbers ?? []);
    const cited = cite(topic, pages);
    const reason = practiceVariant == null ? null : practiceActivity(practiceVariant).reason;
    const objective = partObjective(objectiveFor(topic, role), chunk);
    const session: ScheduleSession = {
      dayIndex: dayIndex + 1,
      calendarDate: studyDayDates[dayIndex],
      topicId: topic.id,
      topicTitle: topic.title,
      objective: reason ? `${objective} ${reason}` : objective,
      sourcePages: cited.omitBarePages ? [] : [...pages],
      durationMinutes: duration,
      role,
      kind: ROLE_KIND[role],
      sortOrder: sortOrder++,
      practiceVariant,
      sourceLabel: cited.label,
      ...partFields(chunk),
      ...extra,
    };
    sessions.push(session);
    return session;
  };

  const place = (
    dayIndex: number,
    topic: ScheduleTopicInput,
    role: ScheduleSessionRole,
    minutes: number,
    practiceVariant: number | null = null,
    chunk: LessonChunk | null = null,
    extra: Partial<ScheduleSession> = {},
  ) => {
    const duration = Math.max(10, Math.min(dayBudget[dayIndex], minutes));
    if (duration < 10 || dayBudget[dayIndex] < 10) return false;
    pushSession(dayIndex, topic, role, duration, practiceVariant, chunk, extra);
    return true;
  };

  /** Konu testinin günündeki kısa adım (D/Y, dönüşümlü etkileşim); günün bütçesine dokunmaz. */
  const companion = (dayIndex: number, topic: ScheduleTopicInput, kind: PlanNodeKind, minutes: number) => {
    const pages = topic.pageNumbers ?? [];
    const cited = cite(topic, pages);
    sessions.push({
      dayIndex: dayIndex + 1,
      calendarDate: studyDayDates[dayIndex],
      topicId: topic.id,
      topicTitle: topic.title,
      objective: objectiveFor(topic, "practice"),
      sourcePages: cited.omitBarePages ? [] : [...pages],
      durationMinutes: minutes,
      role: "practice",
      kind,
      sortOrder: sortOrder++,
      practiceVariant: null,
      sourceLabel: cited.label,
    });
  };

  /**
   * Yeni konuların öğrenilmesi dönemin ilk ~%60'ına yayılır; kalan kısım
   * tekrar, eksik kapatma ve denemeye kalır.
   *
   * Önceden her konu "ilk uygun gün"e yerleştiriliyordu. Bol zamanlı planlarda
   * bu, 30 günlük hazırlığı ilk 10 güne yığıp ortada 11 boş gün bırakıyordu:
   * öğrenci ya baştan boğuluyor ya da ortada planı bırakıyordu. Konu başına
   * bir hedef gün hesaplayıp aramayı oradan başlatmak yükü döneme dağıtıyor.
   *
   * İki geçiş (19 Ekim 2026). Konular tek tek ve bütün işleriyle (ders, üç test, tekrar)
   * yerleşiyordu: 25 günlük, 29 konuluk hazırlıkta ilk konular ağırlıklı oldukları için üçer test
   * aldı, günler doldu ve son on üç konunun dersi sondan bir önceki güne yığıldı. Şimdi önce her
   * konunun dersi ve bir testi döneme yayılır; ek testler ve tekrarlar kalan süreye girer. Süre
   * darsa yeni konular deneme gününe kadar bütün döneme yayılır.
   *
   * Uzun planda (30 Ekim 2026) öğrenmenin bittiği gün `learningTailDays` kadar erkene çekilir: kalan
   * süre tekrar, ara kontrol ve finale kalır.
   */
  const tight = optionsIfTight.length > 0;
  const learnEnd = Math.max(1, lastIdx - learningTailDays(lastIdx, input.daysToExam));
  const learnWindow = learnEnd;
  const spreadStep = kept.length > 1 ? learnWindow / (kept.length - 1) : 0;

  /** Yolun sırası konu konu: ders(ler), testler, tekrar. Takvim günü sırayı belirlemez. */
  const sequence = new Map<ScheduleSession, number>();
  const mark = (topicIndex: number, step: number) => {
    const last = sessions[sessions.length - 1];
    if (last) sequence.set(last, topicIndex * 1000 + step);
  };

  const core: { learnDay: number; practiceDay: number }[] = [];

  if (compact) {
    // Kısa kip: konunun günü yükünden ve günün bütçesinden (`spreadByLoad`; tatil yarım bütçe, son gün
    // denemenin payı düşülür); günün işleri o güne sığacak kadar kısalır (en az 10 dk). Ders, ilk test ve
    // kısa adımlar aynı gün. Son gün de ders alıyorsa denemeye pay kalır.
    const reserve = learnsOnLastDay ? Math.min(mockBuffer, Math.round(capacity[lastIdx]! / 2)) : 0;
    const learnRooms = capacity
      .slice(0, Math.max(1, learnLimit))
      .map((room, day) => Math.max(10, room - (day === lastIdx ? reserve : 0)));
    const dayOf = spreadByLoad(kept.map((entry) => entry.minutes), Math.max(1, learnLimit), learnRooms);
    const coreRaw = kept.map(({ minutes }) => roleMinutes("learn", minutes) + roleMinutes("practice", minutes));
    const dayLoad = studyDayDates.map(() => 0);
    kept.forEach((_, index) => {
      dayLoad[dayOf[index]!] += coreRaw[index]!;
    });
    const scale = dayLoad.map((load, day) => {
      const room = Math.max(10, capacity[day]! - (day === lastIdx ? reserve : 0));
      return load > room ? room / load : 1;
    });
    for (const [topicIndex, { topic, minutes }] of kept.entries()) {
      const day = dayOf[topicIndex]!;
      const factor = scale[day]!;
      const chunks = topicLessonChunks(topic);
      const parts = chunks.length;
      const learnM = Math.max(10, Math.round(roleMinutes("learn", minutes) * factor));
      const lessonM = parts > 1 ? Math.max(10, Math.round(learnM / parts)) : learnM;
      for (const [chunkIndex, chunkEntry] of chunks.entries()) {
        const chunk: LessonChunk | null =
          parts > 1 ? { pages: chunkEntry.pages, part: chunkIndex + 1, parts, title: chunkEntry.title } : null;
        pushSession(day, topic, "learn", lessonM, null, chunk);
        mark(topicIndex, chunkIndex);
      }
      pushSession(day, topic, "practice", Math.max(10, Math.round(roleMinutes("practice", minutes) * factor)), 0);
      mark(topicIndex, 100);
      companion(day, topic, "true_false", BLOCK_TRUE_FALSE_MINUTES);
      mark(topicIndex, 110);
      companion(day, topic, blockInteractiveKind(topicIndex, input.includeAudio !== false), BLOCK_INTERACTIVE_MINUTES);
      mark(topicIndex, 115);
      core.push({ learnDay: day, practiceDay: day });
    }
    if (reserve > 0) dayBudget[lastIdx] = Math.max(dayBudget[lastIdx]!, reserve);
  }

  // Dersler ve ilk testler deneme gününden önceki günlere sığmalı. Konu sayısı gün sayısını
  // geçiyorsa bir güne birden çok konu düşer ve ders + ilk test günün o payına kısalır (en az
  // 10 dk). Kısalmayınca her konu bir günü dolduruyor, sondaki konular son güne yığılıyordu.
  const topicsPerDay = Math.max(1, Math.ceil(kept.length / Math.max(1, lastIdx)));
  const coreCap = tight ? daily / topicsPerDay : Number.POSITIVE_INFINITY;

  // 1. geçiş — her konunun dersi ve ilk testi.
  // Sonraki konunun dersi, bir öncekinin dersinden daha erken bir güne
  // konamaz. Gün doluysa ileri kayar; geriye, henüz öğretilmemiş bir konunun
  // dersini öne almak için değil.
  let earliestLearnDay = 0;
  for (const [topicIndex, { topic, minutes }] of (compact ? [] : kept).entries()) {
    const learnRaw = roleMinutes("learn", minutes);
    const practiceRaw = roleMinutes("practice", minutes);
    const coreScale = Math.min(1, coreCap / Math.max(1, learnRaw + practiceRaw));
    const learnM = Math.max(10, Math.round(learnRaw * coreScale));
    const practiceM = Math.max(10, Math.round(practiceRaw * coreScale));
    const preferredDay = Math.min(
      Math.max(0, lastIdx - 1),
      Math.floor(topicIndex * spreadStep),
    );

    // Büyük konu ardışık derslere bölünür; her ders bir öncekinden önceki
    // bir güne konmaz. Tek dersli konuda bu döngü bir kez döner.
    const chunks = topicLessonChunks(topic);
    const parts = chunks.length;
    const lessonM = parts > 1 ? Math.max(MIN_TOPIC_MINUTES, Math.round(learnM / parts)) : learnM;
    let learnDay = -1;
    let chunkFrom = Math.max(preferredDay, earliestLearnDay);
    for (const [chunkIndex, chunkEntry] of chunks.entries()) {
      const chunk: LessonChunk | null =
        parts > 1 ? { pages: chunkEntry.pages, part: chunkIndex + 1, parts, title: chunkEntry.title } : null;
      let chunkDay = -1;
      const learnOrder: number[] = [];
      for (let d = chunkFrom; d < learnLimit; d += 1) learnOrder.push(d);

      for (const d of learnOrder) {
        if (dayBudget[d] >= lessonM) {
          if (place(d, topic, "learn", lessonM, null, chunk)) {
            chunkDay = d;
            break;
          }
        }
      }
      if (chunkDay < 0) {
        for (const d of learnOrder) {
          if (place(d, topic, "learn", Math.min(lessonM, dayBudget[d]), null, chunk)) {
            chunkDay = d;
            break;
          }
        }
      }
      if (chunkDay < 0) {
        // Günlük bütçeler tükendi. Konuyu plandan düşürmek yerine, önceki
        // dersin gününden itibaren en boş güne taşıyoruz. O gün hedeflenen
        // süreyi aşabilir; konu sınavda çıkacağı için planda görünür.
        let target = Math.min(chunkFrom, Math.max(0, lastIdx - 1));
        for (let d = target + 1; d < Math.max(1, lastIdx); d += 1) {
          if (dayBudget[d] > dayBudget[target]) target = d;
        }
        pushSession(target, topic, "learn", MIN_TOPIC_MINUTES, null, chunk);
        chunkDay = target;
      }
      mark(topicIndex, chunkIndex);
      learnDay = chunkDay;
      chunkFrom = chunkDay;
    }
    earliestLearnDay = learnDay;

    // İlk test, dersin gününden itibaren. Her konunun en az bir testi olur: gün bütçesi tükenince
    // ders gibi en boş güne (dersin gününden önce değil) taşınır; o gün hedef süreyi aşabilir.
    let practiceDay = -1;
    for (let d = Math.max(0, learnDay); d < lastIdx; d += 1) {
      if (place(d, topic, "practice", practiceM, 0)) {
        practiceDay = d;
        break;
      }
    }
    if (practiceDay < 0 && lastIdx > 0) {
      let target = Math.min(Math.max(0, learnDay), lastIdx - 1);
      for (let d = target + 1; d < lastIdx; d += 1) {
        if (dayBudget[d] > dayBudget[target]) target = d;
      }
      pushSession(target, topic, "practice", MIN_TOPIC_MINUTES, 0);
      practiceDay = target;
    }
    if (practiceDay >= 0) {
      mark(topicIndex, 100);
      companion(practiceDay, topic, "true_false", BLOCK_TRUE_FALSE_MINUTES);
      mark(topicIndex, 110);
      companion(practiceDay, topic, blockInteractiveKind(topicIndex, input.includeAudio !== false), BLOCK_INTERACTIVE_MINUTES);
      mark(topicIndex, 115);
    }
    core.push({ learnDay, practiceDay: Math.max(practiceDay, learnDay) });
  }

  // 2. geçiş — ağırlıklı konunun ek testleri ve her konunun tekrarı, kalan süreye.
  for (const [topicIndex, { topic, minutes }] of kept.entries()) {
    const { learnDay, practiceDay } = core[topicIndex]!;
    const practiceM = roleMinutes("practice", minutes);
    const reviewM = roleMinutes("review", minutes);
    const extras = extraPracticeForTarget(
      extraPracticeForTopic(topic, input.daysToExam),
      input.targetScore,
    );
    const practiceGoal = 1 + extras;
    let practiceCursor = practiceDay + 1;
    for (let variant = 1; variant < practiceGoal && practiceCursor < lastIdx; variant += 1) {
      let placed = false;
      for (let d = practiceCursor; d < lastIdx; d += 1) {
        if (place(d, topic, "practice", practiceM, variant)) {
          mark(topicIndex, 120 + variant);
          practiceCursor = d + 1;
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }

    // Reviews prefer later days but not only last if we need mock room.
    // Hedef kipi tekrar sayısını belirler: zirvede ağır konuya ikinci tur, barajda yalnız zayıf.
    const reviewGoal = reviewPassesForTarget(input.targetScore, topic);
    let reviewCursor = Math.max(learnDay + 1, 0);
    for (let pass = 0; pass < reviewGoal; pass += 1) {
      let placed = false;
      for (let d = reviewCursor; d <= lastIdx; d += 1) {
        if (d === lastIdx && dayBudget[d] < reviewM + 20) continue;
        if (place(d, topic, "review", reviewM)) {
          mark(topicIndex, 200 + pass);
          reviewCursor = d + 1;
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
  }

  /**
   * Konu bloğunun dışındaki adımın yol sırası (30 Ekim 2026): o güne kadar dersi işlenen son konunun
   * bloğundan sonra, tarih sırasıyla. Uzun aralıklı tekrar konusunun bloğuna konsaydı öğrenci 21 gün
   * sonraki tekrarı dersin hemen ardından yapardı; tarih aralığın anlamını taşımazdı.
   */
  const slotFor = (dayIndex: number) => {
    let slot = 0;
    core.forEach((entry, index) => {
      if (entry.learnDay >= 0 && entry.learnDay <= dayIndex) slot = index;
    });
    return slot;
  };
  const markInterlude = (dayIndex: number) => {
    const last = sessions[sessions.length - 1];
    if (last) sequence.set(last, slotFor(dayIndex) * 1000 + 300 + (dayIndex / Math.max(1, lastIdx + 1)) * 500);
  };
  const firstDayOnOrAfter = (iso: string) => studyDayDates.findIndex((date) => date >= iso);
  const finalStartIdx = Math.max(0, studyDayDates.length - FINAL_STUDY_DAYS);

  // Ara sınav öncesi kontrol (28 Ekim 2026): ara sınavdan önceki son çalışma gününe, o güne kadar dersi
  // işlenmiş konular bitince. Ara sınavdan önce hiç ders yoksa ya da gün deneme günüyse konmaz.
  const checkDays: number[] = [];
  for (const checkpoint of input.checkpoints ?? []) {
    let target = -1;
    for (let d = 0; d < lastIdx; d += 1) if (studyDayDates[d]! < checkpoint.date) target = d;
    if (target < 0) continue;
    let topicIndex = -1;
    core.forEach((entry, index) => {
      if (entry.learnDay >= 0 && entry.learnDay <= target) topicIndex = index;
    });
    if (topicIndex < 0) continue;
    const topic = kept[topicIndex]!.topic;
    const label = checkpoint.label.trim() || "Ara sınav";
    sessions.push({
      dayIndex: target + 1,
      calendarDate: studyDayDates[target]!,
      topicId: topic.id,
      topicTitle: topic.title,
      objective: `${label} (${checkpoint.date}) öncesi: o güne kadar işlediğin konulardan karışık kontrol.`,
      sourcePages: [],
      durationMinutes: CHECKPOINT_MINUTES,
      role: "practice",
      kind: "focused",
      sortOrder: sortOrder++,
      practiceVariant: null,
      sourceLabel: null,
      checkpoint: label,
      checkpointDate: checkpoint.date,
    });
    markInterlude(target);
    checkDays.push(target);
  }

  const lastTouch = new Map<string, string>();
  for (const session of sessions) {
    const previous = lastTouch.get(session.topicId);
    if (!previous || session.calendarDate > previous) lastTouch.set(session.topicId, session.calendarDate);
  }

  if (planMode === "long" && kept.length) {
    /**
     * Uzun planın tarihe bağlı tekrarı (30 Ekim 2026). Canlıda 7,5 ay sonraki finalde ilk konular
     * Haziran'a kadar bir daha hiç açılmıyordu. Her konu ilk dersinden 21, 45, 90, 150 gün sonra
     * "Kartlarla tekrar" alır (finalin son haftasına girmeyenler); gün doluysa bir hafta içinde ilk
     * uygun güne kayar, yer yoksa o aralık atlanır.
     */
    for (const [topicIndex, { topic, minutes }] of kept.entries()) {
      const learnDay = core[topicIndex]!.learnDay;
      if (learnDay < 0) continue;
      const learnDate = studyDayDates[learnDay]!;
      const reviewM = roleMinutes("review", minutes);
      for (const [pass, offset] of PATH_REVIEW_LADDER_DAYS.entries()) {
        const from = firstDayOnOrAfter(addDays(learnDate, offset));
        if (from < 0 || from >= finalStartIdx) break;
        for (let d = from; d < Math.min(finalStartIdx, from + 7); d += 1) {
          if (place(d, topic, "review", reviewM, null, null, { longReview: pass + 1 })) {
            markInterlude(d);
            const previous = lastTouch.get(topic.id);
            if (!previous || studyDayDates[d]! > previous) lastTouch.set(topic.id, studyDayDates[d]!);
            break;
          }
        }
      }
    }

    // Aylık ara kontrol: öğrenilen konulardan karışık kısa kontrol (en az iki konu işlenmişken).
    // Öğrencinin kendi ara sınavına bir haftadan yakınsa konmaz; o zaten bir kontrol.
    const start = studyDayDates[0]!;
    for (let offset = LONG_CHECK_EVERY_DAYS; ; offset += LONG_CHECK_EVERY_DAYS) {
      const day = firstDayOnOrAfter(addDays(start, offset));
      if (day < 0 || day >= finalStartIdx) break;
      if (checkDays.some((other) => Math.abs(other - day) < 7)) continue;
      const learned = core.filter((entry) => entry.learnDay >= 0 && entry.learnDay <= day).length;
      if (learned < 2) continue;
      const topic = kept[slotFor(day)]!.topic;
      sessions.push({
        dayIndex: day + 1,
        calendarDate: studyDayDates[day]!,
        topicId: topic.id,
        topicTitle: topic.title,
        objective: `${LONG_CHECK_LABEL}: o güne kadar işlediğin konulardan karışık kontrol.`,
        sourcePages: [],
        durationMinutes: CHECKPOINT_MINUTES,
        role: "practice",
        kind: "focused",
        sortOrder: sortOrder++,
        practiceVariant: null,
        sourceLabel: null,
        checkpoint: LONG_CHECK_LABEL,
      });
      markInterlude(day);
      checkDays.push(day);
    }
  }

  if (!compact && kept.length) {
    /**
     * Boş hafta kalmaz (30 Ekim 2026): finalden önceki her haftada en az bir adım. Boş haftaya, o
     * haftadan önce öğrenilmiş ve en uzun süredir açılmamış konunun tekrarı konur (eşitlikte süresi uzun
     * olan, yani ağır ya da zor konu). Yük yine günün bütçesinden; tatilde yarım bütçe. Yoğun planda
     * boş hafta olmadığı için bir şey değişmez.
     */
    const weekOf = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
    const busyWeeks = new Set(sessions.map((session) => weekOf(session.calendarDate)));
    const weeks = new Map<string, number[]>();
    for (let d = 0; d < finalStartIdx; d += 1) {
      const key = weekOf(studyDayDates[d]!);
      weeks.set(key, [...(weeks.get(key) ?? []), d]);
    }
    for (const [week, days] of weeks) {
      if (busyWeeks.has(week)) continue;
      const firstDay = days[0]!;
      const candidates = kept
        .map((entry, index) => ({ entry, index, learnDay: core[index]!.learnDay }))
        .filter(({ learnDay }) => learnDay >= 0 && learnDay < firstDay)
        .sort((a, b) => {
          const left = lastTouch.get(a.entry.topic.id) ?? "";
          const right = lastTouch.get(b.entry.topic.id) ?? "";
          return left.localeCompare(right) || b.entry.minutes - a.entry.minutes || a.index - b.index;
        });
      const pick = candidates[0];
      if (!pick) continue;
      const middle = days[Math.floor((days.length - 1) / 2)]!;
      const tryDays = [middle, ...days.filter((d) => d !== middle)];
      for (const d of tryDays) {
        const reviewM = roleMinutes("review", pick.entry.minutes);
        if (place(d, pick.entry.topic, "review", reviewM, null, null, { longReview: 0 })) {
          markInterlude(d);
          lastTouch.set(pick.entry.topic.id, studyDayDates[d]!);
          busyWeeks.add(week);
          break;
        }
      }
    }
  }

  // Last day: mock only (no new learn). Use a synthetic topic if needed.
  const mockTopic: ScheduleTopicInput = kept[0]?.topic ?? {
    id: "mock",
    title: "Genel deneme",
    pageNumbers: [],
  };
  if (!place(lastIdx, mockTopic, "mock", Math.min(45, dayBudget[lastIdx] || daily))) {
    // Son gün dersle dolduysa deneme yine kurulur: yolun sonu denemesiz kalmasın.
    pushSession(lastIdx, mockTopic, "mock", Math.min(45, Math.max(20, Math.round(daily / 2))));
  }

  // Ensure we never left a learn on last day (one- or two-study-day plans excepted: no other day).
  if (!learnsOnLastDay) {
    for (const session of sessions) {
      if (session.dayIndex === lastIdx + 1 && session.role === "learn") {
        session.role = "review";
        session.kind = ROLE_KIND.review;
        session.objective = objectiveFor(
          { id: session.topicId, title: session.topicTitle },
          "review",
        );
      }
    }
  }

  // Hazırlık geneli oturum (deneme) son yedi çalışma gününde. Konu sırası değişmez.
  pinFinalSessionsInPlace(
    sessions.filter((session) => !session.checkpoint),
    studyDayDates,
  );
  // Resmî tatile düşen oturum işaretlenir (takvimde "Resmî Tatil (Esnek Gün)" rozeti).
  for (const session of sessions) {
    const holiday = turkishHolidayOn(session.calendarDate);
    if (holiday) session.holiday = holiday;
    // Resmî takvim (MEB 2026-2027, ÖSYM 2027): yük değişmez, yalnız işaret.
    const schoolBreak = schoolBreakOn(session.calendarDate);
    if (schoolBreak) session.schoolBreak = schoolBreak;
    const officialExam = officialExamOn(session.calendarDate);
    if (officialExam) session.officialExam = officialExam;
  }

  // Yolun sırası konu konu (dersler, testler, tekrar), en sonda deneme. İki geçiş oturumları
  // karışık sırayla üretti; sıra numarası burada konu sırasına göre yeniden verilir.
  sessions.sort(
    (a, b) =>
      (sequence.get(a) ?? Number.MAX_SAFE_INTEGER) - (sequence.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  sessions.forEach((session, index) => {
    session.sortOrder = index;
  });

  // Planın birimi konu. Günlük dakika yalnızca etkinliklerin güne
  // sığması için içeride kalır; özette saat kotası yok.
  const modeNote =
    targetMode === "peak"
      ? " · zirve hedefi: ekstra test ve tekrar"
      : targetMode === "pass"
        ? " · baraj hedefi: çekirdek yol"
        : "";
  const summary = fits
    ? `Planın ${kept.length}${modeNote}`
    : `Planın ${kept.length} konu; süre dar, etkinlikler kısaltıldı${modeNote}`;

  // Takvim günü yolu sıralamaz. Güne göre dizmek, dolu bir günden geriye
  // kayan sonraki konunun dersini önceki konunun dersinin önüne alıyordu.
  // Tekrarlar sonraki günlere düşebilir; listedeki sıra öğretim sırasıdır.
  return {
    sessions,
    availableMinutes,
    requiredMinutes: required,
    fits,
    cutTopicIds,
    optionsIfTight: fits ? [] : optionsIfTight,
    orderedTopicIds: kept.map((k) => k.topic.id),
    studyDayDates,
    summary,
    targetMode,
    masteryBar,
    ...(input.checkpoints?.length ? { checkpoints: [...input.checkpoints] } : {}),
  };
}

export type CompletedSessionRef = {
  sortOrder: number;
  calendarDate: string;
  /** When set, only a session of this kind counts as the same work. */
  kind?: PlanNodeKind;
};

/**
 * Missed days: keep completed sessions; redistribute remaining onto future study days.
 * Does not rewrite past calendar dates of completed work.
 */
export function redistributeRemainingSchedule(input: {
  previous: ScheduleBuildResult;
  completed: CompletedSessionRef[];
  fromDate?: Date;
  dailyMinutes: number;
  studyDays: number[];
  daysToExam: number;
  topics: ScheduleTopicInput[];
  targetScore?: number | null;
}): ScheduleBuildResult {
  const completedKeys = new Set(
    input.completed.map((c) =>
      c.kind
        ? `${c.calendarDate}:${c.sortOrder}:${c.kind}`
        : `${c.calendarDate}:${c.sortOrder}`,
    ),
  );
  /*
    Yazılı deneme bittiyse ikincisi kurulmaz (20 Ekim 2026). Notlanan deneme artık düğümü bitiriyor;
    ardından takvim yeniden kuruluyor. Uyarlamalı ekleme ve şablon dolgusu düğüm sırasını
    kaydırdığı için bitmiş denemenin sırası oturumunkiyle tutmuyor, oturum "kalan" sayılıyor ve
    kurulum her zaman bir deneme koyduğundan yola ikinci "Yazılı deneme" giriyordu.
  */
  const mockDone = input.completed.some((c) => c.kind === "written_exam");
  const sessionDone = (session: ScheduleSession) =>
    (mockDone && session.role === "mock") ||
    completedKeys.has(
      `${session.calendarDate}:${session.sortOrder}:${session.kind}`,
    ) ||
    completedKeys.has(`${session.calendarDate}:${session.sortOrder}`);
  const keptCompleted = input.previous.sessions.filter(sessionDone);
  const remainingTopicIds = new Set(
    input.previous.sessions
      .filter((session) => !sessionDone(session))
      .map((s) => s.topicId),
  );
  const topics = input.topics.filter((t) => remainingTopicIds.has(t.id));
  // Ara sınav kontrolü korunur; bitirilmiş kontrol yeniden konmaz (28 Ekim 2026).
  const checkpoints = (input.previous.checkpoints ?? []).filter(
    (checkpoint) => !keptCompleted.some((session) => session.checkpointDate === checkpoint.date),
  );
  const rebuilt = buildExamScheduleV2({
    daysToExam: input.daysToExam,
    dailyMinutes: input.dailyMinutes,
    studyDays: input.studyDays,
    topics,
    fromDate: input.fromDate,
    targetScore: input.targetScore,
    checkpoints,
  });
  const completedMaxSort = keptCompleted.reduce(
    (m, s) => Math.max(m, s.sortOrder),
    -1,
  );
  /**
   * BİTİRİLEN OTURUM YENİDEN ÜRETİLMEZ.
   *
   * Konu, oturumlarından biri bile kalmışsa yeniden kuruluyor ve kurulum
   * konunun BÜTÜN oturumlarını üretiyor. Sonuç: dersini bitirip quiz'ine
   * gelmemiş öğrenci sınav tarihini değiştirdiğinde aynı dersi bir daha
   * karşısında buluyordu — canlıda "Dane Boyu" hem bitmiş hem kilitli
   * olarak iki kez duruyordu.
   *
   * Ölçü konu değil, KONU + ROL: bitirilen ders geri gelmez, o konunun
   * yapılmamış alıştırması ve tekrarı planda kalır.
   */
  // Büyük konunun her dersi ayrı iş: birinci dersi bitiren öğrencinin
  // ikinci dersi plandan düşmesin.
  // Tür de anahtarda: konu testini bitiren öğrencinin aynı konudaki D/Y ve podcast adımı düşmesin.
  // Tarihe bağlı adım (uzun aralıklı tekrar, ara kontrol) kendi günüyle anahtarlanır (30 Ekim 2026): dersin
  // ertesi günkü tekrarı bitti diye konunun 45 gün sonraki tekrarı, ilk aylık kontrol bitti diye
  // sonrakiler düşmesin.
  const doneKey = (s: ScheduleSession) => {
    const base = `${s.topicId}:${s.role}:${s.kind}:${s.lessonPart ?? 0}`;
    if (s.longReview != null) return `${base}:long:${s.calendarDate}`;
    if (s.checkpoint) return `${base}:check:${s.checkpointDate ?? s.calendarDate}`;
    return base;
  };
  const doneTopicRoles = new Set(keptCompleted.map(doneKey));
  const merged = [
    ...keptCompleted,
    ...rebuilt.sessions
      .filter((s) => !doneTopicRoles.has(doneKey(s)) && !(mockDone && s.role === "mock"))
      .map((s, i) => ({
        ...s,
        sortOrder: completedMaxSort + 1 + i,
      })),
  ];
  return {
    ...rebuilt,
    sessions: merged,
    summary: `Kaçırılan günler yeniden dağıtıldı · tamamlanan ${keptCompleted.length} oturum korundu · ${rebuilt.summary}`,
  };
}

/** Map schedule sessions to legacy node drafts for create_exam_prep_graph. */
export function scheduleSessionsToNodeDrafts(sessions: ScheduleSession[]) {
  return sessions.map((s) => {
    const practice = s.role === "practice" && s.kind === "quiz" ? practiceActivity(s.practiceVariant ?? 0) : null;
    const label =
      s.role === "learn"
        ? s.lessonPart && s.lessonParts && s.lessonParts > 1
          ? `Ders ${s.lessonPart}/${s.lessonParts}${s.unitTitle ? `: ${s.unitTitle}` : ""}`
          : "Ders"
        : practice
          ? practice.label
          : s.role === "practice"
            ? COMPANION_LABEL[s.kind] ?? PLAN_NODE_META[s.kind].title
            : s.role === "review"
              ? "Kartlarla tekrar"
              : "Yazılı deneme";
    const titled =
      s.checkpoint
        ? `Ara Deneme / Kontrol · ${s.checkpoint}`
        : s.role === "mock"
          ? `${label} · Tüm konular`
          : `${s.topicTitle} · ${label}`;
    return {
      kind: s.kind,
      title: s.sourceLabel && !s.checkpoint ? `${titled} · ${s.sourceLabel}` : titled,
      dayIndex: s.dayIndex,
      sortOrder: s.sortOrder,
      meta: {
        topicId: s.topicId,
        topicTitle: s.topicTitle,
        objective: s.objective,
        sourcePages: s.sourcePages,
        durationMinutes: s.durationMinutes,
        role: s.role,
        calendarDate: s.calendarDate,
        ...(s.lessonPart && s.lessonParts ? { lessonPart: s.lessonPart, lessonParts: s.lessonParts } : {}),
        ...(s.unitTitle ? { unitTitle: s.unitTitle } : {}),
        ...(practice ? { practiceVariant: Math.max(0, s.practiceVariant ?? 0) } : {}),
        ...(s.checkpoint ? { checkpoint: s.checkpoint } : {}),
        ...(s.longReview != null ? { longReview: s.longReview } : {}),
      },
    };
  });
}

const COMPANION_LABEL: Partial<Record<PlanNodeKind, string>> = {
  true_false: "Doğru/Yanlış",
  podcast: "Podcast",
  qa: "Soru-Cevap",
  oral: "Sözlü deneme",
};
