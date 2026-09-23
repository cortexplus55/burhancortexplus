import { describe, expect, it } from "vitest";
import {
  citationHref,
  citationsForReferences,
  type ChatEvidence,
} from "@/lib/ai/chat-citations";
import { chatSourceBlock } from "@/lib/learning/chat-source-block";
import {
  NO_SOURCE_MARKER,
  NO_SOURCE_MESSAGE,
  saidNoSource,
} from "@/lib/ai/grounding";

/**
 * Controlled document QA fixture (Aşama 10).
 * Page 7: deney grubu 42 hasta
 * Page 14: kontrol grubu 37 hasta
 * Üniversite adı belgede YOK.
 */
const FIXTURE_EVIDENCE: ChatEvidence[] = [
  {
    reference: 1,
    documentId: "doc-controlled-uat",
    documentName: "klinik-calisma.pdf",
    pageNumber: 7,
    chunkId: "chunk-p7",
    content:
      "Deney grubunda tam olarak 42 hasta bulunmaktadır. Ölçümler 12 hafta sürdürüldü.",
  },
  {
    reference: 2,
    documentId: "doc-controlled-uat",
    documentName: "klinik-calisma.pdf",
    pageNumber: 14,
    chunkId: "chunk-p14",
    content:
      "Kontrol grubu 37 hastadan oluşmaktadır. Takip süresi aynı tutulmuştur.",
  },
];

describe("controlled document fixture", () => {
  it("deney grubu sorusu için sayfa 7 citation üretir", () => {
    const citations = citationsForReferences(FIXTURE_EVIDENCE, [1]);
    expect(citations).toHaveLength(1);
    expect(citations[0].pageNumber).toBe(7);
    expect(citationHref(citations[0])).toContain("page=7");
    expect(citationHref(citations[0])).toContain("/dokumanlar/doc-controlled-uat");
  });

  it("kontrol grubu sorusu için sayfa 14 citation üretir", () => {
    const citations = citationsForReferences(FIXTURE_EVIDENCE, [2]);
    expect(citations[0].pageNumber).toBe(14);
    expect(citationHref(citations[0])).toContain("page=14");
  });

  it("belgede olmayan üniversite sorusunda only-document red verir", () => {
    const block = chatSourceBlock([], { documentsOnly: true });
    expect(block).toContain(NO_SOURCE_MARKER);
    expect(block).toContain(NO_SOURCE_MESSAGE);
    expect(saidNoSource(`${NO_SOURCE_MARKER} ${NO_SOURCE_MESSAGE}`)).toBe(true);
  });

  it("fixture metinleri benzersiz marker içerir", () => {
    expect(FIXTURE_EVIDENCE[0].content).toContain("42 hasta");
    expect(FIXTURE_EVIDENCE[1].content).toContain("37 hastadan");
    expect(
      FIXTURE_EVIDENCE.every((e) => !/üniversite/i.test(e.content)),
    ).toBe(true);
  });

  it("başka kullanıcının documentId'si citation listesinde sahte üretilmez", () => {
    const foreign: ChatEvidence[] = [
      {
        ...FIXTURE_EVIDENCE[0],
        documentId: "other-user-doc",
        reference: 99,
      },
    ];
    // Server only passes own evidence; filtering by reference never invents foreign ids.
    expect(citationsForReferences(FIXTURE_EVIDENCE, [99])).toHaveLength(0);
    expect(citationsForReferences(foreign, [1])).toHaveLength(0);
  });
});
