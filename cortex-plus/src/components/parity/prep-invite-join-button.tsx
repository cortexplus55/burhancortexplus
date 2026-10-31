"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";

export const PREP_INVITE_JOIN_URL = "/api/learning/exam-prep/invite/join";

/** "Hazırlığa katıl": kopyayı kurar ve öğrenciyi kendi hazırlığına götürür. Ücretsiz sınırda Plus'a yönlendirir. */
export function PrepInviteJoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [paywall, setPaywall] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    try {
      const res = await fetch(PREP_INVITE_JOIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && body.id) {
        router.push(examPrepHomeHref(body.id));
        return;
      }
      if (res.status === 402) setPaywall(body.error ?? "Ücretsiz hesapta bir hazırlık açılabilir.");
      else toast.error(body.error ?? "Katılım bu sefer tamamlanamadı. Yeniden dene.");
    } catch {
      toast.error("İnternet bağlantını kontrol edip yeniden dene.");
    }
    setBusy(false);
  }

  return (
    <div className="cp-exam-result-actions">
      <button type="button" className="cp-cram-go" disabled={busy} onClick={() => void join()}>
        {busy ? "Hazırlanıyor…" : "Hazırlığa katıl"}
      </button>
      {paywall ? (
        <p className="cp-exam-result-note" role="status">
          {paywall}{" "}
          <Link href="/pay" className="underline">
            Plus&apos;a bak
          </Link>
        </p>
      ) : null}
    </div>
  );
}
