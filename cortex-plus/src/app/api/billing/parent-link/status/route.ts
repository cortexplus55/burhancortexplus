import { NextResponse } from "next/server";
import { guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import { parentLinkIssuedAt, verifyParentPayToken } from "@/lib/payments/parent-link";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Velinin onay ekranının yokladığı durum (Faz 5 §2): bağlantının öğrencisi ve paketi için, bağlantı üretildikten sonra
 * açılmış bir ödeme PayTR geri çağrısıyla "paid" oldu mu. Yalnız evet/hayır döner; tutar, e-posta ya da kimlik yok.
 * Belirteç imzasız ya da süresi geçmişse 404/410. Herkese açık; IP başına sınırlı.
 */
export async function GET(request: Request) {
  const limited = await guestLimit(request, { scope: "parent-pay-status", limit: 60 });
  if (limited) return limited;

  const token = new URL(request.url).searchParams.get("token");
  const verified = verifyParentPayToken(token);
  if (!verified.ok) {
    return NextResponse.json({ error: verified.reason }, { status: verified.reason === "expired" ? 410 : 404, headers: NO_STORE });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("payments")
    .select("status, merchant_oid")
    .eq("user_id", verified.claims.studentId)
    .eq("plan_id", verified.claims.planId)
    .gte("created_at", new Date(parentLinkIssuedAt(verified.claims)).toISOString())
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });

  const rows = (data ?? []) as { status?: string | null; merchant_oid?: string | null }[];
  // Yalnız bu bağlantıdan (veli yolu) açılan ödemeler: öğrencinin kendi ödemesi veliye "ödemeniz alındı" dedirtmez.
  const viaLink = await parentLinkOrders(service, rows.map((row) => row.merchant_oid).filter((oid): oid is string => Boolean(oid)));
  const own = rows.filter((row) => row.merchant_oid && viaLink.has(row.merchant_oid));
  const paid = own.some((row) => row.status === "paid");
  return NextResponse.json({ paid, pending: !paid && own.some((row) => row.status === "pending") }, { headers: NO_STORE });
}

async function parentLinkOrders(service: ReturnType<typeof createServiceClient>, orders: string[]): Promise<Set<string>> {
  if (!orders.length) return new Set();
  const { data } = await service
    .from("audit_logs")
    .select("entity_id, metadata")
    .eq("action", "payment.token.created")
    .in("entity_id", orders);
  return new Set(
    ((data ?? []) as { entity_id?: string | null; metadata?: { via?: string } | null }[])
      .filter((row) => row.metadata?.via === "parent_link" && row.entity_id)
      .map((row) => row.entity_id as string),
  );
}
