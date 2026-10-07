/**
 * Word and PowerPoint notes get a topic map through the ONE course pipeline
 * (process route → course round → grounding → persist). A one-page note has
 * no "rare" words, and Turkish endings ("Termodinamiğin … Yasası") must still
 * match the page ("Termodinamik", "Birinci yasa").
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractOfficeText } from "@/lib/documents/extract-office-text";
import { makeFakeDb } from "./helpers/fake-supabase";
import { model, processRequest, routeTables, titledOutline } from "./helpers/outline-model-mock";

vi.mock("@/lib/ai/generate", async () => (await import("./helpers/outline-model-mock")).generateModule());
vi.mock("@/lib/env", async () => (await import("./helpers/outline-model-mock")).outlineEnv);
vi.mock("next/server", async (importOriginal) =>
  (await import("./helpers/outline-model-mock")).nextServerModule(importOriginal),
);
const route = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/api/guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/guards")>();
  return { ...actual, withUser: async () => ({ ok: true, ctx: { userId: "u1", service: route.service } }) };
});
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/feature-flags")>();
  return { ...actual, isFeatureEnabled: async () => true };
});

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function officeDb(file: string, mime: string) {
  const extracted = extractOfficeText(readFileSync(`tests/fixtures/office/${file}`), mime);
  expect(extracted.ok).toBe(true);
  const fake = makeFakeDb(routeTables([{ id: ID, name: file, pages: extracted.pages, mime }]), { creditCost: 3 });
  route.service = fake.client;
  return fake;
}

async function mapUntilDone() {
  const { POST } = await import("@/app/api/documents/process/route");
  let res = await POST(processRequest({ documentId: ID }));
  for (let i = 0; i < 6 && res.status === 202; i += 1) res = await POST(processRequest({ documentId: ID }));
  return res;
}

beforeEach(() => {
  model.calls.length = 0;
});

describe("office documents through the course pipeline", () => {
  const cases: [string, string, string][] = [
    ["ornek-ders.docx", DOCX, "Termodinamiğin Birinci Yasası ve İç Enerji"],
    ["ornek-ders.docx", DOCX, "Termodinamiğin Birinci Yasası"],
    ["ornek-slayt.pptx", PPTX, "Termodinamiğin İkinci Yasası"],
    ["ornek-slayt.pptx", PPTX, "İkinci Yasa ve Entropinin Artışı"],
  ];
  for (const [file, mime, title] of cases) {
    it(`${file}: "${title}" reaches a ready map in one call, charged once`, async () => {
      const fake = officeDb(file, mime);
      model.impl = () => titledOutline([[title, 1, 1]]);
      const res = await mapUntilDone();
      expect(res.status).toBe(200);
      expect(model.calls).toHaveLength(1);
      expect(model.calls[0]!.model).toBe("gpt-4o-mini");
      expect(model.calls[0]!.prompt).toContain("[d1 s.1]");
      expect(fake.db.tables.documents![0]).toMatchObject({ status: "completed", topic_map_status: "ready" });
      expect(fake.db.tables.document_topic_nodes!.filter((n: any) => n.parent_id).map((n: any) => n.title)).toEqual([title]);
      expect(fake.reservations().filter((r: any) => r.action_code === "STUDY_PLAN_GENERATE" && r.status === "committed")).toHaveLength(1);
    });
  }

  it("an invented topic on a one-page note is still rejected (no fabricated map)", async () => {
    const fake = officeDb("ornek-ders.docx", DOCX);
    model.impl = () => titledOutline([["Fotosentez ve Hücre Solunumu", 1, 1]]);
    const res = await mapUntilDone();
    expect(res.status).toBe(422);
    expect(fake.db.tables.document_topic_nodes).toHaveLength(0);
    expect(fake.db.tables.documents![0]).toMatchObject({ topic_map_status: "failed" });
    expect(fake.chargedCredits("u1")).toBe(0);
  });
});
