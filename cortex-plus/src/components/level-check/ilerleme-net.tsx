import Link from "next/link";
import { SectionCard } from "@/components/ui-kit/empty-state";
import { NetCard } from "@/components/level-check/mastery-map";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import type { NetEstimate } from "@/lib/mastery-map/net";

/** /ilerleme "Tahmini Sınav Netin" bölümü (sayfa ve e2e fikstürü aynı bileşeni çizer). */
export function IlerlemeNetSection({ prepNet }: { prepNet: { prepId: string; title: string; net: NetEstimate } }) {
  return (
    <SectionCard title="Tahmini sınav netin" description={`${prepNet.title} · Hakimiyet Haritası yanıtlarından.`}>
      <div className="lc-box mm" data-testid="ilerleme-net">
        <NetCard net={prepNet.net} />
      </div>
      <Link href={examPrepHomeHref(prepNet.prepId)} className="mt-4 inline-flex text-sm font-semibold text-[var(--cs-primary)]">
        {"Hakimiyet Haritası'na git →"}
      </Link>
    </SectionCard>
  );
}
