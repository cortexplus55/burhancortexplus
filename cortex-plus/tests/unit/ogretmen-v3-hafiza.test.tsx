// @vitest-environment jsdom
/**
 * Öğretmen v3 (teacher.v2, 21 Kasım 2026, ürün sahibinin onayı): "kaldığın yerden" açılışı (karşılama kartları ucunun
 * `resume` alanı) ve "Öğretmenin seni nasıl tanıyor" (not listesi / silme ucu + Ayarlar kartı). Modelsiz; yalnız
 * öğrencinin kendi satırları; bayrak kapalıyken 404 ve kart görünmez. Örnekler sentetik (zeltron, varnik).
 */
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), message: vi.fn() }) }));

const guard = vi.hoisted(() => ({ withUser: vi.fn() }));
const flags = vi.hoisted(() => ({ isFeatureEnabled: vi.fn() }));
const context = vi.hoisted(() => ({ forgetTutorContext: vi.fn(), buildTutorStudentContext: vi.fn() }));

vi.mock("@/lib/api/guards", async () => {
  const { NextResponse } = await import("next/server");
  return {
    withUser: guard.withUser,
    errorResponse: (status: number, error: string) => NextResponse.json({ error }, { status }),
  };
});
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/feature-flags")>()),
  isFeatureEnabled: flags.isFeatureEnabled,
}));
vi.mock("@/lib/tutor/student-context", () => ({
  forgetTutorContext: context.forgetTutorContext,
  buildTutorStudentContext: context.buildTutorStudentContext,
}));

const { composeResume, dayPhrase, loadTutorResume, resumeTopic, RESUME_DAYS } = await import("@/lib/tutor/resume-line");
const { GET: startCards } = await import("@/app/api/teacher/start-cards/route");
const memoryRoute = await import("@/app/api/teacher/memory-notes/route");
const { TutorMemoryCard } = await import("@/components/settings/tutor-memory-card");
const { TUTOR_MEMORY_COPY, TUTOR_NOTE_KIND_LABEL, parseTutorMemoryNotes } = await import("@/lib/tutor/memory-notes-view");
const { NOTES_LIST_LIMIT } = await import("@/lib/tutor/memory-notes");
const { toast } = await import("sonner");

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const USER = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NOW = new Date("2026-11-21T12:00:00Z");

type Call = { table: string; ops: string[] };
function fakeService(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const proxy: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(respond(call)).then(resolve);
            return (...args: unknown[]) => {
              call.ops.push(`${prop}:${JSON.stringify(args[0] ?? null)}${args[1] !== undefined ? JSON.stringify(args[1]) : ""}`);
              return proxy;
            };
          },
        },
      );
      return proxy;
    },
  };
}

const ops = (call: Call | undefined) => (call?.ops ?? []).join(" ");

beforeEach(() => {
  guard.withUser.mockReset();
  flags.isFeatureEnabled.mockReset();
  context.forgetTutorContext.mockReset();
  context.buildTutorStudentContext.mockReset();
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("kaldığın yerden açılışı (modelsiz, kayıttan)", () => {
  const yesterday = "2026-11-20T15:00:00Z";

  it("en yeni konuşmanın başlığı: gün dili İstanbul günüyle, emoji ve kazanım kodu yok", () => {
    const resume = composeResume({
      conversations: [{ id: "c1", title: "Zeltron Kuralları 📐", updatedAt: yesterday }],
      stuckNote: null,
      now: NOW,
    });
    expect(resume).toEqual({
      line: "Dün «Zeltron Kuralları» konusunda kalmıştık, oradan devam edelim mi?",
      prompt: "Geçen sefer kaldığımız yerden devam edelim: Zeltron Kuralları.",
      conversationId: "c1",
    });
    expect(resumeTopic("T.O.5.5 Varnik Döngüsü")).toBe("Varnik Döngüsü");
    expect(resumeTopic("[Fizik] Zeltron dalgası nedir?")).toBe("Zeltron dalgası nedir");
    expect(dayPhrase(0)).toBe("Bugün");
    expect(dayPhrase(3)).toBe("3 gün önce");
    // İstanbul günü: UTC 21:30 (İstanbul'da ertesi gün 00:30) "bugün" sayılır.
    expect(
      composeResume({ conversations: [{ id: "c2", title: "Varnik", updatedAt: "2026-11-20T21:30:00Z" }], stuckNote: null, now: NOW })!.line,
    ).toMatch(/^Bugün /);
  });

  it("varsayılan başlık konu sayılmaz; o zaman en yeni takıldığı nokta notu", () => {
    const resume = composeResume({
      conversations: [{ id: "c1", title: "Yeni sohbet", updatedAt: yesterday }],
      stuckNote: { note: "Varnik adımında işaret kuralını karıştırıyor.", createdAt: "2026-11-18T09:00:00Z", conversationId: "c9" },
      now: NOW,
    });
    expect(resume).toEqual({
      line: "3 gün önce şunu not etmiştim: «Varnik adımında işaret kuralını karıştırıyor». Oradan devam edelim mi?",
      prompt: "Geçen sefer kaldığımız yerden devam edelim: Varnik adımında işaret kuralını karıştırıyor.",
      conversationId: "c9",
    });
  });

  it("kayıt yoksa ya da 7 günden eskiyse null (uydurma yok); hassas not kullanılmaz", () => {
    expect(composeResume({ conversations: [], stuckNote: null, now: NOW })).toBeNull();
    const old = new Date(NOW.getTime() - (RESUME_DAYS + 2) * 86_400_000).toISOString();
    expect(composeResume({ conversations: [{ id: "c1", title: "Zeltron", updatedAt: old }], stuckNote: null, now: NOW })).toBeNull();
    expect(composeResume({ conversations: [], stuckNote: { note: "Annesi her gün soruyor", createdAt: yesterday, conversationId: null }, now: NOW })).toBeNull();
  });

  it("yükleyici: iki sınırlı okuma, öğrencinin user_id'siyle; not tablosu yoksa konuşmadan kurulur", async () => {
    const service = fakeService((call) =>
      call.table === "conversations"
        ? { data: [{ id: "c1", title: "Zeltron Kuralları", updated_at: yesterday }], error: null }
        : { data: null, error: { code: "42P01", message: "relation does not exist" } },
    );
    const resume = await loadTutorResume(service as never, USER, NOW);
    expect(resume?.conversationId).toBe("c1");
    const conversations = service.calls.find((call) => call.table === "conversations");
    expect(ops(conversations)).toContain(`eq:"user_id""${USER}"`);
    expect(ops(conversations)).toContain("limit:5");
    expect(ops(conversations)).toContain("gte:");
    const notes = service.calls.find((call) => call.table === "tutor_memory_notes");
    expect(ops(notes)).toContain(`eq:"user_id""${USER}"`);
    expect(ops(notes)).toContain(`eq:"kind""stuck"`);
    expect(ops(notes)).toContain("limit:1");
    expect(read("src/lib/tutor/resume-line.ts")).not.toMatch(/openai|chat\.completions|\.insert\(|\.update\(|\.delete\(/);
  });

  it("karşılama kartları ucu resume alanını ekler; kartlar ve empty aynen; bayrak kapalıyken 404", async () => {
    const service = fakeService(() => ({ data: [], error: null }));
    guard.withUser.mockResolvedValue({ ok: true, ctx: { userId: USER, service } });
    context.buildTutorStudentContext.mockResolvedValue({ cards: [{ id: "photo" }], empty: true, promptBlock: "", signals: {} });
    flags.isFeatureEnabled.mockResolvedValue(true);
    const response = await startCards(new Request("http://x/api/teacher/start-cards"));
    expect(await response.json()).toEqual({ cards: [{ id: "photo" }], empty: true, resume: null });
    flags.isFeatureEnabled.mockResolvedValue(false);
    expect((await startCards(new Request("http://x/api/teacher/start-cards"))).status).toBe(404);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("öğretmen notları ucu (liste ve silme)", () => {
  const rows = [
    { id: NOTE_ID, note: "Kısa adımlarla ilerlemeyi tercih ediyor", kind: "preference", created_at: "2026-11-20T10:00:00Z" },
    { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", note: "Varnik döngüsünde takılıyor", kind: "bilinmeyen", created_at: "2026-11-19T10:00:00Z" },
  ];

  function setup(respond: (call: Call) => unknown, on = true) {
    const service = fakeService(respond);
    guard.withUser.mockResolvedValue({ ok: true, ctx: { userId: USER, service } });
    flags.isFeatureEnabled.mockResolvedValue(on);
    return service;
  }
  const del = (body: unknown) =>
    new Request("http://x/api/teacher/memory-notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("GET: son 20 not, yalnız kendi satırları; bilinmeyen tür 'takıldığı nokta'; tablo yoksa boş liste", async () => {
    const service = setup(() => ({ data: rows, error: null }));
    const response = await memoryRoute.GET(new Request("http://x/api/teacher/memory-notes"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.notes).toEqual([
      { id: NOTE_ID, note: "Kısa adımlarla ilerlemeyi tercih ediyor", kind: "preference", createdAt: "2026-11-20T10:00:00Z" },
      { id: rows[1]!.id, note: "Varnik döngüsünde takılıyor", kind: "stuck", createdAt: "2026-11-19T10:00:00Z" },
    ]);
    expect(ops(service.calls[0])).toContain(`eq:"user_id""${USER}"`);
    expect(ops(service.calls[0])).toContain(`limit:${NOTES_LIST_LIMIT}`);
    setup(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    expect(await (await memoryRoute.GET(new Request("http://x/api/teacher/memory-notes"))).json()).toEqual({ notes: [] });
    setup(() => ({ data: null, error: { code: "500", message: "down" } }));
    expect((await memoryRoute.GET(new Request("http://x/api/teacher/memory-notes"))).status).toBe(503);
  });

  it("bayrak kapalıyken iki yöntem de 404; okuma/silme yok", async () => {
    const service = setup(() => ({ data: rows, error: null }), false);
    expect((await memoryRoute.GET(new Request("http://x/api/teacher/memory-notes"))).status).toBe(404);
    expect((await memoryRoute.DELETE(del({ all: true }))).status).toBe(404);
    expect(service.calls).toHaveLength(0);
  });

  it("DELETE: tek not ({ id }) ya da hepsi ({ all: true }); user_id süzgeci; sonra bağlam önbelleği düşer", async () => {
    const one = setup(() => ({ data: [{ id: NOTE_ID }], error: null }));
    const response = await memoryRoute.DELETE(del({ id: NOTE_ID }));
    expect(await response.json()).toEqual({ ok: true, deleted: 1 });
    expect(ops(one.calls[0])).toMatch(/^delete:null eq:"user_id""11111111-1111-4111-8111-111111111111" eq:"id""eeeeeeee/);
    expect(context.forgetTutorContext).toHaveBeenCalledWith(USER);

    const all = setup(() => ({ data: [{ id: "a" }, { id: "b" }], error: null }));
    expect(await (await memoryRoute.DELETE(del({ all: true }))).json()).toEqual({ ok: true, deleted: 2 });
    expect(ops(all.calls[0])).toContain(`eq:"user_id""${USER}"`);
    expect(ops(all.calls[0])).not.toContain(`eq:"id"`);
  });

  it("DELETE: geçersiz gövde 400 (silme yok); tablo yoksa 200 ve 0", async () => {
    const service = setup(() => ({ data: [], error: null }));
    for (const body of [{}, { id: "not-a-uuid" }, { all: false }, { id: NOTE_ID, all: true }]) {
      expect((await memoryRoute.DELETE(del(body))).status, JSON.stringify(body)).toBe(400);
    }
    expect(service.calls).toHaveLength(0);
    setup(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    expect(await (await memoryRoute.DELETE(del({ all: true }))).json()).toEqual({ ok: true, deleted: 0 });
  });

  it("uçta model ve kredi yok; oturum zorunlu ve hız sınırlı", () => {
    const source = read("src/app/api/teacher/memory-notes/route.ts");
    expect(source).toContain('withUser(request, { scope: "teacher-memory-notes", limit: 30 })');
    expect(source).toContain('withUser(request, { scope: "teacher-memory-notes-delete", limit: 20 })');
    expect(source).not.toMatch(/openai|chat\.completions|reserveCredits/);
  });
});

/* ------------------------------------------------------------------------------------------------------------------ */

describe("Ayarlar · Öğretmenin seni nasıl tanıyor", () => {
  type Handler = (init?: RequestInit) => Response | Promise<Response>;
  let calls: { url: string; init?: RequestInit }[] = [];
  function mockFetch(handlers: { get: Handler; del?: Handler }) {
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return init?.method === "DELETE" ? (handlers.del ?? (() => new Response("{}", { status: 200 })))(init) : handlers.get(init);
      }),
    );
  }
  const notesResponse = (notes: unknown[]) => () => new Response(JSON.stringify({ notes }), { status: 200 });
  const NOTES = [
    { id: NOTE_ID, note: "Kısa adımlarla ilerlemeyi tercih ediyor", kind: "preference", createdAt: null },
    { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", note: "Varnik döngüsünde takılıyor", kind: "stuck", createdAt: null },
  ];

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("bayrak kapalıyken (uç 404) bölüm hiç çizilmez", async () => {
    mockFetch({ get: () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }) });
    const { container } = render(<TutorMemoryCard />);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(container.innerHTML).toBe("");
  });

  it("notlar sade liste: tür etiketi, metin, her satırda sil; tek not silinince listeden düşer", async () => {
    mockFetch({ get: notesResponse(NOTES) });
    render(<TutorMemoryCard />);
    expect(await screen.findByText("Kısa adımlarla ilerlemeyi tercih ediyor")).toBeTruthy();
    expect(screen.getByRole("heading", { name: TUTOR_MEMORY_COPY.title })).toBeTruthy();
    expect(screen.getByText(TUTOR_NOTE_KIND_LABEL.preference)).toBeTruthy();
    expect(screen.getByText(TUTOR_NOTE_KIND_LABEL.stuck)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `${TUTOR_MEMORY_COPY.deleteOne}: Varnik döngüsünde takılıyor` }));
    });
    await waitFor(() => expect(screen.queryByText("Varnik döngüsünde takılıyor")).toBeNull());
    const deleted = calls.find((call) => call.init?.method === "DELETE")!;
    expect(JSON.parse(String(deleted.init!.body))).toEqual({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff" });
    expect(toast.success).toHaveBeenCalledWith(TUTOR_MEMORY_COPY.deletedOne);
  });

  it("silme düşerse not geri gelir ve hata söylenir", async () => {
    mockFetch({ get: notesResponse(NOTES), del: () => new Response("{}", { status: 503 }) });
    render(<TutorMemoryCard />);
    await screen.findByText("Varnik döngüsünde takılıyor");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: `${TUTOR_MEMORY_COPY.deleteOne}: Varnik döngüsünde takılıyor` }));
    });
    expect(await screen.findByText("Varnik döngüsünde takılıyor")).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(TUTOR_MEMORY_COPY.deleteFailed);
  });

  it("'Hepsini sil' onay penceresiyle; onaylanınca hepsi gider ve boş hâl görünür", async () => {
    mockFetch({ get: notesResponse(NOTES) });
    render(<TutorMemoryCard />);
    await screen.findByText("Varnik döngüsünde takılıyor");
    fireEvent.click(screen.getByRole("button", { name: TUTOR_MEMORY_COPY.deleteAll }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(TUTOR_MEMORY_COPY.confirmTitle);
    expect(calls.some((call) => call.init?.method === "DELETE")).toBe(false);
    const confirm = [...dialog.querySelectorAll("button")].find((button) => button.textContent === TUTOR_MEMORY_COPY.confirmLabel)!;
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(await screen.findByText(TUTOR_MEMORY_COPY.emptyTitle)).toBeTruthy();
    const deleted = calls.find((call) => call.init?.method === "DELETE")!;
    expect(JSON.parse(String(deleted.init!.body))).toEqual({ all: true });
  });

  it("boş: 'henüz bir not almadı' + notların nereden geldiği ve kişisel bilgi tutulmadığı", async () => {
    mockFetch({ get: notesResponse([]) });
    render(<TutorMemoryCard />);
    expect(await screen.findByText(TUTOR_MEMORY_COPY.emptyTitle)).toBeTruthy();
    expect(TUTOR_MEMORY_COPY.emptyTitle).toBe("Öğretmenin henüz bir not almadı");
    expect(TUTOR_MEMORY_COPY.emptyText).toContain("kişisel bilgiler not edilmez");
    expect(screen.queryByRole("button", { name: TUTOR_MEMORY_COPY.deleteAll })).toBeNull();
  });

  it("okuma düşerse tekrar dene", async () => {
    let first = true;
    mockFetch({
      get: () => {
        if (first) {
          first = false;
          return new Response("{}", { status: 503 });
        }
        return notesResponse(NOTES)();
      },
    });
    render(<TutorMemoryCard />);
    fireEvent.click(await screen.findByRole("button", { name: TUTOR_MEMORY_COPY.retry }));
    expect(await screen.findByText("Varnik döngüsünde takılıyor")).toBeTruthy();
  });

  it("cevap ayrıştırıcısı biçimi tutmayan satırı atar", () => {
    expect(parseTutorMemoryNotes({ notes: [{ id: "a", note: " x ", kind: "zzz" }, { id: "", note: "y" }, null] })).toEqual([
      { id: "a", note: "x", kind: "stuck", createdAt: null },
    ]);
    expect(parseTutorMemoryNotes(null)).toEqual([]);
  });

  it("Ayarlar sayfası sorgu bütçesine girmez: kart veriyi uçtan ister, sayfa notları okumaz", () => {
    const page = read("src/app/ayarlar/page.tsx");
    expect(page).toContain("<TutorMemoryCard />");
    expect(page).not.toMatch(/tutor_memory_notes|listTutorNotes|TEACHER_V2_FLAG/);
    const card = read("src/components/settings/tutor-memory-card.tsx");
    expect(card).toContain("<ConfirmDialog");
    expect(card).toContain("TUTOR_MEMORY_ENDPOINT");
  });
});
