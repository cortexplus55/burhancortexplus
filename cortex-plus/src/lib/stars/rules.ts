/**
 * Yıldızlar (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi).
 *
 * Astra'nın "Nasıl yıldız kazanılır" listesi canlıdan okundu: sınava hazırlık 10–210,
 * okul maçı 30–130, haftalık seri 100, arkadaş daveti 100 + 50, hazırlığında yeni öğrenci
 * 50, günlük hedef 25 (günde 50 yıldız), günlük bulmaca 20, öğretmenle sohbet 15,
 * arkadaşın abone olsun 300. Bizde okul maçı ve bulmaca yok; okul maçının yerine düello
 * sayılır. Bonusların (günlük hedef, seri, davet) hesabı veritabanında: `award_stars`.
 */

export type StarSource =
  | "prep"
  | "duel"
  | "chat"
  | "daily_goal"
  | "weekly_streak"
  | "invite"
  | "invite_welcome"
  | "invite_subscribed"
  | "prep_joined";

/** Günlük yıldız hedefi; üst çubukta "bugün N · hedef 50". Tavan değildir, kazanç kesilmez. */
export const DAILY_STAR_GOAL = 50;

/** Sıralama bu kadar kişi yıldız kazanınca başlar; o zamana dek geçen haftanın kazananları. */
export const LEADERBOARD_MIN_PEOPLE = 3;

/** "İlk 20 arasına girmek için N yıldız". */
export const LEADERBOARD_TOP = 20;

const EXAM_KINDS = new Set(["written_exam", "readiness"]);
// Son kontrol test formülünde (25 Ekim 2026, P1-7): 3 soruluk kontrol deneme formülüyle +38 veriyordu.
const QUIZ_KINDS = new Set(["quiz", "true_false", "gaps", "focused", "spaced", "final_check"]);

/** Skor çarpanı olmayan adımların sabit yıldızı: yol kartı, ders çubuğu ve ödül aynı sayıyı yazar. */
export const LEARNING_STEP_STARS = 10;

/**
 * Bir hazırlık etkinliğinin yıldızı (Astra: "Dersler, testler, deneme sınavları 10–210").
 * Test 10 + doğru başına 2 (en çok 40); deneme 30 + doğru başına 4 (en çok 210). Ders, kartlar, sözlü,
 * soru-cevap gibi öğrenme adımları skor çarpanı olmadan tabanı alır (25 Ekim 2026, P1-7: kart +10 yazıp sonuç
 * +17 veriyordu). `score` doğru sayısıdır; yüzde verilmez.
 */
export function prepStars(kind: string, score: number | null | undefined, total: number | null | undefined): number {
  const correct = Math.max(0, Math.floor(Number(score ?? 0)));
  const count = Math.max(0, Math.floor(Number(total ?? 0)));
  const scored = count > 0 ? Math.min(correct, count) : correct;
  if (EXAM_KINDS.has(kind)) return Math.min(210, 30 + 4 * scored);
  if (QUIZ_KINDS.has(kind)) return Math.min(40, 10 + 2 * scored);
  // Podcast sabit 20 (20 Ekim 2026, ürün sahibinin kararı): dinleme kontrolünü atlayan (1/1) cevaplayandan
  // (2/3 → 17) fazla kazanmasın; kontrol yıldızı değiştirmez.
  if (kind === "podcast") return 20;
  return LEARNING_STEP_STARS;
}

/**
 * Hazırlık etkinliğinin yıldız anahtarı (30 Ekim 2026, canlı tur). Yıldız her denemenin kimliğiyle yazılıyordu; "Tekrar
 * incele" ve "Dersi tekrarla" her seferinde yeni deneme açtığı için aynı ders dakikada bir +10 veriyordu (sıralama
 * şişebiliyordu). Kayıtlı içeriğin tekrarı (`reviewed` / `replayed`) düğüm başına günde bir kez sayılır; yeni yazılan
 * içerik eskisi gibi deneme başına.
 */
export function prepStarRef(input: { attemptId: string; nodeId: string; payload: unknown; day: string }): string {
  const row = input.payload && typeof input.payload === "object" ? (input.payload as Record<string, unknown>) : {};
  if (row.reviewed === true || row.replayed === true) return `review:${input.nodeId}:${input.day}`;
  return `attempt:${input.attemptId}`;
}

/** Düello (Astra'daki okul maçının yeri): oynamak 30, doğru başına 10, en çok 130. */
export function duelStars(correct: number | null | undefined): number {
  return Math.min(130, 30 + 10 * Math.max(0, Math.floor(Number(correct ?? 0))));
}

/** Öğretmenle sohbet: günde bir kez, üçüncü mesajdan sonra. */
export const CHAT_STARS = 15;
export const CHAT_STARS_AFTER_MESSAGES = 3;

/** Hazırlığına okuldan biri katılınca sahibine. */
export const PREP_JOINED_STARS = 50;

/** Davet ettiğin arkadaş abone olunca. */
export const INVITE_SUBSCRIBED_STARS = 300;

/** "Nasıl yıldız kazanılır" — sıra ve sayılar Astra'daki gibi; metin bizim. */
export const STAR_RULES: { source: StarSource | "invite_pair"; title: string; detail: string; amount: string }[] = [
  { source: "invite_subscribed", title: "Arkadaşın abone olsun", detail: "Davet ettiğin arkadaşın abone olduğunda", amount: "300" },
  { source: "prep", title: "Sınava hazırlık", detail: "Dersler, testler, deneme sınavları", amount: "10–210" },
  { source: "duel", title: "Düello", detail: "Arkadaşınla aynı soruları çöz", amount: "30–130" },
  { source: "weekly_streak", title: "Haftalık seri", detail: "Haftanın 5 gününde günlük hedefe ulaş", amount: "100" },
  { source: "invite_pair", title: "Arkadaşını davet et", detail: "3 ayrı günde yıldız kazandığında", amount: "100 + 50" },
  { source: "prep_joined", title: "Hazırlığına yeni öğrenci", detail: "Biri okulda paylaştığın hazırlığa katıldığında", amount: "50" },
  { source: "daily_goal", title: "Günlük yıldız hedefi", detail: `Bir günde ${DAILY_STAR_GOAL} yıldız kazan`, amount: "25" },
  { source: "chat", title: "Öğretmenle sohbet", detail: "Günde bir kez, 3 mesajdan sonra", amount: "15" },
];

/** "Yıldızlarını nereden kazandın" satırının adı. */
export const STAR_SOURCE_LABEL: Record<StarSource, string> = {
  prep: "Sınava hazırlık",
  duel: "Düello",
  chat: "Öğretmenle sohbet",
  daily_goal: "Günlük yıldız hedefi",
  weekly_streak: "Haftalık seri",
  invite: "Arkadaşını davet et",
  invite_welcome: "Davetle katılma",
  invite_subscribed: "Arkadaşın abone oldu",
  prep_joined: "Hazırlığına yeni öğrenci",
};
