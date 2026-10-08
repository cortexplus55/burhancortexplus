"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setFreePreview } from "@/app/admin/free-preview-actions";

/**
 * "Ücretsiz gibi gör" düğmesi. Açınca öğrenci tarafına gider; kapatmak için
 * aynı düğme öğrenci ekranlarının üstündeki şeritte durur.
 */
export function FreePreviewToggle({
  on,
  className,
  label,
}: {
  on: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const toggle = () =>
    startTransition(async () => {
      setFailed(false);
      const result = await setFreePreview(!on).catch(() => ({ ok: false }));
      if (!result.ok) {
        setFailed(true);
        return;
      }
      if (!on) router.push("/dashboard");
      else router.refresh();
    });

  return (
    <>
      <button type="button" className={className} onClick={toggle} disabled={pending}>
        {pending ? "Bekle…" : (label ?? (on ? "Önizlemeyi kapat" : "Ücretsiz gibi gör"))}
      </button>
      {failed ? <span role="alert"> Olmadı, yeniden dene.</span> : null}
    </>
  );
}
