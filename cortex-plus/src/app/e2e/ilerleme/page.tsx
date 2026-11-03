import { notFound } from "next/navigation";
import { ActivityHistory } from "@/components/student/activity-history";
import { LearningTimeCard } from "@/components/student/learning-time-card";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { IlerlemeNetSection } from "@/components/level-check/ilerleme-net";
import { estimateGainOnly } from "@/lib/mastery-map/net";

export const dynamic = "force-dynamic";

// /ilerleme kartları (giriş gerektirmeden): 320 px taşma ve tasarruf satırı kontrolü.
export default function E2eIlerlemePage() {
  if (process.env.E2E_FIXTURE !== "1") notFound();
  const today = "2026-11-02";
  const rows = Array.from({ length: 7 }, (_, i) => ({
    activity_date: `2026-10-${String(27 + i > 31 ? 0 : 27 + i).padStart(2, "0")}`,
    subject: "Matematik",
    seconds: 600 * (i + 1),
  })).filter((row) => !row.activity_date.endsWith("-00"));
  const stamps = Array.from({ length: 300 }, (_, i) => new Date(Date.UTC(2026, 10, 2) - i * 86400000).toISOString());
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <IlerlemeNetSection
        prepNet={{
          prepId: "11111111-1111-1111-1111-111111111111",
          title: "KPSS Tarih",
          net: estimateGainOnly([{ unitId: "u1", title: "Kök Türkler", subjectKey: "", outcomes: [{ state: { alpha: 1, beta: 4, n: 3 } }, { state: { alpha: 2, beta: 3, n: 3 } }] }]),
        }}
      />
      <LearningTimeCard rows={rows} today={today} />
      <SectionCard title="Çalışma geçmişin" description="Bitirdiğin dersler, testler ve denemeler.">
        <ActivityHistory timestamps={stamps} />
      </SectionCard>
    </main>
  );
}
