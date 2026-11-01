import { NextResponse } from "next/server";
import { buildSetupTree } from "@/lib/curriculum/official-setup";

/** Resmî sınav kurulum ağacı (YKS / LGS): ders → ünite → kazanım. Herkese açık statik veri, model çağrısı yok. */
export function GET(request: Request) {
  const exam = new URL(request.url).searchParams.get("sinav");
  if (exam !== "yks" && exam !== "lgs") return NextResponse.json({ error: "sinav=yks|lgs" }, { status: 400 });
  return NextResponse.json(buildSetupTree(exam), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=3600" },
  });
}
