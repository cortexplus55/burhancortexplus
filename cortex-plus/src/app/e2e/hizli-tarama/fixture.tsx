"use client";

import { GuestQuickScan } from "@/components/level-check/guest-quick-scan";
import { fakeLevelApi } from "../level-fake";

export function HizliTaramaFixture({ empty, signedIn = false }: { empty: boolean; signedIn?: boolean }) {
  return (
    <GuestQuickScan
      subjects={[{ key: "tyt-tarih", label: "TYT Tarih", unitIds: Array.from({ length: 11 }, (_, i) => `yks-2026-tarih#${i}`) }]}
      initialKey="tyt-tarih"
      nextHref="/deneme-sinavlari/resmi/kurulum?sinav=yks&alan=tyt"
      signedIn={signedIn}
      api={fakeLevelApi({ guest: true, empty })}
    />
  );
}
