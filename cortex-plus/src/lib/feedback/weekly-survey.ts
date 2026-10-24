import { z } from "zod";

/**
 * Haftalık kısa anket (19 Ekim 2026, kapalı beta; ürün sahibinin kararı: "Uygulama içi haftalık
 * kısa anket"). Dört soru, haftada en çok bir kez, yalnız o hafta çalışan öğrenciye; cevaplar
 * `/admin/anket`te. Tablo: göç `20261019170000_weekly_surveys.sql`.
 *
 * Bu dosya istemci ve sunucuda ortak: hafta anahtarı, sorular, doğrulama, özet hesabı.
 */

export const SURVEY_FLAG = "weekly_survey";
/** Yeni hesaba ilk günlerde sorulmaz: önce ürünü görsün. */
export const SURVEY_MIN_ACCOUNT_DAYS = 2;
/** "O hafta çalıştı": son yedi günde en az bir etkinlik açtı. */
export const SURVEY_ACTIVITY_DAYS = 7;
export const SURVEY_IMPROVE_MAX = 600;

export const SURVEY_COPY = {
  title: "Haftalık 1 dakikalık soru",
  intro: "Cortex Plus'ı senin cevaplarınla geliştiriyoruz. Haftada bir kez sorarız.",
  helpfulness: "Bu hafta Cortex Plus sınavına hazırlanmana ne kadar yardımcı oldu?",
  helpfulnessEnds: ["Hiç", "Çok"] as const,
  recommend: "Bir arkadaşına önerme olasılığın ne kadar?",
  recommendEnds: ["Hiç önermem", "Kesinlikle öneririm"] as const,
  mostUsed: "Bu hafta en çok neyi kullandın?",
  improve: "Bir şeyi değiştirebilseydin ne olurdu? (isteğe bağlı)",
  submit: "Gönder",
  dismiss: "Şimdi değil",
  thanks: "Teşekkürler! Cevabın ekibe ulaştı.",
} as const;

export const MOST_USED_OPTIONS = [
  { id: "lesson", label: "Ders" },
  { id: "quiz", label: "Test" },
  { id: "podcast", label: "Podcast" },
  { id: "cards", label: "Kartlar" },
  { id: "chat", label: "Sohbet" },
  { id: "video", label: "Video ders" },
  { id: "written_exam", label: "Yazılı deneme" },
  { id: "other", label: "Diğer" },
] as const;

export type MostUsed = (typeof MOST_USED_OPTIONS)[number]["id"];
export type SurveySegment = "free" | "plus" | "sigma" | "beta";

export const surveyAnswerSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss") }),
  z.object({
    action: z.literal("answer"),
    helpfulness: z.number().int().min(1).max(5),
    recommend: z.number().int().min(0).max(10),
    mostUsed: z.enum(MOST_USED_OPTIONS.map((option) => option.id) as [MostUsed, ...MostUsed[]]).nullable().optional(),
    improve: z.string().trim().max(SURVEY_IMPROVE_MAX).nullable().optional(),
  }),
]);

export type SurveyAnswer = z.infer<typeof surveyAnswerSchema>;

/** İstanbul saatiyle ISO hafta (ücretsiz ders sayacı da aynı anahtarı kullanır). */
export { isoWeekKey } from "@/lib/istanbul-day";

export type SurveyRow = {
  week_key: string;
  dismissed: boolean;
  helpfulness: number | null;
  recommend: number | null;
  most_used: string | null;
};

export type WeekSummary = {
  week: string;
  answers: number;
  dismissed: number;
  /** 1-5 ortalaması, bir ondalık. */
  helpfulness: number | null;
  /** Net tavsiye puanı: (9-10 verenler − 0-6 verenler) / cevap × 100. */
  nps: number | null;
  mostUsed: { id: string; label: string; count: number }[];
};

const MOST_USED_LABEL: Record<string, string> = Object.fromEntries(MOST_USED_OPTIONS.map((option) => [option.id, option.label]));

export function summarizeWeeks(rows: SurveyRow[]): WeekSummary[] {
  const byWeek = new Map<string, SurveyRow[]>();
  for (const row of rows) {
    const list = byWeek.get(row.week_key) ?? [];
    list.push(row);
    byWeek.set(row.week_key, list);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([week, list]) => {
      const answered = list.filter((row) => !row.dismissed && row.helpfulness !== null && row.recommend !== null);
      const helpfulness = answered.length
        ? Math.round((answered.reduce((sum, row) => sum + (row.helpfulness ?? 0), 0) / answered.length) * 10) / 10
        : null;
      const promoters = answered.filter((row) => (row.recommend ?? 0) >= 9).length;
      const detractors = answered.filter((row) => (row.recommend ?? 0) <= 6).length;
      const counts = new Map<string, number>();
      for (const row of answered) if (row.most_used) counts.set(row.most_used, (counts.get(row.most_used) ?? 0) + 1);
      return {
        week,
        answers: answered.length,
        dismissed: list.filter((row) => row.dismissed).length,
        helpfulness,
        nps: answered.length ? Math.round(((promoters - detractors) / answered.length) * 100) : null,
        mostUsed: [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([id, count]) => ({ id, label: MOST_USED_LABEL[id] ?? id, count })),
      };
    });
}

export function mostUsedLabel(id: string | null | undefined): string {
  return id ? (MOST_USED_LABEL[id] ?? id) : "—";
}
