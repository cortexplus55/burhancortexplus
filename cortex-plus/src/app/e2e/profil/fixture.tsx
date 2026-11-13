"use client";

import { PageShell } from "@/components/parity/page-shell";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ProfileCard } from "@/components/parity/profile-identity";
import { planIdentity } from "@/lib/student/plan-identity";
import { formatDate } from "@/lib/format";
import { fixtureAccount } from "../ana-ekran/fixture";
import type { FixturePlan } from "../ana-ekran/plan";

/** Yalnız test fikstürü (E2E_FIXTURE=1). */
export function ProfilFixture({ plan }: { plan: FixturePlan }) {
  const account = fixtureAccount(plan);
  return (
    <ParitySorShell userInitial="Ö" userName="Öğrenci" streak={4} account={account}>
      <PageShell width="read">
        <ProfileCard
          name="Öğrenci"
          initial="Ö"
          identity={planIdentity(account)}
          heading="h1"
          periodEndLabel={account.subscriptionPeriodEnd ? formatDate(account.subscriptionPeriodEnd) : null}
          data={{
            dashboard: {
              fullName: "Öğrenci",
              schoolName: "Atatürk Anadolu Lisesi",
              gradeLevel: "12. sınıf",
              currentStreak: 4,
              longestStreak: 11,
              week: [],
              upcomingEvents: 2,
              avatarEmoji: null,
            },
            stars: 128,
          }}
        />
      </PageShell>
    </ParitySorShell>
  );
}
