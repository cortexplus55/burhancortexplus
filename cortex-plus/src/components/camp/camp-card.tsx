import Link from "next/link";
import { campHeadline, type CampOffer } from "@/lib/camp/offer";
import { formatTryWhole } from "@/lib/format";

/** ⛺ Kamp modu kartı: tek sakin satır + mevcut Plus Haftalık bağlantısı (yeni ürün yok). */
export function CampCard({ offer }: { offer: CampOffer }) {
  return (
    <section className="lc-box camp-card" aria-label="Kamp modu" data-testid="camp-card">
      <p className="lc-kicker">⛺ Kamp modu</p>
      <p className="lc-q">{campHeadline(offer.daysLeft)}</p>
      <p className="lc-status">
        Son günlerdeki yoğun tekrar ve denemeler için Plus Haftalık
        {offer.weeklyKurus ? ` (${formatTryWhole(offer.weeklyKurus)} / 7 gün)` : ""} yeterli; aya bağlanman gerekmez.
      </p>
      <Link href={offer.href} className="lc-skip" data-testid="camp-link">
        Plus Haftalık’a bak
      </Link>
    </section>
  );
}
