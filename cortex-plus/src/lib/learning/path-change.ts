/**
 * Sonuca göre yol (20 Ekim 2026, ürün sahibinin kararı: kendiliğinden). Puanlı bir adım bitince yol
 * kendini ayarlar ve öğrenciye bir satırla söylenir. Karar saf (bu dosya); veritabanı işi
 * `adaptive-path.ts`'te.
 */

/** Bunun altı: konunun odaklı pratiği hemen sıradaki adım olur. */
export const ADAPT_LOW_PCT = 50;
/** Bu ve üstü: konunun kalan ek testleri yoldan çıkar. */
export const ADAPT_HIGH_PCT = 90;
/** Daha az soruluk sonuç karar vermeye yetmez (ders içi 1-4 soru gibi). */
export const ADAPT_MIN_ITEMS = 3;
/** Puanı konu hâkimiyetine kanıt olan adımlar; odaklı pratiğin kendisi tetiklemez (döngü olmasın). */
export const ADAPTIVE_KINDS: ReadonlySet<string> = new Set(["quiz", "true_false", "oral", "qa"]);

export type PathChange =
  | { kind: "added"; topic: string }
  | { kind: "skipped"; topic: string; count: number };

export function pathDecision(input: { kind: string; score: number; total: number }): "low" | "high" | null {
  if (!ADAPTIVE_KINDS.has(input.kind) || input.total < ADAPT_MIN_ITEMS) return null;
  const pct = (input.score / input.total) * 100;
  if (pct < ADAPT_LOW_PCT) return "low";
  if (pct >= ADAPT_HIGH_PCT) return "high";
  return null;
}

export function pathChangeLine(change: PathChange): string {
  return change.kind === "added"
    ? `Bu konuda zorlandın: sıradaki adım "${change.topic}" için odaklı pratik.`
    : `Bu konuyu iyi biliyorsun: "${change.topic}" için ${change.count} ek testi yoldan çıkardık.`;
}

export function parsePathChange(raw: unknown): PathChange | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const topic = typeof row.topic === "string" ? row.topic.trim() : "";
  if (!topic) return null;
  if (row.kind === "added") return { kind: "added", topic };
  if (row.kind === "skipped" && typeof row.count === "number" && row.count > 0) {
    return { kind: "skipped", topic, count: row.count };
  }
  return null;
}

export type PathNodeRow = {
  id: string;
  kind: string;
  status: string;
  sortOrder: number;
  sessionMeta: Record<string, unknown> | null;
};

function normalized(text: unknown): string {
  return typeof text === "string" ? text.trim().toLocaleLowerCase("tr") : "";
}

/** Aynı konunun düğümü mü: kimlik varsa kimlikle, yoksa konu adıyla. */
export function sameTopic(meta: Record<string, unknown> | null, topic: { topicId?: string | null; topicTitle?: string | null }): boolean {
  if (!meta) return false;
  if (topic.topicId && typeof meta.topicId === "string") return meta.topicId === topic.topicId;
  const title = normalized(topic.topicTitle);
  return Boolean(title) && normalized(meta.topicTitle) === title;
}

/**
 * Yüksek sonuçta yoldan çıkacak ek testler: konunun bu adımdan sonraki, bitmemiş, denemesi olmayan
 * konu testleri — ama konunun en az bir testi bitmiş olmalı (her konunun bir testi kalır).
 */
export function extraPracticeToSkip(
  nodes: readonly PathNodeRow[],
  current: { id: string; kind: string; sortOrder: number },
  topic: { topicId?: string | null; topicTitle?: string | null },
  attempted: ReadonlySet<string>,
): string[] {
  const topicQuizzes = nodes.filter((node) => node.kind === "quiz" && sameTopic(node.sessionMeta, topic));
  const quizDone = current.kind === "quiz" || topicQuizzes.some((node) => node.status === "done");
  if (!quizDone) return [];
  return topicQuizzes
    .filter((node) => node.id !== current.id && node.sortOrder > current.sortOrder && node.status !== "done" && !attempted.has(node.id))
    .map((node) => node.id);
}

/** Uyarlamalı odaklı pratik yalnız düşük sonuç alınan konudan kurulur. */
export function adaptiveFocusTopic(kind: string, sessionMeta: unknown, topicLabel: string): string | null {
  if (kind !== "focused" || !sessionMeta || typeof sessionMeta !== "object") return null;
  const meta = sessionMeta as Record<string, unknown>;
  if (meta.adaptive !== "low") return null;
  return (typeof meta.topicTitle === "string" && meta.topicTitle.trim()) || topicLabel.trim() || null;
}

/** Bu konu için bekleyen (bitmemiş) uyarlamalı odaklı pratik zaten var mı. */
export function hasPendingAdaptivePractice(
  nodes: readonly PathNodeRow[],
  topic: { topicId?: string | null; topicTitle?: string | null },
): boolean {
  return nodes.some(
    (node) => node.kind === "focused" && node.status !== "done" && node.sessionMeta?.adaptive === "low" && sameTopic(node.sessionMeta, topic),
  );
}
