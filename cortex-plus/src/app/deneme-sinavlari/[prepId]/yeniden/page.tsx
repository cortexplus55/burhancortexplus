import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { requireStudentArea } from "@/lib/auth/session";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import { restudyNodeHref, restudySequence, restudyToken, type RestudyNode } from "@/lib/learning/free-restudy";

export const dynamic = "force-dynamic";

/**
 * "Yolu Yeniden Çalış (Ücretsiz)" ve "Tüm Yolu Baştan Çöz — Karışık Sıra (Ücretsiz)" (Faz 4, 19 Kasım 2026): bitmiş
 * adımlar kayıtlarından açılır (kredi, kullanım kaydı ve model çağrısı yok). `?sira=karisik` adımları her turda
 * yeni bir tohumla karıştırır; test ve doğru/yanlışın soru ve şık sırası da her açılışta karışır.
 */
export default async function PrepRestudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ sira?: string }>;
}) {
  const { prepId } = await params;
  const { sira } = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const { data: prep } = await supabase.from("exam_preps").select("id").eq("id", prepId).eq("user_id", user.id).maybeSingle();
  if (!prep) notFound();
  const { data: rows } = await supabase
    .from("exam_prep_nodes")
    .select("id, kind, status, sort_order")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const nodes: RestudyNode[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    kind: String(row.kind),
    status: String(row.status),
    sortOrder: Number(row.sort_order ?? 0),
  }));
  const order = sira === "karisik" ? "mixed" : "path";
  const seed = randomBytes(6).toString("hex");
  const sequence = restudySequence(nodes, order, seed);
  if (!sequence.length) redirect(examPrepHomeHref(prepId));
  redirect(restudyNodeHref(prepId, sequence[0]!, restudyToken(order, seed)));
}
