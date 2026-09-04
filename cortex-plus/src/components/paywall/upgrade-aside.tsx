import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import "@/styles/upgrade-gate.css";

/**
 * Sohbet kutusunun yanında duran kalıcı yükseltme kartı — yalnızca ücretsiz.
 *
 * Yazı alanının içine değil yanına konuyor: öğrencinin yazacağı yeri
 * daraltmayan, ama her açtığında gördüğü bir yer. Dar ekranda kutunun altına
 * iniyor, yan yana durursa yazı alanı kullanılamayacak kadar daralıyor.
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
      <p className="ug-aside-title">Cortex Plus&apos;a yükselt</p>
      <Link href={href} className="ug-aside-cta">
        Daha hızlı öğren
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </aside>
  );
}
