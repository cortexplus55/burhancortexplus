/**
 * Resmî takvim (1 Kasım 2026): ÖSYM 2027 sınav takvimi, ÖDSGM LGS 2027, MEB 2026-2027 çalışma takvimi ve Diyanet
 * dinî günler (2028–2030). Satırlar `data/curriculum/scripts` ile resmî belgelerden çıkarılır; her olayın kaynağı
 * (URL + sha256) `calendar.json` içindedir. İstemcide de okunur (küçük dosya).
 */
import raw from "@/lib/curriculum/calendar.json";
import type { CalendarEvent } from "@/lib/curriculum/types";

type CalendarFile = {
  version: string;
  events: CalendarEvent[];
  sources: Record<string, { url: string; sha256: string; title: string; publisher: string; fetched_at: string }>;
};

export const OFFICIAL_CALENDAR = raw as unknown as CalendarFile;

function nextIsoDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Bir olayın kapsadığı günler (başlangıç ve bitiş dahil, en çok 40 gün). */
export function eventDays(event: Pick<CalendarEvent, "starts" | "ends">): string[] {
  const days: string[] = [];
  let day = event.starts;
  for (let guard = 0; day <= event.ends && guard < 40; guard += 1) {
    days.push(day);
    day = nextIsoDay(day);
  }
  return days;
}

/** Diyanet takviminden dinî bayram günleri (tarih → ad). */
export function officialReligiousDays(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const event of OFFICIAL_CALENDAR.events) {
    if (event.kind !== "dini") continue;
    for (const day of eventDays(event)) out[day] = event.label;
  }
  return out;
}

/** MEB çalışma takvimindeki okul tatilleri (ara tatil, yarıyıl): o gün okul yok. */
export function schoolBreakOn(isoDate: string): string | null {
  for (const event of OFFICIAL_CALENDAR.events) {
    if (event.kind !== "meb" || event.starts === event.ends) continue;
    if (isoDate >= event.starts && isoDate <= event.ends) return event.label;
  }
  return null;
}

export type OfficialExamDate = { id: string; label: string; date: string; exam: string; sourceUrl: string | null };

/** Bugünden sonraki resmî merkezî sınavlar (ÖSYM, LGS), tarih sırasıyla. */
export function upcomingOfficialExams(todayIso: string, limit = 12): OfficialExamDate[] {
  return OFFICIAL_CALENDAR.events
    .filter((event) => event.kind === "sinav" && event.starts > todayIso)
    .sort((a, b) => a.starts.localeCompare(b.starts) || a.label.localeCompare(b.label, "tr"))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      label: event.label,
      date: event.starts,
      exam: event.exam ?? event.label,
      sourceUrl: OFFICIAL_CALENDAR.sources[event.sourceId]?.url ?? null,
    }));
}

/** Tarih resmî bir merkezî sınav günüyse o sınav(lar)ın adı. */
export function officialExamOn(isoDate: string): string | null {
  const names = OFFICIAL_CALENDAR.events
    .filter((event) => event.kind === "sinav" && isoDate >= event.starts && isoDate <= event.ends)
    .map((event) => event.label);
  return names.length ? names.join(" / ") : null;
}

/** Sihirbazda seçilen sınav türünün resmî sınav kodları (2 Kasım 2026: tarih adımı tüm sınavları sıralıyordu). */
const TRACK_EXAMS: Record<string, readonly string[]> = {
  tyt: ["TYT"],
  ayt: ["AYT", "YDT"],
  yks: ["TYT", "AYT", "YDT"],
  kpss: ["KPSS"],
  tus: ["TUS"],
  lgs: ["LGS"],
  ales: ["ALES"],
  uni: [],
};

/**
 * Tarih adımında gösterilecek resmî sınavlar: sınav türü seçildiyse yalnız onunkiler (vize/final için hiçbiri),
 * seçilmediyse yaklaşan hepsi.
 */
export function officialExamsForTrack(todayIso: string, track: string | null | undefined, limit = 8): OfficialExamDate[] {
  const codes = track ? TRACK_EXAMS[track] : undefined;
  if (!codes) return upcomingOfficialExams(todayIso, limit);
  if (!codes.length) return [];
  return upcomingOfficialExams(todayIso, 200)
    .filter((exam) => codes.includes(exam.exam))
    .slice(0, limit);
}
