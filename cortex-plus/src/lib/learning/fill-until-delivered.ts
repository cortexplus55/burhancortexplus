/**
 * Paralel dalgalarla söz verilen sayıya kadar doldurur.
 *
 * Bir dalga: eksik konular `parallelism` kadar birlikte, saat dalga başına bir kez ilerler.
 * Boş dönüş, fırlatma ya da kapıdan geçmeyen öğe modeli bir basamak kaydırır ve dalga sürer.
 * Süre dolunca eldeki geçerli öğeler durur; kısa liste yayımlanmaz.
 */

import { sameTopic, selectDeliverable, type DeliveryItem, type DeliverySlot } from "@/lib/learning/deliverable";
import { acceptedItems, publishReady } from "@/lib/learning/exam-assembly";
import {
  replaceShortSlots,
  tallyDrafts,
  topicSlotKey,
  type MockExamWaveReport,
} from "@/lib/learning/mock-exam/topup";

export type FillClock = {
  now: () => number;
  advance: (ms: number) => void;
};

export type FillRequest = {
  topicId: string | null;
  topicLabel: string;
  slots: DeliverySlot[];
  modelIndex: number;
  /** Kabul edilmiş kökler. Sıradaki soru başka alt başlık ya da açı olsun. */
  avoid?: string[];
  /** Dalga tavanından sonra: eksik sayı, tür serbest (çoktan seçmeli yer). */
  relaxed?: boolean;
};

const realClock = (): FillClock => ({
  now: () => Date.now(),
  advance: () => undefined,
});

function topicKey(slot: DeliverySlot): string {
  return topicSlotKey(slot);
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
  /** Son dalgada yeni kabul görmeyen konular. Parça parça süren iş bunu saklar. */
  stalled?: readonly string[];
  onTopicAttempt?: (label: string, wave: number) => void;
  /** Bu çağrıdan önce biten dalga sayısı. Parça parça istek bunu saklar. */
  initialWave?: number;
  /** Dalga bitince: kabul, ret, delik. Soru metni yok. */
  onWave?: (report: MockExamWaveReport) => void;
  /**
   * Söz verilen sayı dolmadan çağrı bitsin diye: plana sığmayan dalgadan sonra
   * eksik konular hemen, daha küçük bir grupla yeniden istenir.
   */
  followUpWaves?: number;
  /** Mutlak dalga tavanı. Dolunca bir kez zorlamalı doldurma, sonra durur. */
  waveCap?: number;
  /** Duvar saati. `startedAt` ile birlikte; aşılınca normal dalga açılmaz. */
  budgetMs?: number;
  startedAt?: number;
  /** Zorlamalı doldurma bu kâğıtta denendi. İkinci kez açılmaz. */
  forced?: boolean;
}): Promise<{
  items: T[];
  ok: boolean;
  waves: number;
  /** Bu çağrı dahil biten dalga sayısı. Sıradaki parça bunu saklar. */
  completedWave: number;
  /** Kapının kullandığı slotlar. Eksik yer kabul görmüş konuya kaydıysa özgün plandan ayrılır. */
  slots: DeliverySlot[];
  elapsedMs: number;
  note: null;
  coverage: string[];
  modelIndex: number;
  modelIndexes: Record<string, number>;
  stalled: string[];
  forced: boolean;
}> {
  const clock = input.clock ?? realClock();
  const started = clock.now();
  const maxWaves = input.maxWaves ?? 4;
  const followUpWaves = input.followUpWaves ?? 4;
  const parallelism = Math.max(1, input.parallelism ?? 8);
  let ceiling = maxWaves;
  const waveMs = input.waveMs ?? 0;
  let items: T[] = [...(input.prior ?? [])];
  const modelByTopic = new Map<string, number>(Object.entries(input.modelIndexes ?? {}));
  const stallByTopic = new Set<string>(input.stalled ?? []);
  let waves = 0;
  let completed = input.initialWave ?? 0;
  let working: DeliverySlot[] = input.slots.map((slot) => ({ ...slot }));
  let highestModel = 0;
  const blockedDonors = () =>
    [...modelByTopic.entries()].filter(([, index]) => index >= 2).map(([key]) => key);
  const stalledTopics = () => [...stallByTopic];
  const waveCap = input.waveCap;
  const origin = input.startedAt ?? started;
  let forced = input.forced === true;
  const room = () => (waveCap == null ? Number.POSITIVE_INFINITY : Math.max(0, waveCap - (input.initialWave ?? 0)));
  const clampCeiling = (value: number) => Math.min(value, room());
  ceiling = clampCeiling(ceiling);
  const overBudget = () => input.budgetMs != null && clock.now() - origin >= input.budgetMs;
  const capped = () => waveCap != null && completed >= waveCap;
  const avoidFor = (slots: readonly DeliverySlot[]) => {
    const texts = items
      .map((item) => input.read(item))
      .filter((view) => slots.some((slot) => sameTopic(view, slot)))
      .map((view) => view.text.trim())
      .filter(Boolean);
    return texts.slice(-20);
  };
  const reportWave = (planReplacement: boolean, promised: number) => {
    const tally = tallyDrafts(working, items, input.read);
    input.onWave?.({
      wave: completed,
      accepted: tally.accepted,
      rejected: tally.rejected,
      reasons: tally.reasons,
      shortfall: tally.shortfall,
      promised,
      replacement: planReplacement,
    });
  };
  const readyPaper = () => publishReady(input.slots, items, input.read);
  const finish = (ok: boolean, publishable: T[] | null, fitted: DeliverySlot[] | null) => {
    const verdict = selectDeliverable(fitted ?? working, items, input.read);
    const paper = ok ? readyPaper() : { ok: false as const, items: [] as T[], slots: working };
    const published = ok && paper.ok ? paper : null;
    return {
      items: published ? published.items : ok && publishable ? publishable : verdict.ok ? verdict.publishable : verdict.delivered,
      ok: Boolean(published) || ok || verdict.ok,
      waves,
      completedWave: completed,
      slots: published ? published.slots : fitted ?? working,
      elapsedMs: clock.now() - started,
      note: null as null,
      coverage: published
        ? published.slots.map((slot) => slot.signature).filter((signature): signature is string => Boolean(signature))
        : verdict.coverage,
      modelIndex: Math.max(highestModel, ...modelByTopic.values(), 0),
      modelIndexes: Object.fromEntries(modelByTopic),
      stalled: [...stallByTopic],
      forced,
    };
  };

  const forceFill = async () => {
    if (forced || input.signal?.aborted) return;
    forced = true;
    if (readyPaper().ok) return;
    // Her konunun eksiği kendi konusundan, tür serbest (Paket A): delik başka konunun sorusuyla dolmaz.
    const accepted = acceptedItems(input.slots, items, input.read).map((row) => row.view);
    const short = groupDeficits(input.slots)
      .map((group) => {
        const have = accepted.filter((view) => sameTopic(view, group[0]!)).length;
        return { group, missing: group.length - have };
      })
      .filter((row) => row.missing > 0);
    if (!short.length) return;
    const parts = await Promise.all(
      short.map(async ({ group, missing }) => {
        const host = group[0]!;
        const relaxed: DeliverySlot[] = Array.from({ length: missing }, () => ({
          topicId: host.topicId ?? null,
          topicLabel: host.topicLabel,
          type: "mcq",
          points: 4,
        }));
        try {
          return await input.generate({
            topicId: host.topicId ?? null,
            topicLabel: host.topicLabel,
            slots: relaxed,
            modelIndex: modelByTopic.get(topicKey(host)) ?? 0,
            avoid: avoidFor(group),
            relaxed: true,
          });
        } catch {
          // Zorlama düşerse dalga açılmaz. Kısa liste yine yayımlanmaz.
          return [] as T[];
        }
      }),
    );
    for (const part of parts) items = [...items, ...part];
  };

  for (; waves < ceiling; ) {
    const paper = readyPaper();
    if (paper.ok) return finish(true, paper.items, paper.slots);
    if (capped() || overBudget()) break;
    const plan = replaceShortSlots(input.slots, items, input.read, completed, blockedDonors(), stalledTopics());
    working = plan.slots;
    const verdict = selectDeliverable(working, items, input.read);
    if (verdict.ok) {
      if (plan.replacement) reportWave(true, working.length);
      return finish(true, verdict.publishable, working);
    }
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
          const before = selectDeliverable(working, items, input.read);
          const beforeFilled = working.length - before.deficits.filter((slot) => topicKey(slot) === key).length;
          try {
            const generated = await input.generate({
              topicId: slots[0]?.topicId ?? null,
              topicLabel: label,
              slots,
              modelIndex,
              avoid: avoidFor(slots),
            });
            const after = selectDeliverable(working, [...items, ...generated], input.read);
            const afterMissing = after.deficits.filter((slot) => topicKey(slot) === key).length;
            const afterFilled = working.length - afterMissing;
            if (!generated.length || afterFilled <= beforeFilled) {
              modelByTopic.set(key, modelIndex + 1);
              stallByTopic.add(key);
            } else {
              stallByTopic.delete(key);
            }
            return generated;
          } catch {
            modelByTopic.set(key, modelIndex + 1);
            stallByTopic.add(key);
            return [] as T[];
          }
        }),
      );
      for (const part of parts) items = [...items, ...part];
    }
    completed += 1;
    reportWave(plan.replacement, working.length);
    if (!input.signal?.aborted) clock.advance(waveMs);
    if (waves >= maxWaves && ceiling === maxWaves && !readyPaper().ok) {
      ceiling = clampCeiling(maxWaves + followUpWaves);
    }
    if (readyPaper().ok) return finish(true, null, null);
  }

  if (readyPaper().ok) return finish(true, null, null);
  if (!input.signal?.aborted && (capped() || overBudget())) {
    await forceFill();
  }
  if (readyPaper().ok) return finish(true, null, null);
  return finish(false, null, null);
}
