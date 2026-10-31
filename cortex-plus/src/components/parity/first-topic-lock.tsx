"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditGate } from "@/components/paywall/credit-gate";
import { firstTopicGate, type FirstTopicSummary } from "@/components/parity/exam-node/gates";

/**
 * Kilitli adımın beklemesiz kartı (Paket J takip #1, 1 Kasım 2026). Karar sunucuda verildi (`freeTopicGate`):
 * aşinalık sorusu, zorluk ekranı ve üretim isteği hiç açılmaz, sayaç harcanmaz. Kart kapanınca hazırlığa dönülür.
 */
export function FirstTopicLockCard({
  prepId,
  summary,
  open,
  onClose,
}: {
  prepId: string;
  summary: FirstTopicSummary | null;
  open: boolean;
  onClose: () => void;
}) {
  const gate = firstTopicGate(summary);
  return (
    <CreditGate
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      message={gate.message}
      beyondFreeDaily={gate.beyondFreeDaily}
      headline={gate.headline}
      wins={gate.wins}
      returnPath={`/deneme-sinavlari/${prepId}`}
    />
  );
}

/** Adım sayfasında: kart hemen açık, kapanınca hazırlık ana sayfası. */
export function FirstTopicLockPage({ prepId, summary }: { prepId: string; summary: FirstTopicSummary | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="cp-first-topic-lock" data-testid="first-topic-lock">
      <FirstTopicLockCard
        prepId={prepId}
        summary={summary}
        open={open}
        onClose={() => {
          setOpen(false);
          router.push(`/deneme-sinavlari/${prepId}`);
        }}
      />
    </div>
  );
}
