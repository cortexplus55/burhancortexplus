"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditGate } from "@/components/paywall/credit-gate";
import { beyondFreeMessage } from "@/lib/billing/free-reach";

/**
 * Plus'a özel sayfanın kapısı (11 Kasım 2026, ürün sahibinin kararı: sınav sabahı kâğıdı Plus'ta). Kredi işi
 * olmadığı için karar sunucuda sayfa düzeyinde verilir (`plusOnlyLocked`); bu bileşen yalnız var olan yükseltme
 * ekranını açar. Beklemek çözmez: geri sayım yok. Ödemeden sonra öğrenci `returnPath`e döner.
 */
export function PlusOnlyGate({
  featureName,
  returnPath,
  open,
  onClose,
}: {
  /** Kapı cümlesindeki ad ("Sınav sabahı kâğıdı"). */
  featureName: string;
  returnPath: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <CreditGate
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      message={beyondFreeMessage(featureName)}
      beyondFreeDaily
      isPremium={false}
      returnPath={returnPath}
    />
  );
}

/** Sayfanın yerine: kart hemen açık, kapanınca `exitHref` (kalıp `FirstTopicLockPage` ile aynı). */
export function PlusOnlyPage({ featureName, returnPath, exitHref }: { featureName: string; returnPath: string; exitHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="cp-first-topic-lock" data-testid="plus-only-gate">
      <PlusOnlyGate
        featureName={featureName}
        returnPath={returnPath}
        open={open}
        onClose={() => {
          setOpen(false);
          router.push(exitHref);
        }}
      />
    </div>
  );
}
