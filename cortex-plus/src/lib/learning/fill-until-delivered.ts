/**
 * Paralel dalgalarla söz verilen sayıya kadar doldurur.
 *
 * Bir dalga: eksik konular `parallelism` kadar birlikte, saat dalga başına bir kez ilerler.
 * Boş dönüş, fırlatma ya da kapıdan geçmeyen öğe modeli bir basamak kaydırır ve dalga sürer.
 * Süre dolunca eldeki geçerli öğeler durur; kısa liste yayımlanmaz.
 */

import { selectDeliverable, type DeliveryItem, type DeliverySlot } from "@/lib/learning/deliverable";

export type FillClock = {
  now: () => number;
  advance: (ms: number) => void;
};

export type FillRequest = {
  topicId: string | null;
  topicLabel: string;
  slots: DeliverySlot[];
  modelIndex: number;
};

const realClock = (): FillClock => ({
  now: () => Date.now(),
  advance: () => undefined,
});

function topicKey(slot: DeliverySlot): string {
  return `${slot.topicId ?? ""}::${slot.topicLabel}`;
}

function groupDeficits(slots: readonly DeliverySlot[]): DeliverySlot[][] {
  const map = new Map<string, DeliverySlot[]>();
  for (const slot of slots) {
    const key = topicKey(slot);
    const list = map.get(key) ?? [];
    list.push(slot);
    map.set(key, list);
  }
  return [...map.values()];
}

export async function fillUntilDelivered<T>(input: {
  slots: readonly DeliverySlot[];
  prior?: readonly T[];
  generate: (request: FillRequest) => Promise<T[]>;
  read: (item: T) => DeliveryItem;
  maxWaves?: number;
  parallelism?: number;
  waveMs?: number;
  clock?: FillClock;
  /** İstek düşünce sonraki konu başlamasın. */
  signal?: AbortSignal;
  /** Konu anahtarı → denenen model basamağı. Parça parça süren iş bunu saklar. */
  modelIndexes?: Record<string, number>;
  onTopicAttempt?: (label: string, wave: number) => void;
}): Promise<{
  items: T[];
  ok: boolean;
  waves: number;
  elapsedMs: number;
  note: null;
  coverage: string[];
  modelIndex: number;
  modelIndexes: Record<string, number>;
}> {
  const clock = input.clock ?? realClock();
  const started = clock.now();
  const maxWaves = input.maxWaves ?? 4;
  const parallelism = Math.max(1, input.parallelism ?? 8);
  const waveMs = input.waveMs ?? 0;
  let items: T[] = [...(input.prior ?? [])];
  const modelByTopic = new Map<string, number>(Object.entries(input.modelIndexes ?? {}));
  let waves = 0;
  let highestModel = 0;
  const finish = (ok: boolean, publishable: T[] | null) => {
    const verdict = selectDeliverable(input.slots, items, input.read);
    return {
      items: ok && publishable ? publishable : verdict.ok ? verdict.publishable : verdict.delivered,
      ok: ok || verdict.ok,
      waves,
      elapsedMs: clock.now() - started,
      note: null as null,
      coverage: verdict.coverage,
      modelIndex: Math.max(highestModel, ...modelByTopic.values(), 0),
      modelIndexes: Object.fromEntries(modelByTopic),
    };
  };

  for (; waves < maxWaves; ) {
    const verdict = selectDeliverable(input.slots, items, input.read);
    if (verdict.ok) return finish(true, verdict.publishable);
    if (input.signal?.aborted) break;
    waves += 1;
    const groups = groupDeficits(verdict.deficits);
    for (let index = 0; index < groups.length; index += parallelism) {
      if (input.signal?.aborted) break;
      const batch = groups.slice(index, index + parallelism);
      const parts = await Promise.all(
        batch.map(async (slots) => {
          const label = slots[0]?.topicLabel ?? "";
          const key = topicKey(slots[0] ?? { topicLabel: label, type: "" });
          const modelIndex = modelByTopic.get(key) ?? 0;
          highestModel = Math.max(highestModel, modelIndex);
          input.onTopicAttempt?.(label, waves);
          const before = selectDeliverable(input.slots, items, input.read);
          const beforeFilled = input.slots.length - before.deficits.filter((slot) => topicKey(slot) === key).length;
          try {
            const generated = await input.generate({
              topicId: slots[0]?.topicId ?? null,
              topicLabel: label,
              slots,
              modelIndex,
            });
            const after = selectDeliverable(input.slots, [...items, ...generated], input.read);
            const afterMissing = after.deficits.filter((slot) => topicKey(slot) === key).length;
            const afterFilled = input.slots.length - afterMissing;
            if (!generated.length || afterFilled <= beforeFilled) modelByTopic.set(key, modelIndex + 1);
            return generated;
          } catch {
            modelByTopic.set(key, modelIndex + 1);
            return [] as T[];
          }
        }),
      );
      for (const part of parts) items = [...items, ...part];
    }
    if (!input.signal?.aborted) clock.advance(waveMs);
  }

  return finish(false, null);
}
