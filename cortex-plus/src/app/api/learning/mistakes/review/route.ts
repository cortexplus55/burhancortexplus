import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { reviewMistake } from "@/lib/learning/mistake-notebook";
import { recordDrillAnswer } from "@/lib/learning/daily-drill";

/**
 * Defterden sorulan bir soruya verilen yanıt.
 *
 * Doğruluk kararı sunucuda veriliyor: doğru yanıt istemciye hiç gitmiyor,
 * yoksa öğrenci sayfanın kaynağına bakıp defteri kandırabilirdi. Defterin tek
 * işi öğrencinin neyi bilmediğini doğru tutmak; kandırılabilen bir defter
 * hiç olmamasından kötü.
 *
 * Kullanıcının kendi istemcisiyle yazıyoruz; satır güvenliği kuralı zaten
 * başkasının defterine dokunmayı engelliyor.
 */
const schema = z.object({
  entryId: z.string().uuid(),
  answer: z.string().max(2000),
  // Günün turundan geliyorsa turun sayaçları da ilerliyor. Defter
  // sayfasından gelen yanıtlarda bu alanlar yok.
  drillId: z.string().uuid().optional(),
  drillTotal: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const outcome = await reviewMistake(
    supabase,
    user.id,
    parsed.data.entryId,
    parsed.data.answer,
  );

  if (!outcome) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { drillId, drillTotal } = parsed.data;
  if (drillId && drillTotal) {
    await recordDrillAnswer(
      supabase,
      user.id,
      drillId,
      outcome.correct,
      drillTotal,
    );
  }

  return NextResponse.json(outcome);
}
