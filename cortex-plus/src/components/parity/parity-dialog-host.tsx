"use client";

import { Suspense, useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AstraProfileDialog, type ProfilePlanView } from "@/components/parity/astra-profile-dialog";
import { AstraSketchDialog } from "@/components/parity/astra-sketch-dialog";
import { AstraUploadModal } from "@/components/parity/astra-upload-modal";
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
      <AstraProfileDialog
        open={dialog === "profile"}
        onClose={closeDialog}
        plan={plan}
      />
      <AstraUploadModal
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
      <AstraSketchDialog open={dialog === "sketch"} onClose={closeDialog} />
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
