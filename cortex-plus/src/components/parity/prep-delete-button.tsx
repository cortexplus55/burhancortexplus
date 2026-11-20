"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

/*
  Hazırlığı sil (21 Kasım 2026, ürün sahibinin isteği): silme yalnız hazırlık sayfasının Seçenekler → Ayarlar sekmesinin
  en altındaydı, öğrenci bulamıyordu. Şimdi Sınavlar kartında, hazırlık sayfasının Seçenekler listesinde ve Ayarlar'da
  aynı bileşen. Geri alınamaz olduğu için her yerde aynı onay penceresi (`ConfirmDialog`: odak "Vazgeç"te açılır, Escape
  kapatır, sürerken kapanmaz). Silme sunucuda `delete_exam_prep` (sahiplik orada denetlenir; belgeler kalır).
  Ücretsiz hesabın ilk ders uyarısı pencere açılınca bir kez sorulur (`/api/learning/exam-prep/delete-note`): sayfa
  açılışında okunsaydı hazırlık sayfasının sorgu bütçesini aşıyordu (`page-query-budget.test.ts`).
*/

export const PREP_DELETE_COPY = {
  trigger: "Hazırlığı sil",
  title: "Hazırlık silinsin mi?",
  confirm: "Evet, kalıcı olarak sil",
  pending: "Siliniyor…",
  /** Ücretsiz hesap süresiz ilk dersini kullandıysa: yeni hazırlıkta ders Plus ister (`first-lesson-cycle.ts`). */
  freeLessonNote: "Ücretsiz hesabındaki süresiz ilk dersi kullandın; yeni kuracağın hazırlıkta dersler Plus ile açılır.",
  failed: "Hazırlık silinemedi. Lütfen tekrar dene.",
} as const;

export function prepDeleteDescription(title: string): string {
  const name = title.trim() || "Bu hazırlık";
  return (
    `«${name}» hazırlığının yolu, konuları, dersleri, testleri, podcast ve videoları, yazılı denemeleri ve ilerlemesi ` +
    "kalıcı olarak silinir. Bu işlem geri alınamaz. Yüklediğin belgeler Belgelerim'de kalır."
  );
}

export function PrepDeleteButton({
  prepId,
  title,
  variant,
  redirectTo,
  className,
}: {
  prepId: string;
  title: string;
  /** "icon": kartın köşesinde simge düğme; "row": liste satırı (Seçenekler); "text": Ayarlar'daki yazılı düğme. */
  variant: "icon" | "row" | "text";
  /** Silinince gidilecek sayfa (hazırlığın kendi sayfasındaysa). Verilmezse bulunulan sayfa yenilenir. */
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  /** null: henüz sorulmadı; pencere ilk açılışta bir kez sorar. */
  const [freeLessonUsed, setFreeLessonUsed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!confirming || freeLessonUsed !== null) return;
    let cancelled = false;
    fetch("/api/learning/exam-prep/delete-note")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { freeLessonUsed?: unknown } | null) => {
        if (!cancelled) setFreeLessonUsed(body?.freeLessonUsed === true);
      })
      .catch(() => {
        if (!cancelled) setFreeLessonUsed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [confirming, freeLessonUsed]);

  function remove() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/learning/exam-prep/details", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prepId }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setConfirming(false);
        toast.success(`«${title.trim() || "Hazırlık"}» silindi.`);
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      } catch {
        toast.error(PREP_DELETE_COPY.failed);
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          variant === "icon" && "cp-prep-card-delete cx-glass",
          variant === "row" && "cp-prep-sheet-danger",
          variant === "text" && "cp-prep-basics-delete",
          className,
        )}
        aria-haspopup="dialog"
        aria-label={variant === "icon" ? `${PREP_DELETE_COPY.trigger}: ${title}` : undefined}
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {variant === "icon" ? null : PREP_DELETE_COPY.trigger}
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={PREP_DELETE_COPY.title}
        description={
          <>
            <span className="cx-confirm-line">{prepDeleteDescription(title)}</span>
            <span className="cx-confirm-line cx-confirm-note" aria-live="polite">
              {freeLessonUsed ? PREP_DELETE_COPY.freeLessonNote : null}
            </span>
          </>
        }
        confirmLabel={PREP_DELETE_COPY.confirm}
        pendingLabel={PREP_DELETE_COPY.pending}
        pending={pending}
        onConfirm={remove}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
