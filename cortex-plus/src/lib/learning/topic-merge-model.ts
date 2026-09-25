import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { missingColumn } from "@/lib/learning/missing-column";
import {
  type AmbiguousTopicPair,
  type MergedTopic,
  applySameDecisions,
  mergePairKey,
} from "@/lib/learning/topic-merge";

const decisionSchema = z.object({
  pairs: z
    .array(
      z.object({
        key: z.string().min(3).max(240),
        same: z.boolean(),
      }),
    )
    .max(12),
});

function hashKey(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}

/**
 * Gri bölgedeki başlık çiftleri.
 *
 * Yazım eşleşmesi yettiyse bu fonksiyon çağrılmaz. Önbellekte duran çift
 * yeniden sorulmaz. Tablo yoksa model de çağrılmaz; iki başlık ayrı kalır.
 */
export async function resolveAmbiguousMerges(
  service: SupabaseClient,
  userId: string,
  topics: MergedTopic[],
  ambiguous: AmbiguousTopicPair[],
): Promise<MergedTopic[]> {
  if (!ambiguous.length) return topics;
  const keys = [...new Set(ambiguous.map((pair) => pair.key))].slice(0, 12);
  const cached = await service.from("topic_merge_cache").select("pair_key, same").in("pair_key", keys);
  if (cached.error) return topics;

  const known = new Map(
    (cached.data ?? []).map((row) => [row.pair_key as string, Boolean(row.same)]),
  );
  const pending = ambiguous.filter((pair) => !known.has(pair.key)).slice(0, 8);
  if (pending.length) {
    const outcome = await generateJson({
      service,
      userId,
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: await isPremiumUser(service, userId),
      verificationMode: "schema",
      maxDraftAttempts: 1,
      idempotencyKey: `topic-merge:${hashKey(pending.map((pair) => pair.key).sort().join("|"))}`,
      schemaHint:
        'JSON: {"pairs":[{"key":string,"same":boolean}]}. same true yalnızca aynı ders konusuysa. Alt başlık ile üst başlık aynı değildir. Emin değilsen same false.',
      userPrompt: [
        "Bu başlık çiftleri aynı ders konusu mu? Konu düşürme. Emin değilsen same false.",
        ...pending.map((pair) => `key=${pair.key} | "${pair.left}" | "${pair.right}"`),
      ].join("\n"),
      parse: (raw) => {
        const parsed = decisionSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      },
    });
    if (outcome.ok) {
      const rows = outcome.data.pairs
        .filter((pair) => keys.includes(pair.key) || pending.some((item) => item.key === pair.key))
        .map((pair) => ({ pair_key: pair.key, same: pair.same }));
      if (rows.length) {
        const saved = await service.from("topic_merge_cache").upsert(rows);
        if (saved.error && !missingColumn(saved.error)) {
          console.error("topic merge cache", saved.error.message);
        }
        for (const row of rows) known.set(row.pair_key, row.same);
      }
    }
  }

  const sameKeys = new Set(
    [...known.entries()].filter(([, same]) => same).map(([key]) => key),
  );
  for (const pair of ambiguous) {
    if (known.get(pair.key) === true) sameKeys.add(mergePairKey(pair.left, pair.right));
  }
  return applySameDecisions(topics, sameKeys);
}
