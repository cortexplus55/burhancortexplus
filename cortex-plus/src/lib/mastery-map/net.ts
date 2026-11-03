/**
 * Tahmini Sınav Neti + "+Net getirecek 3 konu" (Paket 4). Saf ve deterministik; model çağrısı yok.
 *
 * - Kazanım ustalığı Beta(α, β) ortalaması (outcome_mastery). Yanıtsız kazanım önsel Beta(1,1) ile girer
 *   (ortalama 0,5, geniş aralık); bu yüzden sonuç her zaman "tahmini" ve aralıklı gösterilir (±1,28 sd ≈ %80).
 * - Resmî yanlış kuralı: LGS 3 yanlış 1 doğruyu, ÖSYM sınavları (YKS, KPSS, ALES, DGS, TUS, DUS) 4 yanlış 1 doğruyu
 *   götürür; YDS'de yanlış doğruyu götürmez. Soru başı beklenen net = p − (1 − p) / k (k = kural; YDS'de p).
 *   Emin olmayan öğrenci boş bırakabileceği için soru başı net 0'ın altına inmez.
 * - Soru ağırlığı: dersin resmî soru sayısı (examStructures) dersin hazırlıktaki kazanımlarına eşit bölünür
 *   (resmî ünite dağılımı yayımlanmadığı için tahmin).
 * - Toplam yanıt < 3 → "Henüz yeterli veri yok".
 * - +Net: ünitenin kazanımları %85 ustalığa çıksa kazanılacak net; en büyük 3 ünite.
 */
import { masteryValue, type MasteryState } from "@/lib/level-check/mastery";

export const NET_MIN_RESPONSES = 3;
export const NET_TARGET_MASTERY = 0.85;
export const NET_NO_DATA = "Henüz yeterli veri yok";

/** Resmî yanlış kuralı: kaç yanlış bir doğruyu götürür (0 = götürmez). */
export function wrongRule(exam: string): number {
  if (exam === "LGS") return 3;
  if (exam === "YDS") return 0;
  return 4;
}

export function netPerQuestion(p: number, rule: number): number {
  const v = rule > 0 ? p - (1 - p) / rule : p;
  return Math.max(0, v);
}

export type NetOutcome = { state: MasteryState };
export type NetUnit = { unitId: string; title: string; subjectKey: string; outcomes: NetOutcome[] };
export type NetSubject = { key: string; exam: string; questionCount: number };

export type NetEstimate =
  | { status: "no_data"; responses: number }
  /** Resmî ders soru sayısı yok (ör. KPSS alt dersleri): net hesaplanmaz, yalnız ustalık kazancına göre +3 konu. */
  | { status: "no_count"; responses: number; top: { unitId: string; title: string; gain: number }[] }
  | {
      status: "ok";
      responses: number;
      net: number;
      low: number;
      high: number;
      maxNet: number;
      top: { unitId: string; title: string; gain: number }[];
    };

function betaSd(s: MasteryState): number {
  const a = s.alpha;
  const b = s.beta;
  return Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function estimateNet(units: NetUnit[], subjects: NetSubject[]): NetEstimate {
  const responses = units.reduce((n, u) => n + u.outcomes.reduce((m, o) => m + (o.state.n || 0), 0), 0);
  if (responses < NET_MIN_RESPONSES) return { status: "no_data", responses };
  const bySubject = new Map(subjects.map((s) => [s.key, s]));
  const outcomeCount = new Map<string, number>();
  for (const u of units) if (bySubject.has(u.subjectKey)) outcomeCount.set(u.subjectKey, (outcomeCount.get(u.subjectKey) ?? 0) + u.outcomes.length);
  let net = 0;
  let low = 0;
  let high = 0;
  let maxNet = 0;
  const gains: { unitId: string; title: string; gain: number }[] = [];
  for (const u of units) {
    const subject = bySubject.get(u.subjectKey);
    const count = outcomeCount.get(u.subjectKey) ?? 0;
    if (!subject || !count) continue;
    const w = subject.questionCount / count;
    const rule = wrongRule(subject.exam);
    let gain = 0;
    for (const o of u.outcomes) {
      const p = masteryValue(o.state);
      const sd = betaSd(o.state);
      net += w * netPerQuestion(p, rule);
      low += w * netPerQuestion(Math.max(0, p - 1.28 * sd), rule);
      high += w * netPerQuestion(Math.min(1, p + 1.28 * sd), rule);
      maxNet += w;
      if (p < NET_TARGET_MASTERY) gain += w * (netPerQuestion(NET_TARGET_MASTERY, rule) - netPerQuestion(p, rule));
    }
    if (gain > 0) gains.push({ unitId: u.unitId, title: u.title, gain: r1(gain) });
  }
  if (maxNet <= 0) return { status: "no_data", responses };
  gains.sort((a, b) => b.gain - a.gain);
  return { status: "ok", responses, net: r1(net), low: r1(low), high: r1(high), maxNet: Math.round(maxNet), top: gains.filter((g) => g.gain >= 0.1).slice(0, 3) };
}

/**
 * Soru sayısı bilinmeyen dersler için: net uydurmadan, ünitenin kazanımları %85'e çıksa kazanılacak
 * ustalık puanı (kazanım başına 0–100) ile en büyük 3 ünite. Yanıt < 3 → no_data.
 */
export function estimateGainOnly(units: NetUnit[]): NetEstimate {
  const responses = units.reduce((n, u) => n + u.outcomes.reduce((m, o) => m + (o.state.n || 0), 0), 0);
  if (responses < NET_MIN_RESPONSES) return { status: "no_data", responses };
  const gains = units
    .map((u) => {
      const gain = u.outcomes.reduce((g, o) => g + Math.max(0, NET_TARGET_MASTERY - masteryValue(o.state)), 0);
      return { unitId: u.unitId, title: u.title, gain: Math.round(gain * 100) };
    })
    .filter((g) => g.gain >= 1)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 3);
  return { status: "no_count", responses, top: gains };
}
