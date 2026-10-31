import { PREP_WIDE_TARGET_KINDS } from "@/lib/learning/prep-wide-target";
import { adaptiveFocusTopic } from "@/lib/learning/path-change";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

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

function foldLabel(value: string | null | undefined): string {
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
