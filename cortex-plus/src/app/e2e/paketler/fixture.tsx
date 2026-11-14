"use client";

import { SubscriptionCards } from "@/components/parity/subscription-cards";

const PLANS = [
  { id: "plus-haftalik", name: "Sınav Haftası", description: null, price_try: 34900, credit_amount: 2700, is_premium: true, billing_period: "weekly", tier: "plus", period_days: 7 },
  { id: "plus-aylik", name: "Plus", description: null, price_try: 59900, credit_amount: 7200, is_premium: true, billing_period: "monthly", tier: "plus", period_days: 30 },
  { id: "sigma-aylik", name: "Sigma", description: null, price_try: 199900, credit_amount: 60000, is_premium: true, billing_period: "monthly", tier: "sigma", period_days: 30 },
];

export function PaketlerFixture() {
  return (
    <div id="planlar">
      <SubscriptionCards plans={PLANS} embedded headingLevel="h1" currentBadge={null} currentAllowance={0} checkoutEnabled />
    </div>
  );
}
