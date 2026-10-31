"use client";

import Link from "next/link";
import { toast } from "sonner";
import { CRAM_SHEET_TITLE, examPrepCramSheetHref } from "@/lib/learning/cram-sheet";
import { PREP_SHARE_COPY_LABEL, PREP_SHARE_LABEL, PREP_SHARE_NOTE } from "@/lib/learning/prep-share";
import "@/styles/cram-sheet.css";

/**
 * Hazırlık sayfasının iki düğmesi (31 Ekim 2026, Paket J3 #14): sınav sabahı kâğıdı (tek dokunuş, yazdırılır) ve
 * sınıf grubuyla paylaşım (WhatsApp; bağlantı sunucuda imzalanıp mutlak adresle gelir, kopyalama yedeği var).
 * İmza sırrı yoksa davet adresi gelmez ve paylaşım düğmesi görünmez.
 */
export function PrepShareTools({
  prepId,
  inviteUrl,
  whatsappHref,
}: {
  prepId: string;
  inviteUrl: string | null;
  whatsappHref: string | null;
}) {
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
      <Link href={examPrepCramSheetHref(prepId)} className="cp-prep-extra">
        {CRAM_SHEET_TITLE}
      </Link>
      {inviteUrl && whatsappHref ? (
        <>
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="cp-prep-extra">
            {PREP_SHARE_LABEL}
          </a>
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
