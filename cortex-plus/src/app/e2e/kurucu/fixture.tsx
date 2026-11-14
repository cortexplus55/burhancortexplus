"use client";

import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { FounderBadge } from "@/components/student/founder-chip";
import { FounderCreditsView } from "@/components/student/founder-credits-view";
import { fixtureAccount } from "../ana-ekran/fixture";

/** Yalnız test fikstürü (E2E_FIXTURE=1). Sayfaların kurucu parçaları, kendi sınıflarıyla. */
export function KurucuFixture({ screen }: { screen: "krediler" | "ayarlar" | "pay" }) {
  return (
    <ParitySorShell userInitial="B" userName="Burhan" streak={1} account={fixtureAccount("founder")}>
      {screen === "krediler" ? (
        <FounderCreditsView
          summary={{ nominalTotal: 12840, count: 214, topAction: "Ders" }}
          recent={[]}
          failed={false}
        />
      ) : screen === "ayarlar" ? (
        <PageShell title="Ayarlar" width="read">
          <div className="cp-set-page">
            <section className="cp-set-hero" aria-label="Hesabın">
              <span className="cp-set-avatar" aria-hidden>
                B
              </span>
              <span className="cp-set-hero-text">
                <strong>Burhan</strong>
                <span>Mezun · Adana Cumhuriyet Anadolu Lisesi</span>
                <span className="cp-set-hero-plan">
                  <FounderBadge />
                </span>
              </span>
            </section>
          </div>
        </PageShell>
      ) : (
        <section className="cp-pay-founder" aria-label="Hesabının durumu">
          <FounderBadge />
          <h1>Bütün özellikler açık</h1>
        </section>
      )}
    </ParitySorShell>
  );
}
