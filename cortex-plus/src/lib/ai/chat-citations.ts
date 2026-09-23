export type ChatCitation = {
  reference: number;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  chunkId: string | null;
};
export type ChatEvidence = ChatCitation & { content: string };

export function citationHref(citation: ChatCitation) {
  return `/dokumanlar/${encodeURIComponent(citation.documentId)}${citation.pageNumber ? `?page=${citation.pageNumber}` : ""}#belge-onizleme`;
}

/** Only metadata selected by the server's retrieval layer reaches the UI. */
export function citationsForReferences(evidence: ChatEvidence[], references: number[]): ChatCitation[] {
  return evidence.filter((s) => references.includes(s.reference)).map(({ content: _content, ...citation }) => citation);
}
