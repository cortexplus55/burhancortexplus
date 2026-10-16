import { ParitySorShell } from "@/components/parity/sor-shell";
import { SchoolPrepsPage } from "@/components/parity/exam-catalog-pages";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { toFeedRows, toSummary } from "@/lib/parity/school-feed";

export const metadata = { title: "Okulum" };
export const dynamic = "force-dynamic";

/** Sınavlar → OKULUM kutusu (Astra'da ayrı sayfa, 17 Ekim 2026). */
export default async function SchoolPrepsRoute() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const [{ data: profile }, summaryRes, feedRes] = await Promise.all([
    supabase.from("profiles").select("school_name").eq("id", user.id).maybeSingle(),
    // Okul ağı RPC'leri yoksa sayfa çökmesin; boş akış "okulunu seç" hâlini gösterir.
    supabase.rpc("school_summary"),
    supabase.rpc("school_feed", { p_limit: 30 }),
  ]);
  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari">
      <SchoolPrepsPage
        initialSchoolName={(profile?.school_name as string | null) ?? ""}
        summary={toSummary(summaryRes.data)}
        rows={toFeedRows(feedRes.data)}
      />
    </ParitySorShell>
  );
}
