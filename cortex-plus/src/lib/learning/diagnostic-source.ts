import {
  allowedPrepDocumentIds,
  parseTopicSourceRefs,
} from "@/lib/learning/topic-source-refs";

/** Select the active chapter's source from documents already attached to the prep. */
export function diagnosticTopicSource(input: {
  primaryDocumentId: string | null;
  sourceDocumentIds: unknown;
  documentTopicNodeId: string | null;
  sourceRefs: unknown;
}): {
  documentId: string | null;
  nodeId: string | null;
  fromRef: boolean;
  allowedDocumentIds: Set<string>;
} {
  const allowedDocumentIds = allowedPrepDocumentIds({
    primaryDocumentId: input.primaryDocumentId,
    sourceDocumentIds: input.sourceDocumentIds,
  });
  for (const ref of parseTopicSourceRefs(input.sourceRefs)) {
    if (!allowedDocumentIds.has(ref.documentId)) continue;
    return {
      documentId: ref.documentId,
      nodeId:
        ref.nodeId ??
        (ref.documentId === input.primaryDocumentId
          ? input.documentTopicNodeId
          : null),
      fromRef: true,
      allowedDocumentIds,
    };
  }
  return {
    documentId: input.primaryDocumentId,
    nodeId: input.documentTopicNodeId,
    fromRef: false,
    allowedDocumentIds,
  };
}
