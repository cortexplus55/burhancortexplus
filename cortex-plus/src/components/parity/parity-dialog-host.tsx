"use client";

import { Suspense, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProfileDialog, type ProfilePlanView } from "@/components/parity/profile-dialog";
import { SketchDialog } from "@/components/parity/sketch-dialog";
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

  const closeDialog = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("dialog");
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

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
