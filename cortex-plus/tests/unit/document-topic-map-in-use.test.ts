import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { documentTopicMapIsInUse } from "@/lib/documents/pdf-learning-v2";

describe("documentTopicMapIsInUse — source_refs koruması", () => {
  it("7) source_refs'te referanslı ikincil belge kullanımda sayılır", async () => {
    const service = {
      from: (table: string) => {
        if (table === "exam_preps") {
          return {
            select: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
              contains: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === "exam_prep_topics") {
          let call = 0;
          return {
            select: () => ({
              in: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
              not: () => ({
                limit: async () => {
                  call += 1;
                  return {
                    data: [
                      {
                        id: "t1",
                        source_refs: [
                          {
                            documentId: "secondary-doc",
                            nodeId: "node-secondary",
                            pages: [1, 2],
                          },
                        ],
                      },
                    ],
                    error: null,
                  };
                },
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        };
      },
    } as never;

    await expect(
      documentTopicMapIsInUse(service, "secondary-doc", ["node-other"]),
    ).resolves.toBe(true);

    await expect(
      documentTopicMapIsInUse(service, "unrelated-doc", ["node-secondary"]),
    ).resolves.toBe(true);
  });
});
