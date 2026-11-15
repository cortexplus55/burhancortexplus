import { NextResponse, after } from "next/server";
import { withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { loadStudentDossier } from "@/lib/teacher/dossier-load";
import { ensureDocumentMap } from "@/lib/documents/document-map-load";

/**
 * "Neye baktım" paneli (PROMPT-V2 §3, PR-2): öğretmenin okuduğu kayıtlar, her satır kaynağına bağlı. Yalnız okur,
 * yalnız öğrencinin kendi kayıtları; model çağrısı yok. Bayrak kapalıyken 404. `?yenile=1` önbelleği atlar (öğrenci
 * bir kaydı sildikten sonra panel güncel okusun).
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "teacher-dossier-read", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const fresh = new URL(request.url).searchParams.get("yenile") === "1";
  const dossier = await loadStudentDossier(service, userId, { fresh });
  // Belge haritası yoksa yanıttan sonra bir kez hesaplanır (PR-3); öğrenciyi bekletmez.
  const pending = dossier.pendingMapDocumentId;
  if (pending) after(() => ensureDocumentMap(service, userId, pending).then(() => undefined));
  return NextResponse.json(
    { lines: dossier.lines, checks: dossier.checks, empty: dossier.empty },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
