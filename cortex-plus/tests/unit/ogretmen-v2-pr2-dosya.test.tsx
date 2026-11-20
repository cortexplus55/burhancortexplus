// @vitest-environment jsdom
/**
 * Faz 13 PR-2 (PROMPT-V2 §3, §0): Öğrenci Dosyası (salt okunur) + "Neye baktım". Her satır bir kayda bağlı; kayıt yoksa
 * iddia yok. Sorgular yalnız öğrencinin kendi satırlarını, indeksli ve sınırlı okur; vektör araması yok; 10 dk önbellek.
 * Örnekler farklı derslerden (kimya, tarih, biyoloji).
 */
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { behindStep, buildDossier, weakConcepts, type DossierInput } from "@/lib/teacher/dossier";
import { DOSSIER_TTL_MS, clearDossierCache, loadStudentDossier, readDossierInput } from "@/lib/teacher/dossier-load";
import { TeacherDossierPanel } from "@/components/chat/teacher-dossier-panel";

const read = (path: string) => readFileSync(path, "utf8");
const USER = "11111111-1111-4111-8111-111111111111";

function input(overrides: Partial<DossierInput> = {}): DossierInput {
  return {
    today: "2026-11-15",
    mistakes: [],
    openMisconceptions: [],
    preps: [],
    dueReviews: { prep: 0, general: 0, prepId: null },
    documents: [],
    streak: null,
    ...overrides,
  };
}

describe("dosya kurucusu (saf)", () => {
  it("kayıt yoksa satır yok, dürüst boş; istem bloğu boş", () => {
    const dossier = buildDossier(input());
    expect(dossier.empty).toBe(true);
    expect(dossier.lines).toEqual([]);
    expect(dossier.promptBlock).toBe("");
  });

  it("zayıf kavram: aynı konuda en az iki yanlış (Yanlışlarım + açık yanılgı), en çok 3, kazanım kodu yok", () => {
    const weak = weakConcepts({
      mistakes: [
        { topicLabel: "Mol kavramı", wrongCount: 3 },
        { topicLabel: "Tanzimat Fermanı", wrongCount: 1 },
        { topicLabel: "K.9.2.1 Hücre zarı", wrongCount: 1 },
        { topicLabel: "Asit-baz", wrongCount: 2 },
        { topicLabel: "İyonik bağ", wrongCount: 2 },
      ],
      openMisconceptions: [{ topicLabel: "Tanzimat Fermanı" }],
    });
    expect(weak.map((entry) => entry.label)).toEqual(["Mol kavramı", "Asit-baz", "İyonik bağ"]);
    expect(weak.every((entry) => entry.count >= 2)).toBe(true);
    const single = weakConcepts({ mistakes: [{ topicLabel: "Hücre zarı", wrongCount: 1 }], openMisconceptions: [] });
    expect(single).toEqual([]);
  });

  it("geciken adım: yolun kendi tarih kuralından, en eski gecikme ve gün sayısı", () => {
    const behind = behindStep(
      {
        id: "p1",
        title: "TYT Biyoloji",
        examDate: "2026-12-20",
        createdAt: "2026-11-01T08:00:00Z",
        nodes: [
          { id: "n1", kind: "lesson", title: "Ders", status: "done", sortOrder: 1, sessionMeta: { calendarDate: "2026-11-10", topicTitle: "Canlıların ortak özellikleri" } },
          { id: "n2", kind: "lesson", title: "Ders", status: "ready", sortOrder: 2, sessionMeta: { calendarDate: "2026-11-13", topicTitle: "Hücre zarı ve osmoz" } },
          { id: "n3", kind: "lesson", title: "Ders", status: "locked", sortOrder: 3, sessionMeta: { calendarDate: "2026-11-18", topicTitle: "Mitoz" } },
        ],
      },
      "2026-11-15",
    );
    expect(behind).toMatchObject({ topic: "Hücre zarı ve osmoz", days: 2, nodeId: "n2" });
  });

  it("her satır kaynağına bağlı; istem bloğu uydurma süreklilik yasağıyla ve ~300 jetonla sınırlı", () => {
    const dossier = buildDossier(
      input({
        mistakes: [{ topicLabel: "Mol kavramı", wrongCount: 3 }],
        preps: [
          {
            id: "p1",
            title: "AYT Kimya",
            examDate: "2026-11-25",
            createdAt: "2026-11-01T08:00:00Z",
            nodes: [{ id: "n2", kind: "lesson", title: "Ders", status: "ready", sortOrder: 1, sessionMeta: { calendarDate: "2026-11-13", topicTitle: "Gazlar" } }],
          },
        ],
        dueReviews: { prep: 4, general: 1, prepId: "p1" },
        documents: [{ id: "d1", fileName: "Kimya Notu.pdf", pageCount: 12 }, { id: "d2", fileName: "Ek.pdf", pageCount: null }],
        streak: 3,
      }),
    );
    expect(dossier.empty).toBe(false);
    const byKey = Object.fromEntries(dossier.lines.map((line) => [line.key, line]));
    expect(byKey.weak).toMatchObject({ text: "En çok takıldığın: Mol kavramı (3 kez)", href: "/yanlislarim" });
    expect(byKey.exam).toMatchObject({ text: "AYT Kimya: sınava 10 gün", href: "/deneme-sinavlari/p1" });
    expect(byKey["behind:p1"]).toMatchObject({ text: "Gazlar 2 gün gecikti (AYT Kimya)" });
    expect(byKey.reviews).toMatchObject({ text: "Bugün 5 tekrar seni bekliyor", href: "/deneme-sinavlari/p1/tekrar" });
    expect(byKey.documents).toMatchObject({ text: "Son yüklediğin: Kimya Notu.pdf (12 sayfa) ve 1 belge daha", href: "/dokumanlar" });
    expect(dossier.checks.map((check) => check.label)).toEqual([
      "Yanlışlarına baktı",
      "Sınav tarihine baktı",
      "Planına baktı",
      "Tekrar kuyruğuna baktı",
      "Belgelerine baktı",
    ]);
    expect(dossier.promptBlock).toContain("YALNIZ burada eşleşen");
    expect(dossier.promptBlock.length).toBeLessThanOrEqual(1200);
  });
});

/** Zincirlenen sorguları kaydeden sahte istemci; tabloya göre veri döner. */
function fakeService(data: Record<string, unknown>) {
  const calls: { table: string; ops: string[] }[] = [];
  const service = {
    calls,
    from(table: string) {
      const entry = { table, ops: [] as string[] };
      calls.push(entry);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "neq", "or", "order", "limit", "lte", "is", "in", "maybeSingle"]) {
        builder[op] = (...args: unknown[]) => {
          entry.ops.push(`${op}:${JSON.stringify(args[0] ?? null)}${op === "select" && args[1] ? JSON.stringify(args[1]) : ""}`);
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(data[table] ?? { data: [], error: null, count: 0 }).then(resolve);
      return builder;
    },
    rpc: vi.fn(),
  };
  return service;
}

describe("dosya yükleyicisi: yalnız kendi satırları, sınırlı, vektör yok, önbellek", () => {
  afterEach(() => clearDossierCache());

  it("her sorgu öğrencinin user_id'si ya da indeksli üst kaydıyla, LIMIT ya da sayımla; vektör araması yok", async () => {
    const service = fakeService({
      exam_preps: { data: [{ id: "p1", title: "TYT", exam_type: "tyt", exam_date: "2026-12-01", created_at: "2026-11-01T00:00:00Z" }], error: null },
    });
    await readDossierInput(service as never, USER, new Date("2026-11-15T09:00:00Z"));
    // 19 Kasım 2026'dan (ana dal, Faz 2 madde 2) beri seri okuması tek oturum bağlamı RPC'sinden geçer
    // (`get_session_user_context`; düşerse aynı bağlamın yedek okumaları `current_account_active`, `is_admin`). Hepsi
    // kullanıcı başına sınırlı. Başka RPC (özellikle vektör araması) yok.
    const allowed = new Set(["get_session_user_context", "current_account_active", "is_admin"]);
    const rpcNames = (service.rpc as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
    expect(rpcNames.filter((name) => !allowed.has(name)), String(rpcNames)).toEqual([]);
    const tables = service.calls.map((call) => call.table);
    expect(tables).toEqual(
      expect.arrayContaining(["student_learning_memory", "mistake_entries", "exam_preps", "exam_prep_review_items", "general_review_cards", "documents", "user_streaks", "exam_prep_nodes"]),
    );
    for (const call of service.calls) {
      const ops = call.ops.join(" ");
      if (call.table === "exam_prep_nodes") expect(ops).toContain('in:"exam_prep_id"');
      // Oturum bağlamının yedek profil okuması kullanıcının kendi satırı (`profiles.id` = kullanıcı kimliği).
      else if (call.table === "profiles") expect(ops).toContain(`eq:"id"`);
      else expect(ops).toContain(`eq:"user_id"`);
      const bounded = /limit:|maybeSingle|"head":true|"count":"exact"/.test(ops);
      expect(bounded, `${call.table}: ${ops}`).toBe(true);
    }
    expect(read("src/lib/teacher/dossier-load.ts")).not.toContain("match_document_chunks");
  });

  it("10 dk önbellek: ikinci okuma sorgu atmaz; süre dolunca ya da yenile ile yeniden okur", async () => {
    const service = fakeService({});
    const now = new Date("2026-11-15T09:00:00Z");
    await loadStudentDossier(service as never, USER, { now });
    const first = service.calls.length;
    await loadStudentDossier(service as never, USER, { now: new Date(now.getTime() + DOSSIER_TTL_MS - 1000) });
    expect(service.calls.length).toBe(first);
    await loadStudentDossier(service as never, USER, { now: new Date(now.getTime() + DOSSIER_TTL_MS + 1000) });
    expect(service.calls.length).toBeGreaterThan(first);
    const second = service.calls.length;
    await loadStudentDossier(service as never, USER, { now: new Date(now.getTime() + DOSSIER_TTL_MS + 2000), fresh: true });
    expect(service.calls.length).toBeGreaterThan(second);
  });

  it("bir kaynak düşerse dosya yine kurulur, o satır yok", async () => {
    const service = fakeService({ mistake_entries: { data: null, error: { message: "boom" } } });
    const dossier = await loadStudentDossier(service as never, USER, { fresh: true });
    expect(dossier.lines.some((line) => line.source === "mistakes")).toBe(false);
  });
});

describe("uç ve sohbet: bayrak arkasında", () => {
  it("uç yalnız teacher.v2 açıkken; yalnız okur", () => {
    const route = read("src/app/api/teacher/dossier/route.ts");
    expect(route).toContain("isFeatureEnabled(service, TEACHER_V2_FLAG, userId)");
    expect(route).toContain('{ error: "not_found" }, { status: 404 }');
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });

  it("sohbet ucu dosyayı yalnız bayrak açıkken ana sohbette okur; blok kriz ve yalnız duygu turunda yok", () => {
    const chat = read("src/app/api/ai/chat/route.ts");
    expect(chat).toContain("const dossierEarly = teacherV2 && !rest.prepId ? loadStudentDossier(service, userId).catch(() => null) : null;");
    expect(chat).toContain("v2Session && dossierEarly && !turn.crisis && !turn.feelingOnly ? ((await dossierEarly)?.promptBlock ?? \"\") : \"\"");
  });
});

describe("Neye baktım paneli", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("açılınca okur; satırlar kaynağına bağlı", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          empty: false,
          lines: [{ key: "weak", source: "mistakes", text: "En çok takıldığın: Mol kavramı (3 kez)", href: "/yanlislarim", sourceLabel: "Yanlışlarım" }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<TeacherDossierPanel />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Neye baktım/ }));
    await waitFor(() => expect(screen.getByText("En çok takıldığın: Mol kavramı (3 kez)")).toBeTruthy());
    expect(screen.getByRole("link", { name: "Yanlışlarım" }).getAttribute("href")).toBe("/yanlislarim");
  });

  it("kayıt yoksa dürüst cümle", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ empty: true, lines: [] }))));
    render(<TeacherDossierPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Neye baktım/ }));
    await waitFor(() => expect(screen.getByText("Seni daha tanımıyorum; birkaç soruyla başlayalım.")).toBeTruthy());
  });
});
