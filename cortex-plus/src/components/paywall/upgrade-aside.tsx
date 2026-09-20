import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import "@/styles/upgrade-gate.css";

/**
 * CONVERSION_PACK_UPGRADE
 * Sohbet yanındaki kalıcı yükseltme karti — yalnızca ücretsiz.
 * Fiyat sayfasıyla aynı dil: tek CTA, kısa fayda.
 */
export function UpgradeAside({ returnPath }: { returnPath?: string }) {
  const href = returnPath
    ? `/pay?returnTo=${encodeURIComponent(returnPath)}`
    : "/pay";

  return (
    <aside className="ug-aside" aria-label="Plus tanıtımı">
      <div className="ug-aside-brand">
        <CortexMark size={20} />
        <span>cortex</span>
        <span className="ug-aside-plus" aria-hidden>
          +
        </span>
      </div>
      <p className="ug-aside-title">Plus'a yükselt</p>
      <p className="ug-aside-blurb">
        Daha yüksek kullanım hakkı ve premium özellikler.
      </p>
      <Link href={href} className="ug-aside-cta">
        Plus'a geç
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </aside>
  );
}
