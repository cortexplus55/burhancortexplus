// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StudyToolsHub } from "@/components/parity/study-tools-hub";
import { invalidInputResponse, lenientText } from "@/lib/api/input-fields";
import { clampText } from "@/lib/text/clamp-text";
import { FREE_PICK_NODE_KINDS, activityCreatable, mockExamSetupHref, type StudyNodeRef } from "@/lib/learning/study-tools";

/*
  Paket I #12 (30 Ekim 2026). Canlıda 43 karakterlik bir ders adı kurulumu üç kez 400 ile düşürdü
  ("Gönderilen bilgiler geçersiz."); "Ders oluştur" penceresi düğümü olmayan etkinliğe "Bu konuda yok"
  derken "Başka Bir Konu veya Etkinlik Seç" aynı etkinliği kuruyordu; "Deneme sınavı oluştur" kuruluma
  değil bir pencereye gidiyordu; okul adı okula bağlı olmayan hazırlıkta da yazıyordu.
*/

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

const read = (path: string) => readFileSync(path, "utf8");

describe("serbest metin sunucuda kırpılır, reddedilmez", () => {
  it("43 karakterlik ders adı 40'a kırpılır; boşluklar birleşir", () => {
    const examType = "Muhasebe Finansal Raporlama ve Analiz Dersi";
    expect(examType.length).toBeGreaterThan(40);
    const parsed = lenientText(40, 2).parse(examType);
    expect(parsed.length).toBeLessThanOrEqual(40);
    expect(examType.startsWith(parsed)).toBe(true);
    expect(lenientText(40).parse("  Veri   Yapıları \n Final ")).toBe("Veri Yapıları Final");
    expect(clampText("a ".repeat(100), 20).length).toBeLessThanOrEqual(20);
  });

  it("kısa metin yine reddedilir (kırpma boş metin uydurmaz)", () => {
    expect(lenientText(40, 2).safeParse("a").success).toBe(false);
    expect(lenientText(40, 2).safeParse(" ").success).toBe(false);
    expect(lenientText(500, 0).safeParse("").success).toBe(true);
  });

  it("gerçek doğrulama hatası alanın adını söyler", async () => {
    const schema = z.object({ title: lenientText(120, 2), examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
    const parsed = schema.safeParse({ title: "Muhasebe vizesi", examDate: "yarın" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const response = invalidInputResponse(parsed.error, { examDate: "sınav tarihi", title: "hazırlık adı" });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { code: string; error: string; fields: string[] };
    expect(body.code).toBe("invalid_input");
    expect(body.fields).toEqual(["sınav tarihi"]);
    expect(body.error).toContain("sınav tarihi");
    expect(body.error).not.toBe("Gönderilen bilgiler geçersiz.");
  });

  it("kurulum ucu serbest metni kırpar, hatada alanı söyler; sihirbaz da kırpar", () => {
    const route = read("src/app/api/learning/exam-prep/create/route.ts");
    expect(route).toMatch(/examType:\s*lenientText\(40/);
    expect(route).toMatch(/title:\s*lenientText\(120/);
    expect(route).toContain("invalidInputResponse(parsed.error, CREATE_FIELD_LABELS)");
    expect(route).not.toMatch(/examType:\s*z\.string\(\)[^\n]*\.max\(40\)/);
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("clampText(");
  });
});

function node(id: string, kind: string, topicTitle: string, sortOrder: number, status = "ready"): StudyNodeRef {
  return { id, kind, title: topicTitle, status, sortOrder, dayIndex: 1, sessionMeta: { topicTitle, topicId: `t-${topicTitle}` } } as StudyNodeRef;
}

function renderHub(nodes: StudyNodeRef[], topicLabel: string | null) {
  return render(
    <StudyToolsHub
      prepId="prep-1"
      nodes={nodes}
      topics={["Bilanço", "Gelir Tablosu"]}
      topicOptions={[
        { id: "t-Bilanço", label: "Bilanço" },
        { id: "t-Gelir Tablosu", label: "Gelir Tablosu" },
      ]}
      topicLabel={topicLabel}
      onTopic={() => undefined}
      onClose={() => undefined}
    />,
  );
}

describe("Ders oluştur penceresi: düğümü olmayan etkinlik kurulur", () => {
  it("konunun testi yolda yoksa düğme etkinlik ucunu çağırır ve açar", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ href: "/deneme-sinavlari/prep-1/dugum/yeni-test" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderHub([node("les-1", "lesson", "Bilanço", 0), node("les-2", "lesson", "Gelir Tablosu", 1)], "Gelir Tablosu");
    fireEvent.click(screen.getByRole("tab", { name: "Pratik yap" }));
    const quiz = screen.getByRole("button", { name: "Konu testi" });
    expect(quiz.textContent).not.toContain("Bu konuda yok");
    fireEvent.click(quiz);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/prep-1/dugum/yeni-test"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/learning/exam-prep/activity");
    expect(JSON.parse(String(init.body))).toEqual({
      prepId: "prep-1",
      tool: "quiz",
      topicId: "t-Gelir Tablosu",
      topicLabel: "Gelir Tablosu",
    });
  });

  it("uç düşerse öğrenciye ne olduğu söylenir, sayfa yerinde kalır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    renderHub([node("les-1", "lesson", "Bilanço", 0)], "Bilanço");
    fireEvent.click(screen.getByRole("tab", { name: "Pratik yap" }));
    fireEvent.click(screen.getByRole("button", { name: "Konu testi" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Konu testi şu an açılamadı. Bir kez daha dene.");
    expect(push).not.toHaveBeenCalled();
  });

  it("konu seçilmeden oluşturma istenirse önce konu sorulur", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderHub([node("les-1", "lesson", "Bilanço", 0)], null);
    fireEvent.click(screen.getByRole("tab", { name: "Pratik yap" }));
    fireEvent.click(screen.getByRole("button", { name: "Konu testi" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Önce bir konu seç.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("yazılı deneme düğümü yoksa doğrudan deneme kurulumuna gider", () => {
    renderHub([node("les-1", "lesson", "Bilanço", 0)], "Bilanço");
    fireEvent.click(screen.getByRole("tab", { name: "Sınav" }));
    expect(screen.getByRole("link", { name: "Yazılı deneme" }).getAttribute("href")).toBe(mockExamSetupHref("prep-1"));
    expect(screen.queryByText("Bu konuda yok")).toBeNull();
  });

  it("pencere yalnız ucun kurabildiği araçlar için istek atar", () => {
    const route = read("src/app/api/learning/exam-prep/activity/route.ts");
    const enumMatch = route.match(/tool:\s*z\.enum\(\[([^\]]+)\]\)/);
    expect(enumMatch).toBeTruthy();
    const accepted = enumMatch![1].split(",").map((part) => part.trim().replace(/"/g, "")).sort();
    expect(accepted).toEqual(Object.keys(FREE_PICK_NODE_KINDS).sort());
    for (const tool of accepted) expect(activityCreatable(tool as never)).toBe(true);
    for (const tool of ["qa", "gaps", "focused", "spaced", "written_exam", "podcast", "video"]) {
      expect(activityCreatable(tool as never)).toBe(false);
    }
  });
});

describe("hazırlık sayfası: deneme ve okul adı", () => {
  it("Deneme sınavı oluştur kurulum bağlantısıdır", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toMatch(/<Link href=\{mockExamSetupHref\(prepId\)\} className="cp-prep-goal-go">/);
    expect(mockExamSetupHref("abc")).toBe("/deneme-sinavlari/abc/deneme/kurulum");
  });

  it("okul adı yalnız okulla paylaşılan ya da okuldan katılınan hazırlıkta yazılır", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain("schoolName && (shared || joinedFromSchool)");
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("joinedFromSchool={Boolean(forkedFrom)}");
  });
});
