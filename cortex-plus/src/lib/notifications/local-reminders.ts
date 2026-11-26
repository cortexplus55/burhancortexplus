import { STUDY_SLOTS, daysBetween, istanbulClock, type StudyHour } from "@/lib/notifications/schedule";

/*
  Yerel çalışma hatırlatması (26 Kasım 2026, mobil 1. adım). Uygulama, öğrencinin seçtiği çalışma saatinde (18:30 /
  19:00 / 20:00 / 21:00) önümüzdeki günler için telefonda hatırlatma kurar; bildirim telefonun kendisinden çıkar, internet
  ya da anlık bildirim anahtarı gerekmez. Planı sunucu çıkarır (bu dosya, saf), uygulama her açılışta ve öne gelişte
  planı yeniden kurar (`src/lib/platform/native-reminders.ts`).

  Kurallar:
  - "Uygulama içi bildirimler" kapalıysa ya da bitmemiş yolu olan hazırlık yoksa hatırlatma yok.
  - Bugün çalışmışsa ya da bugünün saati geçtiyse ilk hatırlatma yarın.
  - Sınav günü ve sonrası hatırlatma yok; sınavdan önceki son 30 gün sınava kalan gün sayısıyla.
  - Saatler Türkiye saatiyle (UTC+3, yaz saati yok).
  - Aynı akşam sunucunun anlık bildirimiyle çift gelmesin: son `LOCAL_REMINDER_WINDOW_DAYS` günde uygulamayı açmış
    cihaza sunucu çalışma hatırlatmasını anlık bildirimle göndermez (`push.ts`); o cihazı bu plan karşılar.
*/

export const LOCAL_REMINDER_DAYS = 14;
export const LOCAL_REMINDER_WINDOW_DAYS = LOCAL_REMINDER_DAYS;
/** Yerel bildirim kimlikleri bu aralıkta: yeniden kurarken önce hepsi silinir. */
export const LOCAL_REMINDER_ID_BASE = 61_000;
export const LOCAL_REMINDER_ID_SPAN = 100;
const COUNTDOWN_DAYS = 30;
const MIN_LEAD_MS = 5 * 60 * 1000;

export type LocalReminderItem = { id: number; at: string; title: string; body: string; path: string };
export type LocalReminderPlan = { enabled: boolean; items: LocalReminderItem[] };

export type LocalReminderInput = {
  now: Date;
  inAppNotifications: boolean;
  studyHour: StudyHour;
  prep: { id: string; title: string | null; examDate: string | null } | null;
  studiedToday: boolean;
};

const GENERAL_LINES: readonly { title: string; body: (prep: string) => string }[] = [
  { title: "Kaldığın yer seni bekliyor", body: (prep) => `${prep}: kaldığın yerden tek bir adımla devam et.` },
  { title: "Bugün 5 dakikan var mı?", body: (prep) => `${prep}: kısa bir adım bile bugünü kazandırır.` },
  { title: "Bugünkü adımın hazır", body: (prep) => `${prep}: sıradaki adım seni bekliyor.` },
];

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function prepLabel(title: string | null): string {
  const clean = String(title ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "Sınav hazırlığın";
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

/** O günün hatırlatma metni. Sınav günü ve sonrası için null. */
export function localReminderMessage(day: string, examDate: string | null, prepTitle: string | null, dayIndex: number) {
  const prep = prepLabel(prepTitle);
  if (examDate) {
    const left = daysBetween(day, examDate);
    if (left <= 0) return null;
    if (left === 1) return { title: "Yarın sınavın var", body: `${prep}: bu akşam kısa bir tekrar en çok işe yarar.` };
    if (left <= COUNTDOWN_DAYS) return { title: `Sınavına ${left} gün kaldı`, body: `${prep}: bugünkü adımın hazır.` };
  }
  const line = GENERAL_LINES[dayIndex % GENERAL_LINES.length];
  return { title: line.title, body: line.body(prep) };
}

export type ReminderPrepCandidate = {
  id: string;
  title: string | null;
  exam_date: string | null;
  exam_type?: string | null;
  created_at: string | null;
};

/**
 * Hatırlatmanın anacağı hazırlık: bitmemiş yolu olan, Çalışma Stüdyosu'nun geçici deneme kaydı olmayan, tarihsizse
 * son 21 günde kurulmuş ya da çalışılmış hazırlıklardan sınavı en yakın olan; tarihli yoksa en yeni kurulan.
 */
export function pickReminderPrep(
  preps: readonly ReminderPrepCandidate[],
  unfinished: ReadonlySet<string>,
  isLive: (prep: ReminderPrepCandidate) => boolean,
): ReminderPrepCandidate | null {
  const live = preps.filter((prep) => prep.exam_type !== "deneme" && unfinished.has(prep.id) && isLive(prep));
  const dated = live.filter((prep) => prep.exam_date).sort((a, b) => String(a.exam_date).localeCompare(String(b.exam_date)));
  if (dated.length) return dated[0];
  const undated = [...live].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return undated[0] ?? null;
}

export function buildLocalReminderPlan(input: LocalReminderInput): LocalReminderPlan {
  if (!input.inAppNotifications || !input.prep) return { enabled: false, items: [] };
  const slot = STUDY_SLOTS.find((item) => item.hour === input.studyHour) ?? STUDY_SLOTS[1];
  const today = istanbulClock(input.now).day;
  const hh = String(slot.hour).padStart(2, "0");
  const mm = String(slot.minute).padStart(2, "0");
  const items: LocalReminderItem[] = [];
  for (let index = 0; index < LOCAL_REMINDER_DAYS; index += 1) {
    const day = addDays(today, index);
    const at = new Date(`${day}T${hh}:${mm}:00+03:00`);
    if (index === 0 && (input.studiedToday || at.getTime() - input.now.getTime() < MIN_LEAD_MS)) continue;
    const message = localReminderMessage(day, input.prep.examDate, input.prep.title, index);
    if (!message) break;
    items.push({
      id: LOCAL_REMINDER_ID_BASE + index,
      at: at.toISOString(),
      title: message.title,
      body: message.body,
      path: `/deneme-sinavlari/${input.prep.id}`,
    });
  }
  return { enabled: items.length > 0, items };
}
