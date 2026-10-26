/**
 * Yazılı denemenin eksik slotu (26 Ekim 2026).
 *
 * Kâğıt, planlanan her yer dolmadan yayımlanmıyor. Listenin sonundaki çok
 * cevaplı ve açık uçlu yerler, modeli tek cevaplı çoktan seçmeli döndürünce
 * boş kalıyor; geçersiz ve kopya sorular da kendi konusunda delik bırakıyor.
 * Toparlama aynı konuya aynı türü sordukça delik kapanmıyor, ekran "bütün
 * konular hazır" deyip süre dolunca "Yeniden dene" çıkarıyor. Hiç soru
 * yazılmıyor çünkü kısa kâğıt reddediliyor.
 *
 * İki dalgadan sonra delik kâğıdın yarısını geçmiyorsa, o dalgada yeni soru
 * kabul etmeyen konuların yeri, kabul edilmiş sorusu olan konulara kayar.
 * İlerleyen konu yerini korur: eksik konular daha küçük grupla yeniden
 * istenir. Sayı söz verilen sayıda kalır. Delik büyükse iki dalga daha aynı
 * konu denenir, sonra yine bu konulara geçilir; boş kâğıtta (hiç kabul yok)
 * yer değiştirilmez.
 */

import {
  sameTopic,
  selectDeliverable,
  semanticDuplicate,
  type DeliveryItem,
  type DeliverySlot,
} from "@/lib/learning/deliverable";
import { itemValidity, validityKind } from "@/lib/learning/item-validity";

/** Bu kadar dalga aynı slotu denedikten sonra yer, kabul görmüş konuya kayar. */
export const REPLACEMENT_AFTER_WAVES = 2;
/** Delik hâlâ büyükse bu kadar dalgadan sonra da kayar; süre dolana kadar dönülmez. */
export const REPLACEMENT_FORCE_AFTER_WAVES = REPLACEMENT_AFTER_WAVES + 2;

export type MockExamWaveReport = {
  wave: number;
  accepted: number;
  rejected: number;
  reasons: Record<string, number>;
  shortfall: number;
  promised: number;
  replacement: boolean;
};

export function topicSlotKey(slot: { topicId?: string | null; topicLabel: string }): string {
  return `${slot.topicId ?? ""}::${slot.topicLabel}`;
}

function deliveryTypeOk(itemType: string, slotType: string): boolean {
  const open = new Set(["open", "short_answer"]);
  if (open.has(slotType)) return open.has(itemType);
  if (slotType === "card" || slotType === "flashcard") return itemType === "card" || itemType === "flashcard";
  return itemType === slotType;
}

/** Delik, söz verilen sayının en çok yarısı (en az 4). 20 soruda 10. */
export function shortfallIsSmall(shortfall: number, promised: number): boolean {
  if (shortfall <= 0 || promised <= 0) return false;
  return shortfall <= Math.max(4, Math.ceil(promised * 0.5));
}

function bump(reasons: Record<string, number>, key: string): void {
  reasons[key] = (reasons[key] ?? 0) + 1;
}

/**
 * Taslakları kapıya göre sayar. `rejected` slota giremeyenlerdir; fazla ama
 * geçerli taslak reddedilmez. Sebep kodları soru metni içermez.
 */
export function tallyDrafts<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
): { accepted: number; rejected: number; shortfall: number; reasons: Record<string, number> } {
  const reasons: Record<string, number> = {};
  let rejected = 0;
  const pool: DeliveryItem[] = [];
  for (const raw of drafts) {
    const view = read(raw);
    const validity = itemValidity({
      kind: validityKind(view.type),
      text: view.text,
      options: view.options,
      correct: view.correctAnswers,
      material: view.material,
      payload: [view.text, view.explanation ?? "", view.sourceLabel ?? "", ...(view.options ?? []), ...(view.correctAnswers ?? [])].join("\n"),
    });
    if (!validity.ok) {
      rejected += 1;
      bump(reasons, "invalid");
      for (const issue of validity.issues) bump(reasons, `invalid:${issue}`);
      continue;
    }
    if (view.sourceLabel !== undefined && !view.sourceLabel.trim()) {
      rejected += 1;
      bump(reasons, "empty_source");
      continue;
    }
    const topicSlots = slots.filter((slot) => sameTopic(view, slot));
    if (!topicSlots.length) {
      rejected += 1;
      bump(reasons, "off_topic");
      continue;
    }
    const typed = topicSlots.filter((slot) => deliveryTypeOk(view.type, slot.type));
    if (!typed.length) {
      rejected += 1;
      bump(reasons, "type_mismatch");
      continue;
    }
    if (pool.some((kept) => semanticDuplicate(kept, view))) {
      rejected += 1;
      bump(reasons, "duplicate");
      continue;
    }
    pool.push(view);
  }
  const gate = selectDeliverable(slots, drafts, read);
  return {
    accepted: gate.delivered.length,
    rejected,
    shortfall: gate.deficits.length,
    reasons,
  };
}

type Donor = { topicId: string | null; topicLabel: string; type: string; key: string; count: number };

function donorsFrom<T>(delivered: readonly T[], read: (item: T) => DeliveryItem): Donor[] {
  const byKey = new Map<string, Donor>();
  for (const raw of delivered) {
    const view = read(raw);
    const key = topicSlotKey(view);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        topicId: view.topicId ?? null,
        topicLabel: view.topicLabel,
        type: view.type,
        key,
        count: 1,
      });
      continue;
    }
    existing.count += 1;
    if (view.type === "mcq") existing.type = "mcq";
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.topicLabel.localeCompare(b.topicLabel, "tr"));
}

/**
 * Eksik slotları, kabul edilmiş sorusu olan konulara taşır. Dolu slot durur.
 * Taşınan yerin türü, o konunun geçirdiği türdür (çoktan seçmeli geçtiyse o).
 * Kapsam imzası temizlenir: eski nokta yeni soruyu elemesin. Atama, yalnız
 * özgün slota oturan sorulardan hesaplanır; böylece her dalga aynı yere gider.
 */
export function replaceShortSlots<T>(
  slots: readonly DeliverySlot[],
  drafts: readonly T[],
  read: (item: T) => DeliveryItem,
  completedWaves: number,
  blocked: readonly string[] = [],
  /** Son dalgada yeni kabul görmeyen konu anahtarları. Boşsa yalnız zorlama kaydırır. */
  stalled: readonly string[] = [],
): { slots: DeliverySlot[]; replacement: boolean; shortfall: number } {
  const verdict = selectDeliverable(slots, drafts, read);
  const shortfall = verdict.deficits.length;
  const copy = () => slots.map((slot) => ({ ...slot }));
  if (shortfall === 0 || completedWaves < REPLACEMENT_AFTER_WAVES) {
    return { slots: copy(), replacement: false, shortfall };
  }
  const small = shortfallIsSmall(shortfall, slots.length);
  const forced = completedWaves >= REPLACEMENT_FORCE_AFTER_WAVES && shortfall < slots.length;
  if (!small && !forced) return { slots: copy(), replacement: false, shortfall };
  const stalledSet = new Set(stalled);
  const movable = (slot: DeliverySlot) => forced || stalledSet.has(topicSlotKey(slot));
  if (!verdict.deficits.some(movable)) return { slots: copy(), replacement: false, shortfall };
  const blockedSet = new Set(blocked);
  const ranked = donorsFrom(verdict.delivered, read);
  const donors = ranked.filter((donor) => !blockedSet.has(donor.key));
  const usable = donors.length ? donors : ranked;
  if (!usable.length) return { slots: copy(), replacement: false, shortfall };
  const open = new Set<DeliverySlot>(verdict.deficits);
  let cursor = 0;
  let moved = 0;
  const next = slots.map((slot) => {
    if (!open.has(slot) || !movable(slot)) return { ...slot };
    const donor = usable[cursor % usable.length]!;
    cursor += 1;
    moved += 1;
    return {
      topicId: donor.topicId,
      topicLabel: donor.topicLabel,
      type: donor.type,
      point: null,
      signature: "",
      points: slot.points,
    };
  });
  if (!moved) return { slots: copy(), replacement: false, shortfall };
  return { slots: next, replacement: true, shortfall };
}

/** Vercel günlüğünde `mock_exam_wave` ile aranır. Soru metni yazılmaz. */
export function logMockExamWave(entry: MockExamWaveReport & { examId: string | null }): void {
  console.info("mock_exam_wave", {
    event: "mock_exam_wave",
    examId: entry.examId,
    wave: entry.wave,
    accepted: entry.accepted,
    rejected: entry.rejected,
    reasons: entry.reasons,
    shortfall: entry.shortfall,
    promised: entry.promised,
    replacement: entry.replacement,
  });
}
