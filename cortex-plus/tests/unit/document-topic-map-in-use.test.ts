import { describe, expect, it, vi } from "vitest";
import { PostgrestClient } from "@supabase/postgrest-js";

vi.mock("server-only", () => ({}));

import { documentTopicMapIsInUse } from "@/lib/documents/pdf-learning-v2";

describe("documentTopicMapIsInUse — jsonb cs filtresi", () => {
  it("postgrest-js: nesne [object Object] üretir; JSON string doğru cs üretir", () => {
    const client = new PostgrestClient("http://example.test");
    const broken = client
      .from("exam_prep_topics")
      .select("id")
      .contains("source_refs", [{ documentId: "abc" }] as never)
      .limit(1);
    const fixed = client
      .from("exam_prep_topics")
      .select("id")
      .contains("source_refs", JSON.stringify([{ documentId: "abc" }]))
      .limit(1);

    const brokenUrl = String((broken as unknown as { url: URL }).url.href);
    const fixedUrl = String((fixed as unknown as { url: URL }).url.href);
    expect(brokenUrl).toContain("cs.%7B%5Bobject+Object%5D%7D");
    expect(decodeURIComponent(fixedUrl.replace(/\+/g, " "))).toContain(
      'cs.[{"documentId":"abc"}]',
    );
    expect(fixedUrl).not.toContain("object+Object");
    expect(fixedUrl).not.toContain("[object");
  });

  it("çağrı JSON.stringify ile gider; lookup hatası kullanımda sayılır (throw yok)", async () => {
    const containsArgs: unknown[] = [];
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
              contains: (col: string, value: unknown) => {
                containsArgs.push({ col, value });
                return {
                  limit: async () => ({
                    data: [],
                    error: { message: "invalid input syntax for type json", code: "22P02" },
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

    // Hata fırlatmaz; güvenli tarafta "in use" döner.
    await expect(
      documentTopicMapIsInUse(service, "doc-unused", ["node-1"]),
    ).resolves.toBe(true);

    expect(containsArgs.length).toBeGreaterThan(0);
    for (const arg of containsArgs) {
      const value = (arg as { value: unknown }).value;
      expect(typeof value).toBe("string");
      expect(value as string).not.toContain("[object Object]");
      JSON.parse(value as string);
    }
  });

  it("source_refs belgede eşleşince true", async () => {
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
              contains: (_col: string, value: unknown) => {
                const parsed = JSON.parse(String(value)) as Array<{
                  documentId?: string;
                  nodeId?: string;
                }>;
                const hit = parsed.some((row) => row.documentId === "secondary-doc");
                return {
                  limit: async () => ({
                    data: hit ? [{ id: "t1" }] : [],
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
      documentTopicMapIsInUse(service, "secondary-doc", []),
    ).resolves.toBe(true);
    await expect(
      documentTopicMapIsInUse(service, "unrelated-doc", []),
    ).resolves.toBe(false);
  });
});
