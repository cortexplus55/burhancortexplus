import { PREP_WIDE_TARGET_KINDS } from "@/lib/learning/prep-wide-target";
import { adaptiveFocusTopic } from "@/lib/learning/path-change";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";

/*
  İlk doz bedava kuralının saf hâli (Paket J takip #1, 1 Kasım 2026). Başlatma isteği (`start.ts`), adım sayfası ve
  hazırlık yolu AYNI kararı verir: öğrenci kilitli adıma tıklayınca kart anında açılır, sunucu yine son söz.
  Kural `free-topic-gate.ts`'teki açıklamanın aynısı; burada yalnız veriden bağımsız karar.
*/

export type FirstTopicRef = { label: string; ids: ReadonlySet<string> };

export type GateNodeInput = {
  /** Düğümün kendi konusu (`session_meta.topicId`). */
  nodeTopicId: string | null;
  /** Hazırlık geneli adım (konusu yok, final adımı sayılır). */
  prepWide: boolean;
  /** Hazırlık geneli adımda öğrencinin seçtiği konu (`?konu=`). */
  requestedTopicLabel: string | null;
  /** Bu adımın öğrencide kaydı var: açılmaya devam eder. */
  opened: boolean;
};

export function foldLabel(value: string | null | undefined): string {
  return String(value ?? "").trim().toLocaleLowerCase("tr");
}

/** Hazırlık geneli mi (başlatma isteğiyle aynı tanım): odaklı pratiğin uyarlamalı olanı kendi konusunu taşır. */
export function gatePrepWide(kind: string, sessionMeta: unknown, topicLabel: string): boolean {
  return PREP_WIDE_TARGET_KINDS.has(kind as PlanNodeKind) && !adaptiveFocusTopic(kind, sessionMeta, topicLabel);
}

/** 1. konunun dışında ve kaydı yoksa kilitli. */
export function nodeLockedForFree(first: FirstTopicRef, input: GateNodeInput): boolean {
  const open = input.prepWide
    ? Boolean(input.requestedTopicLabel) && foldLabel(input.requestedTopicLabel) === foldLabel(first.label)
    : Boolean(input.nodeTopicId) && first.ids.has(input.nodeTopicId!);
  if (open) return false;
  return !input.opened;
}

export type SummaryNode = { id: string; kind: string; status: string; title?: string | null; session_meta: { topicId?: string; role?: string } | null };

/**
 * 1. konunun ücretsiz öğrencinin BİTİREBİLECEĞİ adımları (5 Kasım 2026). Sayıya girmeyenler: hazırlık geneli adımlar
 * (konunun kimliğini taşır ama konuya ait değildir), yolun final bloğu (`role: "mock"`: zayıf nokta, yazılı deneme,
 * son kontrol, hazırım …) ve Plus'a özel adımlar (podcast, sözlü). Girseydi özet "0/13" derdi (yolda 7 adım) ve
 * "1. Konuyu Başarıyla Tamamladın" kutlaması ücretsiz öğrencide hiç çıkmazdı (canlı turda görüldü).
 */
export function firstTopicOwnNodes(nodes: readonly SummaryNode[], firstIds: ReadonlySet<string>): SummaryNode[] {
  return nodes.filter(
    (node) =>
      node.session_meta?.topicId &&
      firstIds.has(node.session_meta.topicId) &&
      node.session_meta.role !== "mock" &&
      !PLUS_ONLY_NODE_KINDS.has(node.kind) &&
      !gatePrepWide(node.kind, node.session_meta, node.title ?? ""),
  );
}
