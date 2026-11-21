import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { buildTutorStudentContext } from "@/lib/tutor/student-context";

/**
 * Öğretmen sohbetinin karşılama kartları (Faz 11, teacher.v2): en çok dört kart, öğrencinin kendi kayıtlarından ve
 * modelsiz. Yalnız okur; model çağrısı, kredi ve sayaç YOK. Bayrak kapalıyken 404. `/ogretmen` sayfasının sunucu sorgu
 * bütçesine girmez: kartları istemci bu uçtan ister.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "teacher-start-cards", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const context = await buildTutorStudentContext(service, userId);
  return NextResponse.json(
    { cards: context.cards, empty: context.empty },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
