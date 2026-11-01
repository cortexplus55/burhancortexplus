import { NextResponse } from "next/server";
import { buildSetupTree } from "@/lib/curriculum/official-setup";
import { isSetupExam, SETUP_EXAMS } from "@/lib/curriculum/yks-alan";

/** Resmî sınav kurulum ağacı (YKS / LGS / KPSS / ALES / DGS / YDS / TUS / DUS): ders → ünite → kazanım. Herkese açık statik veri, model çağrısı yok. */
export function GET(request: Request) {
  const exam = new URL(request.url).searchParams.get("sinav");
  if (!isSetupExam(exam)) return NextResponse.json({ error: `sinav=${SETUP_EXAMS.join("|")}` }, { status: 400 });
  return NextResponse.json(buildSetupTree(exam), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
