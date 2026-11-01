import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fillStatus } from "@/lib/content-pool/fill-server";
import { adminUserId } from "@/lib/content-pool/fill-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toplu doldurucu ilerlemesi (yalnız yönetici): program başına bitti/başarısız/üretiliyor/bekliyor, soru sayısı, harcama ve tavan. */
export async function GET() {
  if (!(await adminUserId())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await fillStatus(createServiceClient()), { headers: { "Cache-Control": "private, no-store" } });
}
