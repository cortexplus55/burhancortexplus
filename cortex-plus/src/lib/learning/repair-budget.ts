/**
 * Öğretmen motorlarının düzeltme bütçesi (25 Ekim 2026, canlı test P1-1).
 *
 * Canlıda konu testi 1,5–5 dk sürdü: öğrenci beklerken de önceden yazımın bütçesi kullanılıyordu
 * (iki düzeltme turu, 200 sn; ikinci taslak 150 sn'ye kadar). Öğrenci bekliyorsa tek düzeltme turu,
 * yeni tur 40 sn'den sonra başlamaz; sorunlu öğeler tek toplu çağrı yerine en çok dört grup hâlinde
 * aynı anda düzeltilir ve denetlenir (her grup yalnız kendi öğelerini görür, çıktı kısa kalır).
 * Önceden yazım eski bütçeyle çalışır: öğrenci beklemiyor, toplu çağrı daha ucuz.
 */
export const STUDENT_FIX_DEADLINE_MS = 40_000;
export const STUDENT_FIX_ROUNDS = 1;
export const STUDENT_SECOND_PASS_DEADLINE_MS = 60_000;
export const REPAIR_CONCURRENCY = 4;

export const BACKGROUND_FIX_DEADLINE_MS = 200_000;
export const BACKGROUND_FIX_ROUNDS = 2;
export const BACKGROUND_SECOND_PASS_DEADLINE_MS = 150_000;

export type RepairBudget = {
  deadlineMs: number;
  maxFixRounds: number;
  secondPassDeadlineMs: number;
  fixConcurrency: number;
};

export function repairBudget(urgent: boolean | undefined): RepairBudget {
  return urgent
    ? {
        deadlineMs: STUDENT_FIX_DEADLINE_MS,
        maxFixRounds: STUDENT_FIX_ROUNDS,
        secondPassDeadlineMs: STUDENT_SECOND_PASS_DEADLINE_MS,
        fixConcurrency: REPAIR_CONCURRENCY,
      }
    : {
        deadlineMs: BACKGROUND_FIX_DEADLINE_MS,
        maxFixRounds: BACKGROUND_FIX_ROUNDS,
        secondPassDeadlineMs: BACKGROUND_SECOND_PASS_DEADLINE_MS,
        fixConcurrency: 1,
      };
}

/** Sırayı koruyan ardışık gruplar; grup sayısı en çok `concurrency`. */
export function repairGroups<T>(items: readonly T[], concurrency: number): T[][] {
  const groups = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  if (groups <= 1) return items.length ? [[...items]] : [];
  const size = Math.ceil(items.length / groups);
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}
