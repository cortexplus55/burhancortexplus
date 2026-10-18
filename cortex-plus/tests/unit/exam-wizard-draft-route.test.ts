import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Kurulum taslağının sunucu kopyası (18 Ekim 2026, plan 2.3). Uç tarayıcıdaki taslakla
  aynı süzgeci kullanır; boş taslak satırı siler; veritabanı cevap vermezse "yok" der.
*/
const db = vi.hoisted(() => ({
  row: null as { draft: unknown } | null,
  upserts: [] as Record<string, unknown>[],
  deletes: 0,
  selectError: null as { message: string } | null,
}));

const service = {
  from(table: string) {
    expect(table).toBe("exam_wizard_drafts");
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: db.row, error: db.selectError }),
      upsert: async (row: Record<string, unknown>) => {
        db.upserts.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async () => {
          db.deletes += 1;
          return { error: null };
        },
      }),
    };
    return builder;
  },
};

vi.mock("@/lib/api/guards", () => ({
  withUser: async () => ({ ok: true, ctx: { userId: "user-1", service } }),
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));

import { DELETE, GET, PUT } from "@/app/api/learning/exam-prep/draft/route";

const started = {
  v: 1,
  step: "material",
  subject: "Pediatri",
  examDate: "2026-10-25",
  target: 75,
  language: "tr",
  modality: "auto",
  equalFocus: true,
  focusTopics: [],
  materials: [{ id: "doc-1", fileName: "notlar.pdf", sizeBytes: 100, pageCount: 3 }],
  failedMaterials: [],
  processing: null,
  title: "",
  orderEdited: false,
  updatedAt: new Date().toISOString(),
};

const put = (body: unknown) =>
  PUT(
    new Request("http://local/api/learning/exam-prep/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("kurulum taslağı ucu", () => {
  beforeEach(() => {
    db.row = null;
    db.upserts = [];
    db.deletes = 0;
    db.selectError = null;
  });

  it("geçerli taslağı kullanıcının satırına yazar", async () => {
    const res = await put({ draft: started });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stored: true });
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0].user_id).toBe("user-1");
    expect((db.upserts[0].draft as { subject: string }).subject).toBe("Pediatri");
    expect(db.upserts[0].updated_at).toBe(started.updatedAt);
  });

  it("boş taslak satırı siler, yazmaz", async () => {
    const res = await put({ draft: { ...started, subject: "", materials: [], title: "" } });
    expect(await res.json()).toEqual({ ok: true, stored: false });
    expect(db.upserts).toHaveLength(0);
    expect(db.deletes).toBe(1);
  });

  it("bozuk, süresi dolmuş ya da aşırı büyük gövdeyi reddeder", async () => {
    expect((await put({ draft: { hello: 1 } })).status).toBe(400);
    expect((await put("{not json")).status).toBe(400);
    const stale = { ...started, updatedAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() };
    expect((await put({ draft: stale })).status).toBe(400);
    const huge = { ...started, title: "x".repeat(300 * 1024) };
    expect((await put({ draft: huge })).status).toBe(413);
    expect(db.upserts).toHaveLength(0);
  });

  it("okuma süzgeçten geçer; tablo cevap vermezse taslak yok sayılır", async () => {
    db.row = { draft: started };
    const ok = await GET(new Request("http://local/api/learning/exam-prep/draft"));
    expect(((await ok.json()) as { draft: { subject: string; step: string } }).draft.subject).toBe("Pediatri");

    db.row = { draft: { v: 2, subject: "eski" } };
    const bad = await GET(new Request("http://local/api/learning/exam-prep/draft"));
    expect((await bad.json()).draft).toBeNull();

    db.selectError = { message: 'relation "exam_wizard_drafts" does not exist' };
    const missing = await GET(new Request("http://local/api/learning/exam-prep/draft"));
    expect(missing.status).toBe(200);
    expect((await missing.json()).draft).toBeNull();
  });

  it("silme kullanıcının satırını kaldırır", async () => {
    const res = await DELETE(new Request("http://local/api/learning/exam-prep/draft", { method: "DELETE" }));
    expect(await res.json()).toEqual({ ok: true });
    expect(db.deletes).toBe(1);
  });

  it("göç: tablo kullanıcı başına tek satır, satır düzeyi güvenlik açık, yalnız kendi satırını okur", () => {
    const sql = readFileSync("supabase/migrations/20261018160000_exam_wizard_drafts.sql", "utf8");
    expect(sql).toContain("user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/FOR SELECT USING \(user_id = auth\.uid\(\)\)/);
    expect(sql).not.toMatch(/DROP /);
  });
});
