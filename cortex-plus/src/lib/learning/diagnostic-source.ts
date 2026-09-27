/** Select the active chapter's source from documents already attached to the prep. */
export function diagnosticTopicSource(input: {
  primaryDocumentId: string | null;
  sourceDocumentIds: unknown;
  documentTopicNodeId: string | null;
  sourceRefs: unknown;
}): { documentId: string | null; nodeId: string | null; fromRef: boolean; allowedDocumentIds: Set<string> } {
  const allowedDocumentIds = new Set<string>(
    [
      ...(Array.isArray(input.sourceDocumentIds) ? input.sourceDocumentIds : []),
      input.primaryDocumentId,
    ].filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const refs = Array.isArray(input.sourceRefs) ? input.sourceRefs : [];
  for (const ref of refs) {
    if (typeof ref !== "object" || ref === null) continue;
    const documentId = (ref as { documentId?: unknown }).documentId;
    if (typeof documentId !== "string" || !allowedDocumentIds.has(documentId)) continue;
    const nodeId = (ref as { nodeId?: unknown }).nodeId;
    return {
      documentId,
      nodeId: typeof nodeId === "string"
        ? nodeId
        : documentId === input.primaryDocumentId ? input.documentTopicNodeId : null,
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
