import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";

/**
 * Kullanıcının işlenmiş belgeleri.
 *
 * Sınav hazırlığı oluştururken "hangi kaynaktan çalışacağım" seçimi için
 * gerekiyordu: exam_preps.document_id kolonu vardı ama onu yazacak bir akış
 * yoktu, dolayısıyla hazırlık hiçbir zaman belirli bir belgeye bağlanamıyordu.
 *
 * Yalnızca status='completed' olanlar dönüyor — henüz işlenmemiş bir belgenin
 * arama gömmesi (embedding) hazır değildir, seçtirmek boş bir kaynak bağlamak
 * olurdu.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "documents-list", limit: 30 });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;
  const user = { id: userId };

  const { data } = await supabase
    .from("documents")
    .select("id, file_name, created_at")
    .eq("user_id", user.id)
    .eq("status", "completed")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    documents: (data ?? []).map((row) => ({
      id: row.id as string,
      fileName: row.file_name as string,
    })),
  });
}
