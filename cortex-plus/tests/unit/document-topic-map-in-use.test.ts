import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { documentTopicMapIsInUse } from "@/lib/documents/pdf-learning-v2";

describe("documentTopicMapIsInUse — source_refs koruması", () => {
  it("7) source_refs'te referanslı ikincil belge kullanımda sayılır", async () => {
    const containsCalls: unknown[][] = [];
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
          return {
            select: () => ({
              in: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
              contains: (...args: unknown[]) => {
                containsCalls.push(args);
                const filter = args[1] as Array<{ documentId?: string; nodeId?: string }>;
                const hitDoc = filter?.[0]?.documentId === "secondary-doc";
                const hitNode = filter?.[0]?.nodeId === "node-secondary";
                return {
                  limit: async () => ({
                    data: hitDoc || hitNode ? [{ id: "t1" }] : [],
                    error: null,
                  }),
                };
              },
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

    expect(containsCalls.some((call) => JSON.stringify(call).includes("secondary-doc"))).toBe(
      true,
    );
    expect(containsCalls.some((call) => JSON.stringify(call).includes("node-secondary"))).toBe(
      true,
    );
  });
});
