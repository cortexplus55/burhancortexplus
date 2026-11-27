import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
  /mufredat ince içerik temizliği (27 Kasım 2026; denetim `docs/seo/mufredat-ince-icerik-denetimi.md`):
  1. 864 ünite sayfası yalnız kazanım listesiydi. Artık havuzdaki doğrulanmış ünite dersinden genel bakış, kazanım başına
     başlık + ilk cümle + iki kilit nokta, kavramlar ve ünite özeti gösterir; model çağrısı yok. Havuzda güncel ders
     gerçekten yoksa sayfa `noindex, follow`; okuma düşerse sayfa eski hâliyle açılır ve dizinde kalır.
  2. Derin eşi olan 37 eski konu ağacı (`*-2026-tree-*`): program, ünite ve kazanım sayfaları açık, `noindex, follow`,
     güncel hâline bağlanır; site haritasında ve /llms-full.txt'de yok. `kpss-2026-tree-guncel` değişmez.
*/

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type Answer = { data: Row | null; error: { message: string } | null } | "never";

let answer: Answer = { data: null, error: null };

function fakeService() {
  const calls: Array<[string, unknown]> = [];
  const chain = {
    select: (cols: string) => (calls.push(["select", cols]), chain),
    eq: (col: string, value: unknown) => (calls.push([col, value]), chain),
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => (answer === "never" ? new Promise(() => {}) : Promise.resolve(answer)),
  };
  return { client: { from: (table: string) => (calls.push(["from", table]), chain) } as never, calls };
}

let service = fakeService();
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => service.client }));
vi.mock("@/components/layout/marketing-page", () => ({
  MarketingPage: ({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children}
    </main>
  ),
}));

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const { CONTENT_VERSION, poolUnit } = await import("@/lib/content-pool/keys");
const { CURRICULUM, getProgram } = await import("@/lib/curriculum/registry");
const { curriculumSitemapPaths, NOINDEX_FOLLOW, supersededBy } = await import("@/lib/curriculum/seo");
const { loadUnitPreview, UNIT_PREVIEW_TIMEOUT_MS, unitPreviewWordCount } = await import("@/lib/curriculum/unit-preview");
const unitRoute = await import("@/app/mufredat/[programId]/[unitId]/page");
const programRoute = await import("@/app/mufredat/[programId]/page");
const outcomeRoute = await import("@/app/mufredat/[programId]/[unitId]/[outcomeId]/page");
const indexRoute = await import("@/app/mufredat/page");
const { listProgramSummaries } = await import("@/lib/curriculum/registry");

// En az üç kazanımlı bir MEB ünitesi (örnek sabit kelime taşımaz; kayıt defterinden seçilir).
const program = CURRICULUM.programs.find((p) => p.kind === "okul" && p.units.some((u) => u.outcomes.length >= 3))!;
const unitIndex = program.units.findIndex((u) => u.outcomes.length >= 3);
const unit = poolUnit(`${program.id}#${unitIndex + 1}`)!;

const longText = (seed: string, words: number) => Array.from({ length: words }, (_, i) => `${seed}${i}`).join(" ");

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    title: "Ünite",
    overview: `Genel bakış. ${longText("bakış", 70)}`,
    sections: unit.outcomes.map((o, i) => ({
      outcome_code: o.code,
      heading: `Bölüm başlığı ${i + 1}`,
      explanation: `Bölümün **ilk** cümlesi ${i + 1} burada duruyor. İkinci cümle sayfaya girmez. ${longText("açıklama", 40)}`,
      key_points: [`**Kilit** nokta ${i + 1}a`, `Kilit nokta ${i + 1}b`, `Üçüncü nokta ${i + 1}c sayfaya girmez`],
    })),
    summary: `Ünite özeti. ${longText("özet", 60)}`,
    key_terms: Array.from({ length: 10 }, (_, i) => ({ term: `Terim ${i + 1}`, definition: `Tanım ${i + 1} burada.` })),
    cards: [{ front: "Ön", back: "Arka" }],
    ...overrides,
  };
}

const okRow = (body: unknown = lesson()) => ({ data: { body, unit_sha256: unit.sha256 }, error: null });

afterEach(() => {
  answer = { data: null, error: null };
  service = fakeService();
  vi.useRealTimers();
});

describe("ünite özeti havuzdan (model çağrısı yok)", () => {
  it("doğrulanmış, güncel dersi okur: genel bakış, kazanım sırası, ilk cümle, iki kilit nokta, en çok 8 kavram, özet", async () => {
    answer = okRow();
    const result = await loadUnitPreview(service.client, { programId: program.id, unitIndex });
    expect(result.state).toBe("ok");
    if (result.state !== "ok") return;
    const { preview } = result;
    expect(preview.overview.startsWith("Genel bakış.")).toBe(true);
    expect(preview.outcomes.map((o) => o.code)).toEqual(unit.outcomes.map((o) => o.code));
    expect(preview.outcomes[0]!.heading).toBe("Bölüm başlığı 1");
    expect(preview.outcomes[0]!.lead).toBe("Bölümün ilk cümlesi 1 burada duruyor.");
    expect(preview.outcomes[0]!.keyPoints).toEqual(["Kilit nokta 1a", "Kilit nokta 1b"]);
    expect(preview.keyTerms).toHaveLength(8);
    expect(preview.summary?.startsWith("Ünite özeti.")).toBe(true);
    expect(unitPreviewWordCount(preview)).toBeGreaterThan(200);
    // Sorgu: yalnız doğrulanmış, güncel sürüm ders satırı; soru bankasına (cevap anahtarına) gidilmez.
    expect(service.calls).toEqual(
      expect.arrayContaining([
        ["from", "topic_content"],
        ["select", "body, unit_sha256"],
        ["unit_id", unit.unitId],
        ["kind", "lesson"],
        ["program_id", program.id],
        ["version", CONTENT_VERSION],
        ["status", "verified"],
      ]),
    );
    expect(service.calls.some(([, value]) => value === "item_bank")).toBe(false);
  });

  it("bölüm kodu tutmazsa sırayla eşler; bölümü olmayan kazanım boş kalır", async () => {
    const body = lesson();
    body.sections = body.sections.map((s) => ({ ...s, outcome_code: `X-${s.outcome_code}` }));
    answer = okRow(body);
    const ordered = await loadUnitPreview(service.client, { programId: program.id, unitIndex });
    expect(ordered.state === "ok" && ordered.preview.outcomes[1]!.heading).toBe("Bölüm başlığı 2");
    answer = okRow(lesson({ sections: [lesson().sections[0]] }));
    const partial = await loadUnitPreview(service.client, { programId: program.id, unitIndex });
    expect(partial.state === "ok" && partial.preview.outcomes[1]).toEqual({ code: unit.outcomes[1]!.code, heading: "", lead: null, keyPoints: [] });
  });

  it("tek ya da iki kazanımlı ünitede kazanım başına dört kilit nokta (sayfa kısa kalmasın)", async () => {
    const small = CURRICULUM.programs.find((p) => p.kind === "okul" && p.units.some((u) => u.outcomes.length === 1))!;
    const smallIndex = small.units.findIndex((u) => u.outcomes.length === 1);
    const smallUnit = poolUnit(`${small.id}#${smallIndex + 1}`)!;
    const points = ["Bir", "İki", "Üç", "Dört", "Beş"].map((w) => `${w} numaralı kilit nokta`);
    answer = {
      data: {
        body: lesson({ sections: [{ ...lesson().sections[0], outcome_code: smallUnit.outcomes[0]!.code, key_points: points }] }),
        unit_sha256: smallUnit.sha256,
      },
      error: null,
    };
    const result = await loadUnitPreview(service.client, { programId: small.id, unitIndex: smallIndex });
    expect(result.state === "ok" && result.preview.outcomes[0]!.keyPoints).toEqual(points.slice(0, 4));
  });

  it("güncel ders yok → missing (satır yok, kazanımlar değişmiş, genel bakış boş, kayıtta olmayan ünite)", async () => {
    answer = { data: null, error: null };
    expect((await loadUnitPreview(service.client, { programId: program.id, unitIndex })).state).toBe("missing");
    answer = { data: { body: lesson(), unit_sha256: "eski-kazanimlar" }, error: null };
    expect((await loadUnitPreview(service.client, { programId: program.id, unitIndex })).state).toBe("missing");
    answer = okRow(lesson({ overview: "   " }));
    expect((await loadUnitPreview(service.client, { programId: program.id, unitIndex })).state).toBe("missing");
    expect((await loadUnitPreview(service.client, { programId: program.id, unitIndex: 999 })).state).toBe("missing");
  });

  it("okuma hatası ve süre aşımı → error (geçici hata noindex'e dönmez)", async () => {
    answer = { data: null, error: { message: "bağlantı koptu" } };
    expect((await loadUnitPreview(service.client, { programId: program.id, unitIndex })).state).toBe("error");
    vi.useFakeTimers();
    answer = "never";
    const pending = loadUnitPreview(service.client, { programId: program.id, unitIndex });
    await vi.advanceTimersByTimeAsync(UNIT_PREVIEW_TIMEOUT_MS + 1);
    expect((await pending).state).toBe("error");
  });
});

describe("ünite sayfası", () => {
  const params = Promise.resolve({ programId: program.id, unitId: String(unitIndex + 1) });

  it("havuz özetiyle zenginleşir ve dizinde kalır; kazanım bağlantıları ve kayıt çağrısı yerinde", async () => {
    answer = okRow();
    const meta = await unitRoute.generateMetadata({ params });
    expect(meta.robots).toBeUndefined();
    expect(String(meta.description)).toContain("Genel bakış.");
    const html = renderToStaticMarkup(await unitRoute.default({ params }));
    expect(html).toContain('data-testid="unit-preview"');
    expect(html).toContain("Bu ünitede ne öğreneceksin");
    expect(html).toContain("Bölüm başlığı 1");
    expect(html).toContain("Bölümün ilk cümlesi 1 burada duruyor.");
    expect(html).not.toContain("İkinci cümle sayfaya girmez");
    expect(html).not.toContain("Üçüncü nokta");
    expect(html).toContain("Ünitenin kavramları");
    expect(html).toContain("Ünite özeti");
    for (let j = 0; j < unit.outcomes.length; j++) expect(html).toContain(`href="/mufredat/${program.id}/${unitIndex + 1}/${j + 1}"`);
    expect(html).toContain('href="/kayit"');
    expect(html).toContain('"@type":"LearningResource"');
    expect(html).not.toContain('data-testid="superseded-notice"');
    // Görünür metin ünite başına ortalama yüzlerce kelimeye çıkar (eski hâli ortanca 53 kelime).
    const words = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(300);
  });

  it("havuzda güncel ders yoksa noindex follow; sayfa eski listeyle açılır", async () => {
    answer = { data: null, error: null };
    const meta = await unitRoute.generateMetadata({ params });
    expect(meta.robots).toEqual(NOINDEX_FOLLOW);
    const html = renderToStaticMarkup(await unitRoute.default({ params }));
    expect(html).toContain('data-testid="unit-outcomes"');
    expect(html).not.toContain('data-testid="unit-preview"');
    expect(html).not.toContain("LearningResource");
  });

  it("okuma düşerse sayfa eski hâliyle açılır ama dizinden çıkmaz", async () => {
    answer = { data: null, error: { message: "zaman aşımı" } };
    const meta = await unitRoute.generateMetadata({ params });
    expect(meta.robots).toBeUndefined();
    const html = renderToStaticMarkup(await unitRoute.default({ params }));
    expect(html).toContain('data-testid="unit-outcomes"');
  });
});

describe("derin eşi olan eski konu ağaçları", () => {
  const superseded = CURRICULUM.programs.filter((p) => supersededBy(p));

  it("38 eski ağacın 37'sinin derin eşi var; güncel bilgiler, derin ve MEB programları etkilenmez", () => {
    const trees = CURRICULUM.programs.filter((p) => p.id.includes("-2026-tree-"));
    expect(trees).toHaveLength(38);
    expect(superseded).toHaveLength(37);
    for (const p of superseded) expect(supersededBy(p)!.id).toBe(p.id.replace("-2026-tree-", "-2026-deep-"));
    expect(supersededBy(getProgram("kpss-2026-tree-guncel")!)).toBeNull();
    for (const p of CURRICULUM.programs.filter((x) => !x.id.includes("-2026-tree-"))) expect(supersededBy(p)).toBeNull();
  });

  it("site haritasında yok: 5.236 − 616 adres; derin eşi ve güncel bilgiler ağacı kalır", () => {
    const paths = curriculumSitemapPaths();
    const removed = superseded.reduce((n, p) => n + 1 + p.units.length + p.units.reduce((m, u) => m + u.outcomes.length, 0), 0);
    expect(removed).toBe(616);
    for (const p of superseded) expect(paths.some((path) => path === `/mufredat/${p.id}` || path.startsWith(`/mufredat/${p.id}/`))).toBe(false);
    for (const p of superseded) expect(paths).toContain(`/mufredat/${supersededBy(p)!.id}`);
    expect(paths).toContain("/mufredat/kpss-2026-tree-guncel/1");
  });

  it("program, ünite ve kazanım sayfaları açık (404 değil), noindex follow ve güncel hâline bağlı", async () => {
    const tree = getProgram("tus-2026-tree-anatomi")!;
    const deep = supersededBy(tree)!;
    answer = { data: { body: lesson(), unit_sha256: "baska" }, error: null };
    const programMeta = await programRoute.generateMetadata({ params: Promise.resolve({ programId: tree.id }) });
    expect(programMeta.robots).toEqual(NOINDEX_FOLLOW);
    const programHtml = renderToStaticMarkup(await programRoute.default({ params: Promise.resolve({ programId: tree.id }) }));
    expect(programHtml).toContain('data-testid="superseded-notice"');
    expect(programHtml).toContain(`href="/mufredat/${deep.id}"`);

    const unitParams = Promise.resolve({ programId: tree.id, unitId: "1" });
    expect((await unitRoute.generateMetadata({ params: unitParams })).robots).toEqual(NOINDEX_FOLLOW);
    // Havuz özeti olsa bile eski ağaç dizine önerilmez.
    answer = { data: { body: lesson(), unit_sha256: poolUnit(`${tree.id}#1`)!.sha256 }, error: null };
    expect((await unitRoute.generateMetadata({ params: unitParams })).robots).toEqual(NOINDEX_FOLLOW);
    expect(renderToStaticMarkup(await unitRoute.default({ params: unitParams }))).toContain(`href="/mufredat/${deep.id}"`);

    const outcomeParams = Promise.resolve({ programId: tree.id, unitId: "1", outcomeId: "1" });
    expect((await outcomeRoute.generateMetadata({ params: outcomeParams })).robots).toEqual(NOINDEX_FOLLOW);

    const deepMeta = await programRoute.generateMetadata({ params: Promise.resolve({ programId: deep.id }) });
    expect(deepMeta.robots).toBeUndefined();
    const guncel = await programRoute.generateMetadata({ params: Promise.resolve({ programId: "kpss-2026-tree-guncel" }) });
    expect(guncel.robots).toBeUndefined();
  });

  it("yeni kurulum ekranı aynı kuralı kullanır (eski ağaç gösterilmez); kural kaynakta tek ve ders bağımsız", () => {
    const panel = read("src/components/parity/official-curriculum-panel.tsx");
    expect(panel).toContain('p.id.includes("-2026-tree-") && ids.has(p.id.replace("-2026-tree-", "-2026-deep-"))');
    const seo = read("src/lib/curriculum/seo.ts");
    expect(seo).toContain('program.id.replace("-2026-tree-", "-2026-deep-")');
    expect(read("src/lib/seo/llms-full.ts")).toContain("if (supersededBy(program)) continue;");
  });
});

describe("/mufredat liste sayfası (27 Kasım 2026)", () => {
  it("derin sürümü olan 37 eski ağaç kartlarda yok; 121 kart, aynı adla iki kart yok; güncel bilgiler ağacı listede", () => {
    const html = renderToStaticMarkup(indexRoute.default());
    const cards = [...html.matchAll(/<li class="mk-card p-4"><a [^>]*href="\/mufredat\/([a-z0-9-]+)"[^>]*>([^<]+)<\/a>/g)];
    expect(cards).toHaveLength(121);
    const ids = cards.map((m) => m[1]!);
    for (const p of CURRICULUM.programs.filter((x) => supersededBy(x))) {
      expect(ids, p.id).not.toContain(p.id);
      expect(html, p.id).not.toContain(`/mufredat/${p.id}"`);
      expect(ids).toContain(supersededBy(p)!.id);
    }
    expect(ids).toContain("kpss-2026-tree-guncel");
    const labels = cards.map((m) => m[2]!);
    expect(new Set(labels).size).toBe(labels.length);
    // Başlıktaki sayı ve yapılandırılmış verideki liste gösterilen kartlarla aynı.
    expect(html).toContain("121 program,");
    expect(html).toContain('"numberOfItems":121');
  });

  it("yalnız liste süzülür: kurulum ve API'nin okuduğu program listesi, doğrudan adresler değişmez", async () => {
    expect(listProgramSummaries()).toHaveLength(158);
    expect(read("src/app/api/curriculum/route.ts")).toContain("programs: listProgramSummaries(),");
    const tree = getProgram("dus-2026-tree-endodonti")!;
    expect(supersededBy(tree)).not.toBeNull();
    const meta = await programRoute.generateMetadata({ params: Promise.resolve({ programId: tree.id }) });
    expect(meta.robots).toEqual(NOINDEX_FOLLOW);
    expect(renderToStaticMarkup(await programRoute.default({ params: Promise.resolve({ programId: tree.id }) }))).toContain(
      'data-testid="superseded-notice"',
    );
  });
});
