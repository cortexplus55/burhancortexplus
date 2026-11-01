import { NextResponse } from "next/server";
import { CURRICULUM, listProgramSummaries } from "@/lib/curriculum/registry";

/** Resmî program listesi, sınav yapıları, takvim ve dışarıda bırakılanlar. Herkese açık, statik veri. */
export function GET() {
  return NextResponse.json(
    {
      version: CURRICULUM.version,
      fetchedAt: CURRICULUM.fetchedAt,
      programs: listProgramSummaries(),
      examStructures: CURRICULUM.examStructures,
      calendar: CURRICULUM.calendar,
      excluded: CURRICULUM.excluded,
      sources: CURRICULUM.sources,
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
