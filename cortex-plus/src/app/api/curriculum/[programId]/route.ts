import { NextResponse } from "next/server";
import { getProgram, programSources } from "@/lib/curriculum/registry";

/** Tek resmî program: üniteler, kazanımlar, senaryo kotaları ve kaynak belgeleri (URL + sha256). */
export async function GET(_request: Request, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const program = getProgram(decodeURIComponent(programId));
  if (!program) return NextResponse.json({ error: "Program bulunamadı." }, { status: 404 });
  return NextResponse.json(
    { program, sources: programSources(program) },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
