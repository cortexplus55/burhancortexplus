import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { auditLog } from "@/lib/audit";
import { formatDate } from "@/lib/format";
import { familiarityLabel, failureReasonLabel, nodeKindLabel, nodeStatusLabel } from "@/lib/admin/support-labels";

export const metadata = { title: "Yönetim · Hazırlık (salt okunur)" };
export const dynamic = "force-dynamic";

/**
 * Destek için salt okunur hazırlık görünümü (19 Ekim 2026, satışa hazırlık plan 4.2).
 *
 * "Ders açılmıyor", "yol ilerlemiyor" diye yazan öğrenciye bakmak için: yol (düğüm türü, konu, durum,
 * deneme sayısı, son puan), konular ve bu hazırlığın üretim hataları. Ders metni, cevaplar ve belge
 * içeriği gösterilmez; yalnız yapı ve durum. Her açılış denetim günlüğüne `support.prep_viewed` olarak
 * yazılır. Hiçbir şey değiştirilmez — takılı üretim için /admin/ders-hatalari.
 */
export default async function AdminHazirlikPage({
  params,
}: {
  params: Promise<{ userId: string; prepId: string }>;
}) {
  const { user: actor } = await requireAdmin();
  const { userId, prepId } = await params;
  const service = createServiceClient();

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, exam_date, target_score, created_at, user_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) notFound();

  const [{ data: nodes }, { data: attempts }, { data: topics }, { data: failures }, pending] = await Promise.all([
    service
      .from("exam_prep_nodes")
      .select("id, kind, title, status, sort_order, session_meta")
      .eq("exam_prep_id", prepId)
      .order("sort_order"),
    service
      .from("exam_prep_node_attempts")
      .select("node_id, status, score, total, created_at")
      .eq("exam_prep_id", prepId)
      .order("created_at", { ascending: false })
      .limit(500),
    service.from("exam_prep_topics").select("label, status, familiarity, sort_order").eq("exam_prep_id", prepId).order("sort_order"),
    service
      .from("lesson_generation_failures")
      .select("created_at, kind, reason, topic_label, reasons")
      .eq("prep_id", prepId)
      .order("created_at", { ascending: false })
      .limit(10),
    countPendingApplications(service),
  ]);

  await auditLog(service, {
    actorId: actor.id,
    action: "support.prep_viewed",
    entityType: "exam_prep",
    entityId: prepId,
    metadata: { userId },
  });

  const byNode = new Map<string, { count: number; open: number; last?: { score: number | null; total: number | null; at: string } }>();
  for (const row of attempts ?? []) {
    const id = row.node_id as string;
    const entry = byNode.get(id) ?? { count: 0, open: 0 };
    entry.count += 1;
    if (row.status !== "completed") entry.open += 1;
    else if (!entry.last) entry.last = { score: row.score as number | null, total: row.total as number | null, at: row.created_at as string };
    byNode.set(id, entry);
  }
  const done = (nodes ?? []).filter((node) => node.status === "done").length;

  return (
    <AdminShell href="/admin/kullanicilar" pendingApplications={pending}>
      <p className="text-sm">
        <Link href={`/admin/kullanicilar/${userId}`} className="underline">
          ← Kullanıcı
        </Link>
      </p>
      <AdminNote tone="info">
        Salt okunur destek görünümü. Ders metni, cevaplar ve belge içeriği gösterilmez; bu açılış denetim günlüğüne
        yazıldı.
      </AdminNote>

      <AdminCard
        title={(prep.title as string) || "Adsız hazırlık"}
        desc={`${(prep.exam_type as string) || "Sınav"} · sınav ${prep.exam_date ? formatDate(prep.exam_date as string) : "—"} · hedef ${
          prep.target_score ?? "—"
        } · ${done} / ${(nodes ?? []).length} adım bitti · kuruldu ${formatDate(prep.created_at as string)}`}
      >
        <div className="flex flex-wrap gap-1">
          {(topics ?? []).map((topic) => (
            <AdminBadge key={topic.label as string} tone={topic.status === "done" ? "ok" : "mute"}>
              {topic.label as string}
              {topic.familiarity ? ` · ${familiarityLabel(topic.familiarity as string)}` : ""}
            </AdminBadge>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="Çalışma yolu" desc="Sıra, tür, konu, durum, deneme sayısı (açık kayıt), son sonuç." bodyless>
        {nodes?.length ? (
          <AdminTableFrame columns={["#", "Tür", "Konu / başlık", "Durum", "Deneme", "Son sonuç"]}>
            {nodes.map((node, index) => {
              const entry = byNode.get(node.id as string);
              const meta = node.session_meta as { topicTitle?: string } | null;
              return (
                <tr key={node.id as string}>
                  <td className="adm-num">{index + 1}</td>
                  <td>{nodeKindLabel(node.kind as string)}</td>
                  <td className="text-xs">{meta?.topicTitle || (node.title as string)}</td>
                  <td>
                    <AdminBadge tone={node.status === "done" ? "ok" : node.status === "ready" ? "gold" : "mute"}>
                      {nodeStatusLabel(node.status as string)}
                    </AdminBadge>
                  </td>
                  <td className="adm-num">
                    {entry?.count ?? 0}
                    {entry?.open ? ` (${entry.open} açık)` : ""}
                  </td>
                  <td className="adm-num text-xs">
                    {entry?.last
                      ? `${entry.last.total ? `${entry.last.score ?? 0}/${entry.last.total} · ` : ""}${formatDate(entry.last.at)}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Yol yok">Bu hazırlıkta düğüm yok.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard title="Bu hazırlığın üretim hataları" desc="Takılı üretimi kapatıp iade etmek: /admin/ders-hatalari." bodyless>
        {failures?.length ? (
          <AdminTableFrame columns={["Zaman", "Tür", "Sebep", "Konu", "Ret cümleleri"]}>
            {failures.map((row, index) => (
              <tr key={`${row.created_at}-${index}`}>
                <td className="adm-num text-xs">{formatDate(row.created_at as string)}</td>
                <td>{nodeKindLabel(row.kind as string | null)}</td>
                <td>{failureReasonLabel(row.reason as string | null)}</td>
                <td className="text-xs">{(row.topic_label as string) ?? "—"}</td>
                <td className="text-xs">{((row.reasons as string[] | null) ?? []).slice(0, 2).join(" · ").slice(0, 220)}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Hata yok">Bu hazırlığa ait üretim hatası kaydı yok.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
