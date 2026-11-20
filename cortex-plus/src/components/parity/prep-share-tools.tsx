"use client";

import { useState } from "react";
import Link from "next/link";
import { CRAM_SHEET_NAME, CRAM_SHEET_TITLE, examPrepCramSheetHref } from "@/lib/learning/cram-sheet";
import { PlusOnlyGate } from "@/components/parity/plus-only-gate";
import "@/styles/cram-sheet.css";

/**
 * Yolun altındaki sınav sabahı kâğıdı düğmesi (31 Ekim 2026, Paket J3 #14; tek dokunuş, yazdırılır).
 *
 * 20 Kasım 2026 (Faz 7): sınıf grubuyla paylaşım buradan kalktı; tek paylaşım girişi hazırlık sayfasının üst
 * simgelerindeki "📲 Sınıfla Paylaş" (`class-share-button.tsx`). İki ayrı paylaşım düğmesi aynı işi yapıyordu.
 *
 * 11 Kasım 2026 (ürün sahibinin kararı): sınav sabahı kâğıdı Plus'a özel. Ücretsiz hesapta düğme "Plus" rozeti
 * taşır ve yükseltme ekranını yerinde açar (sayfaya gidilmez); bağlantı adresi durur, sayfanın kendisi de kapıyı
 * gösterir (asıl karar sunucuda: `sinav-sabahi/page.tsx`).
 */
export function PrepShareTools({
  prepId,
  cramSheetLocked = false,
}: {
  prepId: string;
  /** Ücretsiz hesap: kâğıt Plus'ta. */
  cramSheetLocked?: boolean;
}) {
  const [gateOpen, setGateOpen] = useState(false);

  return (
    <section className="cp-prep-extras" aria-label="Sınav sabahı kâğıdı">
      <Link
        href={examPrepCramSheetHref(prepId)}
        className="cp-prep-extra"
        aria-label={cramSheetLocked ? `${CRAM_SHEET_NAME}, Plus'ta` : undefined}
        onClick={(event) => {
          if (!cramSheetLocked) return;
          event.preventDefault();
          setGateOpen(true);
        }}
      >
        {CRAM_SHEET_TITLE}
        {cramSheetLocked ? (
          <span className="cp-prep-extra-plus" data-testid="cram-sheet-plus" aria-hidden>
            Plus
          </span>
        ) : null}
      </Link>
      {cramSheetLocked ? (
        <PlusOnlyGate
          featureName={CRAM_SHEET_NAME}
          returnPath={examPrepCramSheetHref(prepId)}
          open={gateOpen}
          onClose={() => setGateOpen(false)}
        />
      ) : null}
    </section>
  );
}
