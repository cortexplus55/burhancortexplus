import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { Solution } from "@/lib/solve/question-solver";
import type { StoredReviewItem } from "@/lib/learning/review-items";

/*
  Çözülen soruyu hazırlığın tekrar listesine eklemek (23 Ekim 2026). Tekrar satırı doğru cevabı taşır ve cevap sunucuda
  notlanır; öğrenci anahtarı değiştirebilsin istemiyoruz. Bu yüzden soru sunucuda çözümden kurulur, imzalanır ve
  tarayıcıya yalnız imzalı belirteç gider; ekleme ucu imzayı ve sahibini doğrular. Yalnız şıklı soru (tek doğru)
  ve iki çözümün anlaştığı cevap eklenir: "Emin değiliz" çözümü tekrar listesine girmez.
*/

const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_TOKEN = 24_000;

function secret(): string | null {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

function sign(body: string, key: string): string {
  return createHmac("sha256", key).update(`solve-review:${body}`).digest("base64url");
}

/** Şıklı, doğru şıkkı belli çözümden tekrar sorusu; değilse null. */
export function solutionReviewItem(solution: Solution): StoredReviewItem | null {
  if (solution.kind !== "mcq" || solution.options.length < 2) return null;
  const correct = solution.options.find((o) => o.letter === solution.answer.letter);
  if (!correct?.text.trim() || !solution.question.trim()) return null;
  const texts = solution.options.map((o) => o.text.trim());
  if (new Set(texts).size !== texts.length) return null;
  const optionWhy: Record<string, string> = {};
  for (const why of solution.optionsWhy) {
    const text = solution.options.find((o) => o.letter === why.letter)?.text.trim();
    if (text && why.why.trim()) optionWhy[text] = why.why.trim();
  }
  const explanation = [solution.steps.map((s) => s.say).filter(Boolean).join(" "), solution.tip]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1200);
  return {
    mode: "choice",
    prompt: solution.question.trim().slice(0, 1500),
    options: texts,
    correct: [correct.text.trim()],
    multi: false,
    ...(explanation ? { explanation } : {}),
    ...(Object.keys(optionWhy).length ? { optionWhy } : {}),
  };
}

export function signReviewToken(input: { userId: string; ref: string; item: StoredReviewItem; now?: number }): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(
    JSON.stringify({ u: input.userId, r: input.ref, i: input.item, t: (input.now ?? Date.now()) + TTL_MS }),
  ).toString("base64url");
  const token = `${body}.${sign(body, key)}`;
  return token.length <= MAX_TOKEN ? token : null;
}

export function verifyReviewToken(
  token: string,
  userId: string,
  now = Date.now(),
): { ref: string; item: StoredReviewItem } | null {
  const key = secret();
  if (!key || token.length > MAX_TOKEN) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      u?: string;
      r?: string;
      i?: StoredReviewItem;
      t?: number;
    };
    if (parsed.u !== userId || typeof parsed.r !== "string" || !parsed.i || typeof parsed.t !== "number" || parsed.t < now) {
      return null;
    }
    return { ref: parsed.r, item: parsed.i };
  } catch {
    return null;
  }
}
