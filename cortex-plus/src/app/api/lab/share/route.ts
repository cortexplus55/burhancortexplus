import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * Uygulamayı okul akışına açar/kapatır.
 *
 * Servis anahtarı değil kullanıcı istemcisi kullanılıyor: sahiplik denetimini
 * RLS yapıyor (user_apps_owner). Servis anahtarıyla yazsaydık `user_id`
 * eşleşmesini burada elle kontrol etmek zorunda kalırdık ve o kontrolü bir
 * gün unutmak mümkün.
 */

const schema = z.object({
  appId: z.string().uuid(),
  shared: z.boolean(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "lab-share", limit: 30 });
  if (!guard.ok) return guard.response;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_apps")
    .update({
      visibility: parsed.data.shared ? "school" : "private",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.appId);

  if (error) return errorResponse(500, "share_failed");
  return NextResponse.json({ ok: true });
}
