import Link from "next/link";
import { notFound } from "next/navigation";
import { Swords } from "lucide-react";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { NewDuelButton } from "@/components/duel/new-duel-button";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { DUEL_RULES } from "@/lib/learning/duel";
import "@/styles/duel.css";

export const metadata = { title: "Düellolar" };
export const dynamic = "force-dynamic";

/** Hazırlığın düelloları — Astra'daki "Düellolar" ekranı. */
export default async function PrepDuelsPage({ params }: { params: Promise<{ prepId: string }> }) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const { data: duels, error } = await supabase
    .from("prep_duels")
    .select("id, title, topic_label, share_code, created_at, prep_duel_runs(score)")
    .eq("exam_prep_id", prepId)
    .order("created_at", { ascending: false })
    .limit(20);

  const rows = (duels ?? []).map((duel) => {
    const runs = Array.isArray(duel.prep_duel_runs) ? (duel.prep_duel_runs as { score: number }[]) : [];
    return {
      code: duel.share_code as string,
      title: duel.title as string,
      topic: (duel.topic_label as string | null) ?? null,
      created: new Date(duel.created_at as string).toLocaleDateString("tr-TR", {
        timeZone: "Europe/Istanbul",
        day: "numeric",
        month: "long",
      }),
      plays: runs.length,
      best: runs.length ? Math.max(...runs.map((run) => run.score)) : null,
    };
  });

  return (
    <ParitySorShell {...shell} chrome="focus" backHref={`/deneme-sinavlari/${prepId}`}>
      <div className="cp-exam-page cp-duel-list">
        <header className="cp-duel-list-head">
          <h1>Düellolar</h1>
          <p>Aynı sorularda diğer öğrencileri yen ya da bir arkadaşına düello gönder.</p>
          <NewDuelButton prepId={prepId} />
        </header>

        <ol className="cp-duel-rules">
          {DUEL_RULES.map((rule, i) => (
            <li key={rule}>
              <b>{i + 1}</b>
              {rule}
            </li>
          ))}
        </ol>

        {error ? (
          <p className="cp-duel-muted">Düellolar şu an yüklenemedi.</p>
        ) : rows.length ? (
          <ul className="cp-duel-items">
            {rows.map((row) => (
              <li key={row.code}>
                <Link href={`/duello/${row.code}`} className="cp-duel-item">
                  <Swords className="h-5 w-5" aria-hidden />
                  <span>
                    <strong>{row.topic ?? row.title}</strong>
                    <em>
                      {row.created} · {row.plays} oyun
                      {row.best != null ? ` · en yüksek ${row.best}` : ""}
                    </em>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cp-duel-muted">
            Henüz düello yok. Bir tane başlat, sonucun diğerleri için bir düelloya dönüşür.
          </p>
        )}
      </div>
    </ParitySorShell>
  );
}
