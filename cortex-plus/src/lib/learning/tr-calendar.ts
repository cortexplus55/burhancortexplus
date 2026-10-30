/**
 * Takvimin Türkiye bilgisi (28 Ekim 2026): resmî tatiller ve ara sınav tarihleri.
 *
 * Plan 29 Ekim'e, 1 Ocak'a ve bayramlara da tam günlük yük koyuyordu; dönem içi vize ya da quiz
 * tarihi ise hiç görülmüyordu, öğrenci ara sınava yolun ortasında hazırlıksız giriyordu. Tatil
 * "esnek gün" olur (yükün yarısı komşu günlere kayar), ara sınavın bir gün öncesine "Ara Deneme /
 * Kontrol" adımı konur. Tarihler yalnız belgenin ya da öğrencinin kendi takviminden okunur.
 */

export const HOLIDAY_BADGE = "🇹🇷 Resmî Tatil (Esnek Gün)";

/** Esnek günün günlük bütçe payı: yükün yarısı komşu günlere kayar. */
export const HOLIDAY_LOAD_SHARE = 0.5;

const FIXED_HOLIDAYS: Record<string, string> = {
  "01-01": "Yılbaşı",
  "04-23": "Ulusal Egemenlik ve Çocuk Bayramı",
  "05-01": "Emek ve Dayanışma Günü",
  "05-19": "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
  "07-15": "Demokrasi ve Millî Birlik Günü",
  "08-30": "Zafer Bayramı",
  "10-29": "Cumhuriyet Bayramı",
};

/**
 * Dinî bayramlar (Diyanet takvimi; arife yarım gün, burada esnek gün sayılır). Tablo 2027 sonuna
 * kadar doğrulandı; sonraki yıllar Diyanet takvimi açıklanınca eklenir — eksik yıl, sabit tatilleri
 * bozmaz.
 */
const RELIGIOUS_HOLIDAYS: Record<string, string> = {
  "2026-03-19": "Ramazan Bayramı arifesi",
  "2026-03-20": "Ramazan Bayramı",
  "2026-03-21": "Ramazan Bayramı",
  "2026-03-22": "Ramazan Bayramı",
  "2026-05-26": "Kurban Bayramı arifesi",
  "2026-05-27": "Kurban Bayramı",
  "2026-05-28": "Kurban Bayramı",
  "2026-05-29": "Kurban Bayramı",
  "2026-05-30": "Kurban Bayramı",
  "2027-03-08": "Ramazan Bayramı arifesi",
  "2027-03-09": "Ramazan Bayramı",
  "2027-03-10": "Ramazan Bayramı",
  "2027-03-11": "Ramazan Bayramı",
  "2027-05-15": "Kurban Bayramı arifesi",
  "2027-05-16": "Kurban Bayramı",
  "2027-05-17": "Kurban Bayramı",
  "2027-05-18": "Kurban Bayramı",
  "2027-05-19": "Kurban Bayramı",
};

/** O günün resmî tatili (YYYY-MM-DD); yoksa null. */
export function turkishHolidayOn(isoDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  return RELIGIOUS_HOLIDAYS[isoDate] ?? FIXED_HOLIDAYS[isoDate.slice(5)] ?? null;
}

function nextIsoDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export type HolidayRun = { start: string; end: string; name: string };

/** Planın en çok bu kadar günü taranır (≈3 yıl); bozuk tarih sonsuz döngü kurmasın. */
const HOLIDAY_SCAN_LIMIT = 1100;

/**
 * İki gün arasındaki (ikisi de dahil) resmî tatiller, art arda aynı bayramın günleri tek satırda
 * (30 Ekim 2026, Paket I). Arife bayramın ilk gününe katılır: "15–19 May Kurban Bayramı". Uzun planda
 * yolun bir düğümü tatile düşmese de öğrenci Nisan–Haziran tatillerini planda görsün diye. Dinî bayram
 * tablosu olmayan yılda yalnız sabit tatiller gelir (sessizce).
 */
export function holidayRunsBetween(fromIso: string, toIso: string): HolidayRun[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso) || fromIso > toIso) return [];
  const runs: HolidayRun[] = [];
  let day = fromIso;
  for (let guard = 0; day <= toIso && guard < HOLIDAY_SCAN_LIMIT; guard += 1) {
    const raw = turkishHolidayOn(day);
    if (raw) {
      const name = raw.replace(/\s+arifesi$/u, "");
      const last = runs[runs.length - 1];
      if (last && last.name === name && nextIsoDay(last.end) === day) last.end = day;
      else runs.push({ start: day, end: day, name });
    }
    day = nextIsoDay(day);
  }
  return runs;
}

export type ScheduleCheckpoint = {
  /** Ara sınavın günü, YYYY-MM-DD. */
  date: string;
  /** "Vize", "Quiz", "Ara sınav" … öğrencinin ya da belgenin kendi adı. */
  label: string;
};

/**
 * Ara sınav sözcükleri: vize, ara sınav, quiz, kısa sınav, deneme/kontrol sınavı, midterm. Türkçe ek
 * alabilir ("vizesi", "quizi", "ara sınavı"); sözcük başı harf olmayan bir yerden başlar ("revize" değil).
 */
const CHECKPOINT_WORD =
  /(?:^|[^\p{L}])(vize\p{L}*(?:\s+sınav\p{L}*)?|ara\s*sınav\p{L}*|midterm\p{L}*|quiz\p{L}*|kısa\s+sınav\p{L}*|deneme\s+sınav\p{L}*|kontrol\s+sınav\p{L}*|ara\s+değerlendirme\p{L}*)/iu;

/** Sözcüğün satırdaki yeri (önündeki ayırıcı hariç). */
function wordStart(match: RegExpExecArray): number {
  return match.index + match[0].length - match[1]!.length;
}

const MONTHS: Record<string, number> = {
  ocak: 1, şubat: 2, subat: 2, mart: 3, nisan: 4, mayıs: 5, mayis: 5, haziran: 6,
  temmuz: 7, ağustos: 8, agustos: 8, eylül: 9, eylul: 9, ekim: 10, kasım: 11, kasim: 11, aralık: 12, aralik: 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Bir metin parçasındaki ilk tarih: "12.11.2026", "12/11", "12 Kasım 2026", "12 Kasım". Yılsız tarih `from`a göre ileriye. */
function firstDate(text: string, from: string): string | null {
  const fromYear = Number(from.slice(0, 4));
  const resolve = (day: number, month: number, year?: number) => {
    if (year) return iso(year < 100 ? 2000 + year : year, month, day);
    const same = iso(fromYear, month, day);
    return same && same >= from ? same : iso(fromYear + 1, month, day);
  };
  const numeric = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/u.exec(text);
  const named = /\b(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(\d{4}))?/iu.exec(text);
  const candidates = [
    numeric ? { at: numeric.index, value: resolve(Number(numeric[1]), Number(numeric[2]), numeric[3] ? Number(numeric[3]) : undefined) } : null,
    named
      ? { at: named.index, value: resolve(Number(named[1]), MONTHS[named[2]!.toLocaleLowerCase("tr")]!, named[3] ? Number(named[3]) : undefined) }
      : null,
  ].filter((entry): entry is { at: number; value: string | null } => Boolean(entry?.value));
  candidates.sort((a, b) => a.at - b.at);
  return candidates[0]?.value ?? null;
}

function labelOf(word: string): string {
  const folded = word.toLocaleLowerCase("tr").replace(/\s+/g, " ");
  if (folded.startsWith("vize")) return "Vize";
  if (folded.startsWith("ara değer")) return "Ara değerlendirme";
  if (folded.startsWith("midterm") || folded.startsWith("ara")) return "Ara sınav";
  if (folded.startsWith("quiz") || folded.startsWith("kısa")) return "Quiz";
  if (folded.startsWith("deneme")) return "Deneme sınavı";
  return "Ara değerlendirme";
}

/**
 * Belgedeki ara sınav tarihleri (ders izlencesi, duyuru sayfası). Yalnız aynı satırda sözcük ve tarih
 * birlikte geçiyorsa; sınav gününden önceki ve `from`dan sonraki günler. Aynı gün bir kez.
 */
export function detectCheckpointDates(
  text: string,
  window: { from: string; examDate: string },
): ScheduleCheckpoint[] {
  const found = new Map<string, ScheduleCheckpoint>();
  for (const line of (text ?? "").split(/\n+/)) {
    const word = CHECKPOINT_WORD.exec(line);
    if (!word) continue;
    // Tarih sözcükten sonra ya da hemen önce: "Vize: 12 Kasım", "12.11.2026 Quiz 2".
    const date = firstDate(line.slice(wordStart(word)), window.from) ?? firstDate(line, window.from);
    if (!date || date <= window.from || date >= window.examDate) continue;
    if (!found.has(date)) found.set(date, { date, label: labelOf(word[1]!) });
  }
  return [...found.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Öğrencinin Takvimim'e eklediği etkinliklerden ara sınavlar (başlıkta vize/quiz/ara sınav …). */
export function checkpointsFromEvents(
  events: readonly { title: string; event_date: string }[],
  window: { from: string; examDate: string },
): ScheduleCheckpoint[] {
  const found = new Map<string, ScheduleCheckpoint>();
  for (const event of events) {
    const word = CHECKPOINT_WORD.exec(event.title ?? "");
    const date = (event.event_date ?? "").slice(0, 10);
    if (!word || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date <= window.from || date >= window.examDate) continue;
    if (!found.has(date)) found.set(date, { date, label: event.title.trim().slice(0, 60) || labelOf(word[1]!) });
  }
  return [...found.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** İki kaynağı birleştirir; aynı gün bir kez (öğrencinin adı önce). */
export function mergeCheckpoints(...lists: readonly ScheduleCheckpoint[][]): ScheduleCheckpoint[] {
  const out = new Map<string, ScheduleCheckpoint>();
  for (const list of lists) for (const item of list) if (!out.has(item.date)) out.set(item.date, item);
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}
