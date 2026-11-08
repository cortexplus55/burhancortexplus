"use client";

import { Suspense, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProfileDialog, type ProfilePlanView, type ProfileTabId } from "@/components/parity/profile-dialog";

/** `?sekme=` → pencerenin sekmesi (Ayarlar sayfasındaki satırlar doğru sekmeyi açar). */
const PROFILE_TABS: Record<string, ProfileTabId> = { hesap: "account", okul: "school", tercihler: "learning" };
import { SketchDialog } from "@/components/parity/sketch-dialog";
import { StarsDialog } from "@/components/parity/stars-dialog";
import { UploadModal } from "@/components/parity/upload-modal";
import {
  dispatchComposerAttach,
  type ComposerRemoteDoc,
} from "@/lib/student/composer-bridge";

function ParityDialogHostInner({
  onOpenMenu,
  plan,
}: {
  onOpenMenu?: () => void;
  plan?: ProfilePlanView | null;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const dialog = searchParams.get("dialog");
  const profileTab = PROFILE_TABS[searchParams.get("sekme") ?? ""] ?? "account";

  const closeDialog = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dialog");
    params.delete("sekme");
    const q = params.toString();
    // 8 Kasım 2026: pencere anında kapansın (router.replace sunucu çizimini bekliyor, × 2-3 sn açık kalıyordu);
    // pencerede kaydedilen ad, okul gibi bilgiler sayfaya arkadan tazelemeyle gelir.
    window.history.replaceState(null, "", q ? `${pathname}?${q}` : pathname);
    if (dialog === "profile") router.refresh();
  }, [dialog, pathname, router, searchParams]);

  useEffect(() => {
    if (dialog === "menu") {
      onOpenMenu?.();
    }
  }, [dialog, onOpenMenu]);

  return (
    <>
      <ProfileDialog
        open={dialog === "profile"}
        onClose={closeDialog}
        plan={plan}
        initialTab={profileTab}
        showAllSettingsLink={pathname !== "/ayarlar"}
      />
      <UploadModal
        open={dialog === "image_upload"}
        onClose={closeDialog}
        onPick={(file) => {
          dispatchComposerAttach({ type: "file", file });
          closeDialog();
        }}
        onRemote={(doc: ComposerRemoteDoc) => {
          dispatchComposerAttach({ type: "remote", doc });
          closeDialog();
        }}
      />
      <SketchDialog open={dialog === "sketch"} onClose={closeDialog} />
      <StarsDialog open={dialog === "stars"} onClose={closeDialog} />
    </>
  );
}

export function ParityDialogHost({
  onOpenMenu,
  plan,
}: {
  onOpenMenu?: () => void;
  plan?: ProfilePlanView | null;
} = {}) {
  return (
    <Suspense fallback={null}>
      <ParityDialogHostInner onOpenMenu={onOpenMenu} plan={plan} />
    </Suspense>
  );
}

export function MenuDialogUrlSync({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("dialog") === "menu") {
      onOpen();
    }
  }, [searchParams, onOpen]);
  return null;
}
