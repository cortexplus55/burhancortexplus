import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { LAB_APPS } from "@/lib/parity/lab-apps";

/**
 * Uygulama katalogu metrikleri.
 *
 * POST  → açılış kaydı (oynanma sayacı)
 * PUT   → 1-5 arası puan (kullanıcı başına tek oy, tekrar oy verirse güncellenir)
 *
 * app_id serbest metin bir kolon (katalog kodda yaşıyor, yabancı anahtar yok),
 * bu yüzden burada katalogla doğrulanır — aksi hâlde tabloya rastgele kimlik
 * yazılabilirdi.
 */

const playSchema = z.object({ appId: z.string().min(1).max(64) });
const rateSchema = playSchema.extend({ rating: z.number().int().min(1).max(5) });

function isKnownApp(appId: string): boolean {
  return LAB_APPS.some((app) => app.id === appId);
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "lab-play", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = playSchema.safeParse(await request.json());
  if (!parsed.success || !isKnownApp(parsed.data.appId)) {
    return errorResponse(400, "invalid_input");
  }

  const { error } = await service
    .from("lab_app_plays")
    .insert({ user_id: userId, app_id: parsed.data.appId });

  // Sayaç ikincil; yazılamazsa uygulamayı açmayı engellemez.
  if (error) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const guard = await withUser(request, { scope: "lab-rate", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = rateSchema.safeParse(await request.json());
  if (!parsed.success || !isKnownApp(parsed.data.appId)) {
    return errorResponse(400, "invalid_input");
  }

  const { error } = await service.from("lab_app_ratings").upsert(
    {
      user_id: userId,
      app_id: parsed.data.appId,
      rating: parsed.data.rating,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,app_id" },
  );

  if (error) return errorResponse(500, "rate_failed");
  return NextResponse.json({ ok: true });
}
