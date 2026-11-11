"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CRAM_SHEET_NAME, CRAM_SHEET_TITLE, examPrepCramSheetHref } from "@/lib/learning/cram-sheet";
import { PREP_SHARE_COPY_LABEL, PREP_SHARE_LABEL, PREP_SHARE_NOTE } from "@/lib/learning/prep-share";
import { ExternalAnchor } from "@/components/ui/external-anchor";
import { PlusOnlyGate } from "@/components/parity/plus-only-gate";
import "@/styles/cram-sheet.css";

/**
 * Hazırlık sayfasının iki düğmesi (31 Ekim 2026, Paket J3 #14): sınav sabahı kâğıdı (tek dokunuş, yazdırılır) ve
 * sınıf grubuyla paylaşım (WhatsApp; bağlantı sunucuda imzalanıp mutlak adresle gelir, kopyalama yedeği var).
 * İmza sırrı yoksa davet adresi gelmez ve paylaşım düğmesi görünmez.
 *
 * 11 Kasım 2026 (ürün sahibinin kararı): sınav sabahı kâğıdı Plus'a özel. Ücretsiz hesapta düğme "Plus" rozeti
 * taşır ve yükseltme ekranını yerinde açar (sayfaya gidilmez); bağlantı adresi durur, sayfanın kendisi de kapıyı
 * gösterir (asıl karar sunucuda: `sinav-sabahi/page.tsx`).
 */
export function PrepShareTools({
  prepId,
  inviteUrl,
  whatsappHref,
  cramSheetLocked = false,
}: {
  prepId: string;
  inviteUrl: string | null;
  whatsappHref: string | null;
  /** Ücretsiz hesap: kâğıt Plus'ta. */
  cramSheetLocked?: boolean;
}) {
  const [gateOpen, setGateOpen] = useState(false);
  async function copy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Davet bağlantısı kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı. Bağlantı: " + inviteUrl);
    }
  }

  return (
    <section className="cp-prep-extras" aria-label="Sınav sabahı ve paylaşım">
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
      {inviteUrl && whatsappHref ? (
        <>
          <ExternalAnchor href={whatsappHref} className="cp-prep-extra">
            {PREP_SHARE_LABEL}
          </ExternalAnchor>
          <div className="cp-prep-share-panel">
            <p className="cp-prep-share-note">{PREP_SHARE_NOTE}</p>
            <button type="button" className="cp-prep-share-copy" onClick={() => void copy()}>
              {PREP_SHARE_COPY_LABEL}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
