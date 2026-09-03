import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { UygulamalarLabGrid } from "@/components/parity/uygulamalar-lab-client";
import { DailyPuzzleStrip } from "@/components/parity/daily-puzzle-strip";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { toStatMap } from "@/lib/parity/lab-stats";

export const metadata = { title: "Öğrenme uygulamaları" };

export default async function UygulamalarPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  // Toplu sayılar herkese görünür olmalı ama tekil oynanma satırları değil;
  // bu yüzden RLS'i aşan güvenlik-tanımlayıcı fonksiyondan okunuyor.
  const [{ data: stats }, { data: myDay }, { data: myApps }] = await Promise.all([
    supabase.rpc("lab_app_stats"),
    supabase.rpc("puzzle_my_day"),
    // RLS sahiplik filtresini yapıyor; ayrıca eq("user_id") gerekmiyor.
    supabase
      .from("user_apps")
      .select("id, title, description, visibility")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // Migration uygulanmamış ortamda RPC yok; şerit boş çözümle çizilir.
  const solved: Record<string, number> = {};
  for (const row of (myDay ?? []) as { puzzle_id: string; duration_ms: number }[]) {
    solved[row.puzzle_id] = row.duration_ms;
  }

  return (
    <AstraParitySorShell {...shell}>
      <DailyPuzzleStrip solved={solved} />
      <UygulamalarLabGrid stats={toStatMap(stats)} myApps={myApps ?? []} />
    </AstraParitySorShell>
  );
}
