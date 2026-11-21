import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { buildTutorStudentContext } from "@/lib/tutor/student-context";
import { loadTutorResume } from "@/lib/tutor/resume-line";

/**
 * Öğretmen sohbetinin karşılama kartları (Faz 11, teacher.v2): en çok dört kart, öğrencinin kendi kayıtlarından ve
 * modelsiz. Yalnız okur; model çağrısı, kredi ve sayaç YOK. Bayrak kapalıyken 404. `/ogretmen` sayfasının sunucu sorgu
 * bütçesine girmez: kartları istemci bu uçtan ister.
 *
 * Öğretmen v3 (21 Kasım 2026): `resume` karşılamanın ilk hapı ("Dün «…» konusunda kalmıştık, oradan devam edelim mi?"):
 * son 7 günün en yeni konuşma başlığından ya da takıldığı nokta notundan; kayıt yoksa null. Kartlarla aynı anda okunur.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "teacher-start-cards", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const [context, resume] = await Promise.all([
    buildTutorStudentContext(service, userId),
    loadTutorResume(service, userId).catch(() => null),
  ]);
  return NextResponse.json(
    { cards: context.cards, empty: context.empty, resume },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
