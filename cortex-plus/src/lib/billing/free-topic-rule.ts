import { ALL_TOPICS_KINDS, PREP_WIDE_TARGET_KINDS } from "@/lib/learning/prep-wide-target";
import { adaptiveFocusTopic } from "@/lib/learning/path-change";
import { topicLabelsMatch } from "@/lib/learning/topic-identity";
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
  return nodes.filter((node) => ownFirstTopicStep(firstIds, node.kind, node.session_meta, node.title ?? ""));
}

/** 1. konunun kendi adımı: konunun kimliğini taşır; hazırlık geneli, final bloğu ve Plus adımı değildir. */
function ownFirstTopicStep(firstIds: ReadonlySet<string>, kind: string, sessionMeta: unknown, topicLabel: string): boolean {
  const meta = sessionMeta && typeof sessionMeta === "object" ? (sessionMeta as { topicId?: unknown; role?: unknown }) : null;
  return (
    typeof meta?.topicId === "string" &&
    Boolean(meta.topicId) &&
    firstIds.has(meta.topicId) &&
    meta.role !== "mock" &&
    !PLUS_ONLY_NODE_KINDS.has(kind) &&
    !gatePrepWide(kind, sessionMeta, topicLabel)
  );
}

export type CycleNodeInput = {
  kind: string;
  /** Düğümün kendi oturum bilgisi (`exam_prep_nodes.session_meta`); yeniden hedeflenmiş hâli değil. */
  sessionMeta: unknown;
  topicLabel: string;
  /** Öğrencinin istekle gönderdiği konu (`?konu=`); boşsa düğümün kendi konusu. */
  requestedTopicLabel: string | null;
};

/**
 * İlk dersin temel döngüsü (11 Kasım 2026, ürün sahibinin kararı): bu adım 1. konunun ücretsiz öğrencinin
 * bitirebileceği adımlarından biri mi — konu anlatımı, konu testi, doğru/yanlış, kartlarla tekrar ve aynı konunun
 * öbür kendi adımları (soru-cevap turu, o konunun odaklı pratiği). `firstTopicOwnNodes` ile aynı küme; ek olarak
 * bütün konuları kapsayan adım (son kontrol, hazırsın) girmez ve öğrenci başka bir konu istediyse (`?konu=`) adım
 * o konunun sayılır: 1. konunun adımı üzerinden başka konu çalışmak haftalık ders hakkından düşer.
 */
export function firstLessonCycleNode(first: FirstTopicRef, node: CycleNodeInput): boolean {
  if (ALL_TOPICS_KINDS.has(node.kind as PlanNodeKind)) return false;
  const requested = node.requestedTopicLabel?.trim();
  if (requested) {
    // Düğümün kendi konu adı da sayılır: başlatma isteği aynı eşleşmede konuyu değiştirmez (`retargetNodeTopic`).
    const ownTitle = (node.sessionMeta as { topicTitle?: unknown } | null)?.topicTitle;
    const own = typeof ownTitle === "string" ? ownTitle : null;
    if (!topicLabelsMatch(requested, first.label) && !topicLabelsMatch(requested, own)) return false;
  }
  return ownFirstTopicStep(first.ids, node.kind, node.sessionMeta, node.topicLabel);
}
