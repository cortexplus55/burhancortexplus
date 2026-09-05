import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { DailyDrillView } from "@/components/parity/daily-drill-view";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { getOrCreateDailyDrill } from "@/lib/learning/daily-drill";

export const metadata = { title: "Günün turu" };

export default async function GunlukPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const drill = await getOrCreateDailyDrill(supabase, user.id);

  return (
    <AstraParitySorShell {...shell}>
      {drill && drill.questions.length ? (
        <DailyDrillView
          drillId={drill.id}
          questions={drill.questions}
          answeredCount={drill.answeredCount}
          correctCount={drill.correctCount}
          completed={drill.completed}
        />
      ) : (
        <div className="ap-exam-page">
          <div className="ap-page-head">
            <h1 className="ap-page-title">Günün turu</h1>
          </div>
          <div className="astra-pay-card p-6 text-center">
            <p className="text-lg font-semibold text-[var(--astra-text)]">
              Bugün için soru yok.
            </p>
            {/* Turun kaynağı defter; defter boşsa uydurma soru üretmiyoruz.
                Bilmediğin şeyi ölçmeyen bir tur, alışkanlık değil zaman
                kaybı olurdu. */}
            <p className="mt-2 text-sm text-[var(--astra-muted)]">
              Günün turu yanlış defterinden soru çekiyor. Defterin boş olduğu
              için çekecek soru yok — bir deneme sınavı çöz, yanlışların
              deftere düşsün, tur yarın kendiliğinden dolsun.
            </p>
            <Link
              href="/deneme-sinavlari"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400"
            >
              Deneme çöz
            </Link>
          </div>
        </div>
      )}
    </AstraParitySorShell>
  );
}
