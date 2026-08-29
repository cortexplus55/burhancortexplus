export type ComposerRemoteDoc = {
  documentId: string;
  fileName: string;
};

export type ComposerAttachHandlers = {
  attachFile: (file: File) => void;
  attachRemote: (doc: ComposerRemoteDoc) => void;
};

const COMPOSER_ATTACH_EVENT = "cortex-composer-attach";

type AttachDetail =
  | { type: "file"; file: File }
  | { type: "remote"; doc: ComposerRemoteDoc };

export function dispatchComposerAttach(detail: AttachDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMPOSER_ATTACH_EVENT, { detail }));
}

export function subscribeComposerAttach(
  handlers: ComposerAttachHandlers,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onEvent = (event: Event) => {
    const custom = event as CustomEvent<AttachDetail>;
    const detail = custom.detail;
    if (!detail) return;
    if (detail.type === "file") handlers.attachFile(detail.file);
    else handlers.attachRemote(detail.doc);
  };

  window.addEventListener(COMPOSER_ATTACH_EVENT, onEvent);
  return () => window.removeEventListener(COMPOSER_ATTACH_EVENT, onEvent);
}
