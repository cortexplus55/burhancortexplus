import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { errorResponse, withUser } from "@/lib/api/guards";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { extractAppDocument } from "@/lib/parity/user-app";

/**
 * Mini uygulama üreteci.
 *
 * POST { mode: "ideas", topic }  → birkaç fikir önerisi (bedelsiz, kısa çağrı)
 * POST { mode: "build", prompt } → tek dosyalık çalışan uygulama (kredi harcar)
 *
 * Üretilen belge başka kullanıcıların da açabileceği bir şey; çalıştırma
 * tarafındaki izolasyon için bkz. components/parity/user-app-frame.tsx.
 * Burada yalnızca biçim doğrulanıyor — HTML'i "temizlemeye" çalışmıyoruz,
 * çünkü yarım bir temizlik güvenlik hissi verir ama korumaz. Koruma
 * sandbox + CSP'de.
 */

const ideasSchema = z.object({
  mode: z.literal("ideas"),
  topic: z.string().min(2).max(200),
});

const buildSchema = z.object({
  mode: z.literal("build"),
  prompt: z.string().min(10).max(2000),
});

const SYSTEM_BUILD = `Sen bir eğitim teknolojisi geliştiricisisin. Öğrencinin
anlattığı fikri TEK DOSYALIK, çalışır bir mini uygulamaya çeviriyorsun.

Kurallar:
- Çıktı yalnızca eksiksiz bir HTML belgesi olsun. Açıklama, markdown, kod
  çiti (\`\`\`) yazma.
- Her şey tek dosyada: <style> ve <script> gömülü. DIŞ KAYNAK YOK — CDN,
  font, resim URL'si, fetch, XMLHttpRequest, WebSocket kullanma. Ağ erişimi
  kapalıdır, denersen uygulama çalışmaz.
- Görselleri CSS, SVG veya canvas ile kendin çiz.
- Koyu tema: arka plan #161616, metin #e4e4e7, vurgu #f4ae0b.
- Arayüz Türkçe. Klavyeyle de kullanılabilsin, düğmelerde görünür odak olsun.
- Mobilde de çalışsın; sabit piksel genişlik verme.
- Etkileşimli olsun: öğrenci bir şey deneyebilsin, sonucu görsün.
- İlk açılışta ne yapılacağı ekranda yazsın.`;

const SYSTEM_IDEAS = `Öğrenciye, verdiği konu için yapabileceği 3 mini uygulama
fikri öner. Her biri tek cümlelik bir açıklama olsun ve etkileşimli olsun
(simülasyon, mini oyun, görselleştirme veya bulmaca).
JSON döndür: { "ideas": [{ "title": string, "detail": string }] }`;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "lab-generate", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const body = await request.json().catch(() => null);
  const parsed = z.union([ideasSchema, buildSchema]).safeParse(body);
  if (!parsed.success) return errorResponse(400, "invalid_input");

  if (!env.OPENAI_API_KEY) return errorResponse(503, "ai_unavailable");
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // --- Fikir önerisi: kısa, ucuz, kredisiz -------------------------------
  if (parsed.data.mode === "ideas") {
    try {
      const completion = await openai.chat.completions.create({
        model: env.OPENAI_STANDARD_MODEL,
        messages: [
          { role: "system", content: SYSTEM_IDEAS },
          { role: "user", content: `Konu: ${parsed.data.topic}` },
        ],
        response_format: { type: "json_object" },
      });
      const raw = completion.choices[0]?.message?.content ?? "{}";
      const data = JSON.parse(raw) as {
        ideas?: { title?: string; detail?: string }[];
      };
      return NextResponse.json({
        ideas: (data.ideas ?? [])
          .filter((i) => i.title)
          .slice(0, 3)
          .map((i) => ({ title: String(i.title), detail: String(i.detail ?? "") })),
      });
    } catch {
      return errorResponse(502, "ai_failed");
    }
  }

  // --- Uygulama üretimi: kredi harcar ------------------------------------
  const idempotencyKey = `labapp_${userId}_${Date.now()}`;
  const { data: reservationId, error: reserveError } = await service.rpc(
    "credit_reserve",
    {
      p_user_id: userId,
      p_action_code: "LAB_APP_GENERATE",
      p_idempotency_key: idempotencyKey,
    },
  );
  if (reserveError) return errorResponse(402, "insufficient_credits");

  try {
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_ADVANCED_MODEL,
      messages: [
        { role: "system", content: SYSTEM_BUILD },
        { role: "user", content: parsed.data.prompt },
      ],
    });

    const html = extractAppDocument(completion.choices[0]?.message?.content ?? "");
    if (!html) {
      await service.rpc("credit_refund", { p_reservation_id: reservationId });
      return errorResponse(502, "generation_unusable");
    }

    // Başlık ve ders etiketini ayrı ve kısa bir çağrıyla çıkarmak yerine
    // belgeden okuyoruz — <title> zaten üretiliyor.
    const title =
      /<title[^>]*>([^<]{2,80})<\/title>/i.exec(html)?.[1]?.trim() ||
      parsed.data.prompt.slice(0, 60);

    const supabase = await createClient();
    const { data: row, error: insertError } = await supabase
      .from("user_apps")
      .insert({
        user_id: userId,
        title,
        description: parsed.data.prompt.slice(0, 240),
        prompt: parsed.data.prompt,
        html,
      })
      .select("id, title")
      .single();

    if (insertError || !row) {
      await service.rpc("credit_refund", { p_reservation_id: reservationId });
      return errorResponse(500, "save_failed");
    }

    await service.rpc("credit_commit", { p_reservation_id: reservationId });
    return NextResponse.json({ id: row.id, title: row.title });
  } catch {
    // Model çağrısı patladıysa kredi geri veriliyor: kullanıcı elinde
    // hiçbir şey yokken ödeme yapmış olmamalı.
    await service.rpc("credit_refund", { p_reservation_id: reservationId });
    return errorResponse(502, "ai_failed");
  }
}

export const maxDuration = 60;
