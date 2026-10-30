/** Öğretmen motorlarının ortak kaynağı: konunun temiz çekirdek sayfaları ve etiketli yardımcı sayfalar. */
import "server-only";
import { documentRunningHeaders, ensureCleanPages } from "@/lib/documents/clean-pages";
import { corePageRun } from "@/lib/learning/core-pages";
import type { SupportPage } from "@/lib/learning/topic-support-load";
import type { NodePayloadInput } from "./generate";

/**
 * Öğretmen motorlarının kaynağı: konunun kendi belgesi ve sayfaları; support, kendi dosyası dışından
 * gelen yardımcı sayfalar (defter, test, kart fotoğrafı; topic-support-pages.ts, 19 Ekim 2026).
 */
export type LessonCore = { documentId: string; pages: number[]; support?: SupportPage[] };

/** Temiz çekirdek sayfalar, ardından etiketli yardımcı sayfalar. */
export function withSupport(clean: { page: number; text: string }[], core: LessonCore | null) {
  return [...clean.map((item) => ({ page: item.page, text: item.text })), ...(core?.support ?? [])];
}

/** Temiz çekirdek sayfalar ya da belgesiz; öğretmen motorlarının ortak kaynağı. */
export async function teacherPages(
  input: NodePayloadInput,
  core: LessonCore | null,
) {
  const edges = core ? await documentRunningHeaders(input.service, core.documentId) : [];
  const clean = core
    ? await ensureCleanPages(input.service, {
        userId: input.userId,
        documentId: core.documentId,
        pages: corePageRun(core.pages),
        edges,
      })
    : [];
  return { edges, pages: withSupport(clean, core) };
}
