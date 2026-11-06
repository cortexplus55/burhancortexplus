import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/**
 * Düğüm içinde başka konu seçilince düğüm o konuya bağlanır (6 Kasım 2026). Canlıda "Etkinlik oluştur → Sözlü
 * deneme" ilk konunun adıyla bir düğüm açtı; öğrenci düğümün içinde başka bir konu seçti, sorular o konudan geldi,
 * ama düğüm eski konunun kimliğini ve adını ("Sözlü · <ilk konu>") taşımaya devam etti: sonuç ve yol başka konunun
 * sözlüsü gibi göründü. Üretim kaydedilirken düğümün konu kimliği, adı, kaynak sayfaları ve başlığı seçilen konuya
 * geçer; kayıt (deneme, kanıt, yol) seçilen konuda kalır.
 *
 * Yalnız konunun kendi etkinliği olan türler; hazırlık geneli adımların (zayıf nokta, odaklı pratik, son kartlar)
 * kendi adlandırması var (`weakPracticeTitle`), onlar değişmez.
 */
export const BIND_ON_RETARGET_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>(["oral"]);

/** Seçilen konunun düğüm başlığı: "<tür> · <konu>" (`planActivityInsert` ile aynı biçim). */
export function boundNodeTitle(kind: PlanNodeKind, topicLabel: string): string {
  return `${PLAN_NODE_META[kind]?.setupLabel ?? kind} · ${topicLabel.trim()}`;
}

/**
 * Kayda yazılacak düğüm yaması; bağlama gerekmiyorsa null. `effectiveMeta` açılışın seçilen konuya göre kurduğu
 * oturum bilgisidir (konu kimliği belge konu düğümü biçiminde, sayfalar seçilen konunun).
 */
export function retargetBindingPatch(input: {
  kind: PlanNodeKind;
  nodeTitle: string | null;
  storedMeta: Record<string, unknown>;
  effectiveMeta: { topicId?: string | null; topicTitle?: string | null; sourcePages?: unknown } | null;
  retargetedTopic: string | null;
}): { session_meta: Record<string, unknown>; title: string } | null {
  const label = input.retargetedTopic?.trim();
  if (!label || !BIND_ON_RETARGET_KINDS.has(input.kind)) return null;
  const next: Record<string, unknown> = { ...input.storedMeta, topicTitle: label };
  const topicId = input.effectiveMeta?.topicId?.trim();
  if (topicId) next.topicId = topicId;
  else delete next.topicId;
  // Eski konunun sayfaları, hedefi ve ünitesi yeni konuya ait değil.
  delete next.objective;
  delete next.unitTitle;
  const pages = input.effectiveMeta?.sourcePages;
  if (Array.isArray(pages) && pages.length) next.sourcePages = pages;
  else delete next.sourcePages;
  const title = boundNodeTitle(input.kind, label);
  const unchanged =
    input.storedMeta.topicTitle === label &&
    (input.storedMeta.topicId ?? null) === (next.topicId ?? null) &&
    input.nodeTitle === title;
  return unchanged ? null : { session_meta: next, title };
}
