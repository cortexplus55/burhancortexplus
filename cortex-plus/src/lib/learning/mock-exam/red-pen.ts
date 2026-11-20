/**
 * Kırmızı Kalemli Hoca (Faz 7, 20 Kasım 2026): yazılı / kâğıttan denemenin açık uçlu sorusunda puanın nereden geldiği
 * (yeşil) ve nerede kırıldığı (kırmızı kalem). Model çağrısı yok: yalnız notlandırmanın zaten ürettiği veriden —
 * ölçütlerin karşılanıp karşılanmadığı ve puanları, satır satır karar (`work-steps.ts`), puan notu (kısmi puan,
 * tavan, çelişki) ve verilen puan.
 *
 * Kurallar (bekçi: `kirmizi-kalem.test.ts`):
 *   - Kırmızı satırların toplamı tam olarak (en yüksek − verilen) puandır; yeşil satırların toplamı verilen puandır.
 *   - Uydurma kesinti yok: kırmızı satır yalnız karşılanmamış bir ölçüte ya da notlandırmanın kendi uyguladığı
 *     sınıra (puan notu: yalnız sonuç, çelişen sonuç, çelişen tarih) bağlanır.
 *   - Sınır yoksa yeşil satırlar tam puanı alan ölçütlerdir. Sınır varsa karşılanmış ölçütler verilen puanı
 *     puanları oranında paylaşır (sınırın nedeni tek kırmızı satırda; hiçbir ölçüt suçlu seçilmez).
 *   - Kısmi puan (adım ya da kurulum) yeşilde tek satırdır ve karşılanmamış ölçütleri rubrik sırasıyla doldurur:
 *     çözüm sırayla ilerler, kırık son adımlardadır.
 *   - Puanlar binde birlik tam sayılarla hesaplanır; kesirli puanda toplam yuvarlamayla kaymaz.
 * Saf modül: istemci de okur (inceleme sayfası kayıttaki alanları `parseRedPen` ile doğrular).
 */

import {
  BARE_RESULT_NOTE,
  DATE_CONFLICT_NOTE,
  RESULT_CONFLICT_NOTE,
  SHORT_SOLUTION_FULL_CREDIT,
} from "@/lib/learning/mock-exam/score-notes";
import { firstErrorSentence, firstErrorSummary, type WorkStepVerdict } from "@/lib/learning/mock-exam/work-steps";

export type DeductionAlert = { step: string; lostPoints: number; teacherNote: string };
export type RedPen = { earnedStepNotes: string[]; deductionAlerts: DeductionAlert[] };

export type RedPenCriterion = {
  criterion: string;
  points: number;
  met: boolean;
  /** Öğrenci bu noktayı açıkça yanlış söyledi (open-grade `wrong`). */
  contradicted?: boolean;
};

export const RED_PEN_TITLE = "Kırmızı Kalemli Hoca";
export const RED_PEN_DEDUCTION_LEAD = "Hoca buradan kırar:";

const STEP_MAX_CHARS = 160;
const NOTE_MAX_CHARS = 220;

export const RED_PEN_NOTES = {
  blankStep: "Cevap",
  blank: "Soru boş bırakıldı; boş cevaba puan verilmez.",
  contradicted: "Bu noktayı yanlış yazdın; yanlış bilgiye puan verilmez.",
  missing: "Kâğıdında bu nokta yok; yazılmayan adıma puan verilmez.",
  partial: "Bu noktayı yarım bıraktın; puanın kalanı buradan gitti.",
  generalStep: "Çözümün geneli",
  capFallback: "Notlandırma bu çözümün puanını sınırladı.",
  stepCredit: "Doğru kurduğun adımlar (kısmi puan)",
} as const;

/** Tavanın hangi kısma ait olduğu (puan notu sabitleri `score-notes.ts`te). */
const CAP_STEP: Record<string, string> = {
  [BARE_RESULT_NOTE]: "Yöntem",
  [RESULT_CONFLICT_NOTE]: "Sonuç",
  [DATE_CONFLICT_NOTE]: "Tarih",
};

const milli = (value: number) => (Number.isFinite(value) ? Math.round(value * 1000) : 0);
const fromMilli = (value: number) => value / 1000;

function clampText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Baş harf büyük, sonda tek nokta. */
function sentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
  if (!clean) return "";
  return `${clean.charAt(0).toLocaleUpperCase("tr-TR")}${clean.slice(1)}.`;
}

/** "5", "2,5", "1,25": Türkçe ondalık, en çok iki basamak. */
export function formatRedPenPoints(points: number): string {
  const rounded = Math.round(points * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export function earnedNote(points: number, text: string): string {
  return `+${formatRedPenPoints(points)} Puan · ${clampText(text, STEP_MAX_CHARS)}`;
}

const EARNED_RE = /^\+([0-9]+(?:,[0-9]{1,2})?) Puan · ([\s\S]+)$/;

/** Yeşil satır: "+N Puan · …" → puan ve metin; biçim dışıysa yalnız metin. */
export function splitEarnedNote(note: string): { points: string | null; text: string } {
  const match = note.match(EARNED_RE);
  return match ? { points: match[1]!, text: match[2]!.trim() } : { points: null, text: note.trim() };
}

/** Puan notunun ";" öncesi (kazanılan kısım) ve sonrası (kırık kısım). */
function splitScoreNote(note: string | undefined): { credit: string | null; fault: string | null } {
  const clean = note?.trim();
  if (!clean) return { credit: null, fault: null };
  const at = clean.indexOf(";");
  if (at < 0) return { credit: clean, fault: null };
  return { credit: clean.slice(0, at).trim() || null, fault: clean.slice(at + 1).trim() || null };
}

/** `budget` milli puanı `weights` oranında dağıtır (en büyük kalan yöntemi); toplam tam olarak `budget`. */
function apportion(budget: number, weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (budget <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (budget * weight) / total);
  const out = raw.map((value) => Math.floor(value));
  let rest = budget - out.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (const { index } of order) {
    if (rest <= 0) break;
    out[index]! += 1;
    rest -= 1;
  }
  return out;
}

/**
 * Bir açık uçlu sorunun yeşil ve kırmızı satırları. `awarded` notlandırmanın verdiği son puandır (kısmi puan, tavan
 * ve tam puan kuralları uygulanmış); tam puan kuralı çalıştıysa çağıran bütün ölçütleri `met: true` verir.
 */
export function deriveRedPen(input: {
  maxPoints: number;
  awarded: number;
  criteria: readonly RedPenCriterion[];
  steps?: readonly WorkStepVerdict[];
  scoreNote?: string;
  blank?: boolean;
}): RedPen {
  const maxM = Math.max(0, milli(input.maxPoints));
  const awardedM = Math.min(maxM, Math.max(0, milli(input.awarded)));
  const lostM = maxM - awardedM;

  if (input.blank) {
    return {
      earnedStepNotes: [],
      deductionAlerts: lostM > 0 ? [{ step: RED_PEN_NOTES.blankStep, lostPoints: fromMilli(lostM), teacherNote: RED_PEN_NOTES.blank }] : [],
    };
  }

  const rows = input.criteria
    .map((row) => ({ ...row, criterion: row.criterion.trim(), m: Math.max(0, milli(row.points)) }))
    .filter((row) => row.criterion && row.m > 0);
  const met = rows.filter((row) => row.met);
  const missed = rows.filter((row) => !row.met);
  const metM = met.reduce((sum, row) => sum + row.m, 0);
  const note = input.scoreNote?.trim() || undefined;
  const parts = splitScoreNote(note === SHORT_SOLUTION_FULL_CREDIT ? undefined : note);

  const earnedStepNotes: string[] = [];
  const deductionAlerts: DeductionAlert[] = [];

  // Yeşil: karşılanmış ölçütler. Tavan yoksa her biri tam puanıyla; tavan varsa verilen puanı oranla paylaşırlar.
  const capM = Math.max(0, metM - awardedM);
  const shares = capM > 0 ? apportion(awardedM, met.map((row) => row.m)) : met.map((row) => row.m);
  met.forEach((row, index) => {
    if (shares[index]! > 0) earnedStepNotes.push(earnedNote(fromMilli(shares[index]!), row.criterion));
  });
  if (capM > 0) {
    deductionAlerts.push({
      step: note && CAP_STEP[note] ? CAP_STEP[note]! : RED_PEN_NOTES.generalStep,
      lostPoints: fromMilli(capM),
      teacherNote: clampText(note ? sentence(note) : RED_PEN_NOTES.capFallback, NOTE_MAX_CHARS),
    });
  }

  // Kısmi puan: yeşilde tek satır; karşılanmamış ölçütleri rubrik sırasıyla doldurur.
  let surplusM = Math.max(0, awardedM - metM);
  if (surplusM > 0) {
    earnedStepNotes.push(earnedNote(fromMilli(surplusM), parts.credit ? sentence(parts.credit).replace(/\.$/, "") : RED_PEN_NOTES.stepCredit));
  }
  const credited = missed.map((row) => {
    const take = Math.min(row.m, surplusM);
    surplusM -= take;
    return take;
  });

  // Kırmızı: karşılanmamış ölçütlerin kalan puanı. İlk kırık satırın nedeni (satır cümlesi ya da puan notunun kırık
  // kısmı) ilk kırmızı ölçüte yazılır; açıkça yanlış söylenen ölçüt kendi notunu taşır.
  const error = input.steps?.length ? firstErrorSummary(input.steps) : null;
  let reason: string | null = error ? firstErrorSentence(error) : parts.fault ? sentence(parts.fault) : null;
  missed.forEach((row, index) => {
    const lost = row.m - credited[index]!;
    if (lost <= 0) return;
    let teacherNote: string;
    if (row.contradicted) teacherNote = RED_PEN_NOTES.contradicted;
    else if (reason) {
      teacherNote = reason;
      reason = null;
    } else teacherNote = credited[index]! > 0 ? RED_PEN_NOTES.partial : RED_PEN_NOTES.missing;
    deductionAlerts.push({
      step: clampText(row.criterion, STEP_MAX_CHARS),
      lostPoints: fromMilli(lost),
      teacherNote: clampText(teacherNote, NOTE_MAX_CHARS),
    });
  });

  // Ölçüt puanları en yüksek puanı tutmuyorsa (puansız ya da eksik rubrik) kalan fark tek satırda; toplam yine tutar.
  const shownM = deductionAlerts.reduce((sum, row) => sum + milli(row.lostPoints), 0);
  if (lostM > shownM) {
    deductionAlerts.push({
      step: RED_PEN_NOTES.generalStep,
      lostPoints: fromMilli(lostM - shownM),
      teacherNote: clampText(reason ?? (note && note !== SHORT_SOLUTION_FULL_CREDIT ? sentence(note) : RED_PEN_NOTES.capFallback), NOTE_MAX_CHARS),
    });
  }
  return { earnedStepNotes, deductionAlerts };
}

/** Kayıttaki (`feedback`) alanlar; eski kayıtta ya da bozuk veride null (blok çizilmez). */
export function parseRedPen(raw: unknown): RedPen | null {
  const row = raw && typeof raw === "object" ? (raw as { earnedStepNotes?: unknown; deductionAlerts?: unknown }) : null;
  if (!row || (!Array.isArray(row.earnedStepNotes) && !Array.isArray(row.deductionAlerts))) return null;
  const earnedStepNotes = Array.isArray(row.earnedStepNotes)
    ? row.earnedStepNotes
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => clampText(item, STEP_MAX_CHARS + 24))
    : [];
  const deductionAlerts = Array.isArray(row.deductionAlerts)
    ? row.deductionAlerts.flatMap((item) => {
        const cell = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
        const step = typeof cell?.step === "string" ? clampText(cell.step, STEP_MAX_CHARS) : "";
        const teacherNote = typeof cell?.teacherNote === "string" ? clampText(cell.teacherNote, NOTE_MAX_CHARS) : "";
        const lostPoints = typeof cell?.lostPoints === "number" && Number.isFinite(cell.lostPoints) ? cell.lostPoints : 0;
        return step && teacherNote && lostPoints > 0 ? [{ step, lostPoints, teacherNote }] : [];
      })
    : [];
  return earnedStepNotes.length || deductionAlerts.length ? { earnedStepNotes, deductionAlerts } : null;
}
