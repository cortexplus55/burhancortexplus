import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { openaiLlm } from "@/lib/content-pool/generate";
import { UNIT_ID_PATTERN } from "@/lib/content-pool/keys";
import { getUnitContent } from "@/lib/content-pool/pool";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Ortak ünite içeriği (R3 read-through). GET ?unit=<curriculum_units.id> (`program#sort_order`, 1 tabanlı;
 * örn. yks-2026-tarih#1 = Tarih ve Zaman). Veritabanı, tohum betiği ve havuzla aynı kimlik.
 * Doğrulanmış içerik 0 model çağrısıyla döner; yoksa bu öğrenci için üretilir, doğrulanır, havuza yazılır.
 * Yanıt başlıkları: X-Pool (hit/generated/pending), X-Pool-LLM-Calls, Server-Timing.
 */
export async function GET(request: Request) {
  const unitId = new URL(request.url).searchParams.get("unit") ?? "";
  if (!UNIT_ID_PATTERN.test(unitId)) return errorResponse(400, "invalid_input");
  const { data } = await (await createClient()).auth.getUser();
  const userId = data.user?.id;
  if (!userId) return errorResponse(401, "unauthorized");

  const result = await getUnitContent(unitId, { store: supabasePoolStore(createServiceClient()), llm: openaiLlm(), userId });
  const headers: Record<string, string> = { "Cache-Control": "private, no-store", "X-Pool": result.status, "Server-Timing": `pool;dur=${result.ms}` };
  if ("llmCalls" in result) headers["X-Pool-LLM-Calls"] = String(result.llmCalls);
  if (result.status === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  if (result.status === "pending")
    return NextResponse.json({ status: "pending", message: "Bu ünitenin içeriği şu an hazırlanıyor. Birazdan tekrar dene." }, { status: 202, headers: { ...headers, "Retry-After": "20" } });
  if (result.status === "failed")
    return NextResponse.json({ status: "failed", reason: result.reason, message: "İçerik doğrulamadan geçmedi; yeniden denenecek." }, { status: 503, headers });
  return NextResponse.json({ status: result.status, content: result.content }, { headers });
}
