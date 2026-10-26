/**
 * Konu testini paralel parçalara böler. Duvar saati bir parçanın süresi kadar
 * ilerler; parçalar art arda koşarsa süre parça sayısıyla çarpılır.
 */
import type { FillClock } from "@/lib/learning/fill-until-delivered";

export const TOPIC_TEST_SHARD_PARALLELISM = 5;

export function topicTestShardCounts(count: number, parallelism = TOPIC_TEST_SHARD_PARALLELISM): number[] {
  const safe = Math.max(0, Math.floor(count));
  const width = Math.max(1, Math.min(Math.floor(parallelism) || 1, safe || 1));
  if (safe === 0) return [];
  if (width <= 1) return [safe];
  const base = Math.floor(safe / width);
  const extra = safe % width;
  return Array.from({ length: width }, (_, index) => base + (index < extra ? 1 : 0)).filter((part) => part > 0);
}

const realClock = (): FillClock => ({ now: () => Date.now(), advance: () => undefined });

export async function runTopicTestShards<T>(input: {
  count: number;
  parallelism?: number;
  clock?: FillClock;
  /** Sahte saat: paralel dalga bir kez ilerler. */
  waveMs?: number;
  runShard: (count: number, index: number, shards: number) => Promise<T[]>;
}): Promise<{ questions: T[]; elapsedMs: number; maxInflight: number; shards: number }> {
  const counts = topicTestShardCounts(input.count, input.parallelism);
  const clock = input.clock ?? realClock();
  const started = clock.now();
  let inflight = 0;
  let maxInflight = 0;
  const parts = await Promise.all(
    counts.map(async (count, index) => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      try {
        return await input.runShard(count, index, counts.length);
      } finally {
        inflight -= 1;
      }
    }),
  );
  if (input.waveMs) clock.advance(input.waveMs);
  return {
    questions: parts.flat(),
    elapsedMs: clock.now() - started,
    maxInflight,
    shards: counts.length,
  };
}
