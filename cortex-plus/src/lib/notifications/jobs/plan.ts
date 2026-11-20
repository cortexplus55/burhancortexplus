import { STUDY_SLOTS, inSlot, type IstanbulClock, type StudyHour } from "@/lib/notifications/schedule";

/**
 * Bu dilimde hangi işler koşar (saf; Faz 6, 20 Kasım 2026). Sıra önceliktir: aynı gün önce giden yaşam döngüsü
 * e-postası 24 saat kuralıyla sonrakini engeller, bu yüzden ciroyu koruyan ve zamana bağlı olanlar önce koşar.
 *
 *  18:30  plan bitişi (3 gün / 24 saat) → sınav arifesi (48 / 24 saat)
 *  19:00  etkinleştirme (kayıttan 24 saat) → Pazar: haftalık karne
 *  19:30  1. konu bitti (yalnız kampanya izni + anahtar)
 *  Öğrencinin saati (18:30 / 19:00 / 20:00 / 21:00): açık sınav tuzağı → günlük hatırlatma
 *  Davet, hediye ve hoş geldin telafisi günde bir kez, 19:00 diliminde.
 */
export type PlannedJob =
  | { kind: "expiry" }
  | { kind: "exam_eve" }
  | { kind: "activation" }
  | { kind: "weekly" }
  | { kind: "free_first_unit" }
  | { kind: "smart_trap"; studyHour: StudyHour }
  | { kind: "daily_reminders"; studyHour: StudyHour; dailyMails: boolean };

export function jobsForSlot(clock: Pick<IstanbulClock, "hour" | "minute" | "weekday">): PlannedJob[] {
  const jobs: PlannedJob[] = [];
  if (inSlot(clock, 18, 30)) jobs.push({ kind: "expiry" }, { kind: "exam_eve" });
  if (inSlot(clock, 19, 0)) {
    jobs.push({ kind: "activation" });
    if (clock.weekday === 7) jobs.push({ kind: "weekly" });
  }
  if (inSlot(clock, 19, 30)) jobs.push({ kind: "free_first_unit" });
  for (const slot of STUDY_SLOTS) {
    if (!inSlot(clock, slot.hour, slot.minute as 0 | 30)) continue;
    jobs.push({ kind: "smart_trap", studyHour: slot.hour });
    jobs.push({ kind: "daily_reminders", studyHour: slot.hour, dailyMails: slot.hour === 19 });
  }
  return jobs;
}
