import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { recordUsage } from "@/lib/credits/service";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import { acceptCleanPage, repeatedEdgeLines } from "@/lib/documents/clean-text";

/**
 * Temiz metin (2 Ekim 2026). Sayfalar ilk ihtiyaçta asıl modelle temizlenir
 * ve saklanır; sonraki ders ve sohbet hazır metni okur. Temizlik bilgiyi
 * değiştirmez: düzelen yazım/tanıma hatası, atılan sayfa üst/alt bilgisi.
 * Kabul kuralı `acceptCleanPage`'de — tutmayan sayfa ham metniyle kalır.
 * Maliyet öğrenciye yazılmaz.
 */

export type CleanPage = { page: number; text: string; cleaned: boolean };

const BATCH = 2;

export const CLEAN_SYSTEM =
  "Bir PDF'in metin katmanından çıkmış ders kitabı sayfalarını temizliyorsun. " +
  "Yalnızca şunları yap: tanıma ve yazım hatalarını düzelt (bölünmüş ya da yapışmış kelimeler, yanlış harfler), " +
  "her sayfanın başında ya da sonunda tekrar eden kitap/bölüm başlığını ve sayfa numarasını at, " +
  "tabloları Markdown tablo olarak, madde işaretlerini madde olarak koru, başlıkları ayrı satırda bırak. " +
  "Bilgi EKLEME, ÇIKARMA, ÖZETLEME, YORUMLAMA. Sayı, tarih, madde numarası, terim aynen kalsın. " +
  "Bir kelimeden emin değilsen olduğu gibi bırak. Sayfaları birleştirme, sıralarını değiştirme. " +
  'JSON döndür: {"pages":[{"page":number,"text":string}]}';

/** Belgenin ilk 40 sayfasından sayfa kenarında tekrar eden satırlar. */
export async function documentRunningHeaders(service: SupabaseClient, documentId: string): Promise<string[]> {
  const { data } = await service
    .from("document_pages")
    .select("text_content")
    .eq("document_id", documentId)
    .order("page_number")
    .limit(40);
  return repeatedEdgeLines(((data ?? []) as { text_content: string | null }[]).map((row) => row.text_content ?? ""));
}

export async function ensureCleanPages(
  service: SupabaseClient,
  input: { userId: string; documentId: string; pages: number[]; edges?: string[] },
): Promise<CleanPage[]> {
  const wanted = [...new Set(input.pages)].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
  if (!wanted.length) return [];
  const { data } = await service
    .from("document_pages")
    .select("page_number, text_content, clean_text")
    .eq("document_id", input.documentId)
    .in("page_number", wanted);
  const rows = (data ?? []) as { page_number: number; text_content: string | null; clean_text: string | null }[];
  const byPage = new Map(rows.map((row) => [row.page_number, row]));
  const result = new Map<number, CleanPage>();
  const dirty: { page: number; text: string }[] = [];
  for (const page of wanted) {
    const row = byPage.get(page);
    const raw = (row?.text_content ?? "").trim();
    if (!raw) continue;
    if (row?.clean_text?.trim()) result.set(page, { page, text: row.clean_text.trim(), cleaned: true });
    else dirty.push({ page, text: raw });
  }

  if (dirty.length && env.OPENAI_API_KEY) {
    const edges = input.edges ?? repeatedEdgeLines(rows.map((row) => row.text_content ?? ""));
    const model = contentModel();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 90_000, maxRetries: 1 });
    // Partiler paralel: ders isteği 300 sn içinde bitmeli (sırayla 5 sayfa 51 sn sürüyordu).
    const batches: (typeof dirty)[] = [];
    for (let at = 0; at < dirty.length; at += BATCH) batches.push(dirty.slice(at, at + BATCH));
    await Promise.all(batches.map(async (batch) => {
      try {
        const response = await openai.chat.completions.create({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: CLEAN_SYSTEM },
            {
              role: "user",
              content:
                (edges.length ? `Bu belgede sayfa kenarında tekrar eden satırlar (at): ${edges.join(" | ")}\n\n` : "") +
                batch.map((item) => `=== SAYFA ${item.page} ===\n${item.text}`).join("\n\n"),
            },
          ],
        });
        void recordUsage(service, {
          userId: input.userId,
          actionCode: "DOCUMENT_CLEAN",
          model,
          tokensIn: response.usage?.prompt_tokens ?? 0,
          tokensOut: response.usage?.completion_tokens ?? 0,
        }).catch(() => undefined);
        const parsed = parseModelJson(response.choices[0]?.message?.content ?? "") as
          | { pages?: { page?: unknown; text?: unknown }[] }
          | null;
        const cleaned = new Map<number, string>();
        for (const item of parsed?.pages ?? []) {
          if (typeof item?.page === "number" && typeof item?.text === "string") cleaned.set(item.page, item.text);
        }
        for (const item of batch) {
          const candidate = cleaned.get(item.page) ?? "";
          if (acceptCleanPage(item.text, candidate)) {
            result.set(item.page, { page: item.page, text: candidate.trim(), cleaned: true });
            await service
              .from("document_pages")
              .update({ clean_text: candidate.trim(), clean_model: model, cleaned_at: new Date().toISOString() })
              .eq("document_id", input.documentId)
              .eq("page_number", item.page);
          } else {
            console.warn("clean_page_rejected", { documentId: input.documentId, page: item.page });
          }
        }
      } catch (error) {
        console.error("clean_pages_failed", {
          documentId: input.documentId,
          pages: batch.map((item) => item.page),
          cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        });
      }
    }));
  }

  // Temizlenemeyen sayfa ham metniyle kalır; ders yine yazılır.
  for (const item of dirty) {
    if (!result.has(item.page)) result.set(item.page, { page: item.page, text: item.text, cleaned: false });
  }
  return wanted.flatMap((page) => {
    const hit = result.get(page);
    return hit ? [hit] : [];
  });
}
