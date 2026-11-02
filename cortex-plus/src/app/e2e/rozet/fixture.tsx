"use client";

import { BadgeUnlockNotice } from "@/components/parity/badge-unlock-notice";

// Rozet duyurusu: /api/rozetler testte taklit edilir; Esc pencereyi kapatmalı.
export function RozetFixture() {
  return (
    <main className="cs-app cp-sor-root p-4">
      <p>Rozet duyurusu testi</p>
      <BadgeUnlockNotice onOpenBadges={() => undefined} />
    </main>
  );
}
