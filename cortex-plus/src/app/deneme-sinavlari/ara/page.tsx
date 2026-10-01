import { ParitySorShell } from "@/components/parity/sor-shell";
import { PrepSearchView } from "@/components/parity/prep-search-view";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { mergeSearchRows, toSearchRows, type PrepSearchRow } from "@/lib/parity/prep-search";

export const metadata = { title: "Sınav hazırlıklarında ara" };
export const dynamic = "force-dynamic";

/**
 * Astra'daki "Sınav hazırlıklarında ara" (1 Ekim 2026): okulda paylaşılanlar
 * ve öğrencinin kendi hazırlıkları tek listede aranır.
 */
export default async function PrepSearchPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [sharedRes, { data: ownRows }, { data: profile }] = await Promise.all([
    supabase.rpc("school_feed_search", { p_limit: 200 }),
    supabase
      .from("exam_preps")
      .select("id, title, exam_type, view_count, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("profiles").select("school_id").eq("id", user.id).maybeSingle(),
  ]);

  // Fonksiyon yoksa (göç uygulanmadan önceki dağıtım) sayfa yine açılır,
  // yalnızca öğrencinin kendi hazırlıklarıyla.
  const shared = sharedRes.error ? [] : toSearchRows(sharedRes.data);
  const own: PrepSearchRow[] = (ownRows ?? []).map((row) => ({
    id: row.id as string,
    title: ((row.title as string | null) ?? "").trim() || ((row.exam_type as string | null) ?? "Sınav hazırlığı"),
    examType: (row.exam_type as string | null) ?? null,
    ownerName: "Sen",
    ownerKey: "me",
    isOwn: true,
    joinCount: Number(row.view_count ?? 0),
    topicCount: 0,
    createdAt: (row.created_at as string | null) ?? null,
  }));
  // Okul satırındaki kendi hazırlığı da "Sen" grubuna düşsün.
  const rows = mergeSearchRows(
    shared.map((row) => (row.isOwn ? { ...row, ownerKey: "me", ownerName: "Sen" } : row)),
    own,
  );

  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari">
      <PrepSearchView rows={rows} hasSchool={Boolean(profile?.school_id)} />
    </ParitySorShell>
  );
}
