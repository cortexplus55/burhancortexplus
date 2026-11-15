import { NextResponse, after } from "next/server";
import { withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { loadStudentDossier } from "@/lib/teacher/dossier-load";
import { ensureDocumentMap } from "@/lib/documents/document-map-load";
import { teacherPlanView } from "@/lib/teacher/director";
import { istanbulDay } from "@/lib/istanbul-day";
import { parityGreetingName } from "@/components/parity/app-utils";

/**
 * Açılış akışı (PROMPT-V2 §6 M2, M4, M5, M6; PR-4): öğretmenin ilk sözü, analiz çipleri, teşhis ve 10/20/45 dk
 * planları tek okumayla. Model çağrısı YOK, kredi ve sayaç YOK (açılış ve süre çipleri kota harcamaz). Yalnız okur,
 * yalnız öğrencinin kendi kayıtları; bayrak kapalıyken 404.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "teacher-plan-read", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const started = Date.now();
  // Ad adreste taşınmaz (kişisel veri sorgu dizesine girmez): profilden, dosyayla aynı anda; okuma düşerse adsız selam.
  const [dossier, profile] = await Promise.all([
    loadStudentDossier(service, userId),
    Promise.resolve(service.from("profiles").select("full_name").eq("id", userId).maybeSingle()).then(
      ({ data }) => data,
      () => null,
    ),
  ]);
  const pending = dossier.pendingMapDocumentId;
  if (pending) after(() => ensureDocumentMap(service, userId, pending).then(() => undefined));
  const greeting = parityGreetingName((profile?.full_name as string | null | undefined) ?? null);
  const name = greeting === "Merhaba" ? null : greeting;
  const view = teacherPlanView(dossier, { name, seed: `${userId}:${istanbulDay()}` });
  console.info("teacher_plan_view", { ms: Date.now() - started, empty: view.empty, items20: view.plans["20"]?.length ?? 0 });
  return NextResponse.json(view, { headers: { "Cache-Control": "private, no-store" } });
}
