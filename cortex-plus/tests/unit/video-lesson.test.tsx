// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/deneme-sinavlari/p1/video",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { VideoLessonPlayer, VideoLessonSetup } from "@/components/parity/video-lesson";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";
import { STUDY_TOOLS, recommendedStudyTool, studyVideoHref } from "@/lib/learning/study-tools";
import {
  VIDEO_STYLES,
  captionChunks,
  parseVideoScript,
  videoImagePrompt,
  videoStructureIssues,
  videoSystem,
} from "@/lib/learning/video-lesson";

afterEach(cleanup);
const read = (path: string) => readFileSync(path, "utf8");

/*
  Video ders (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi; oynatıcıda birleşen
  video, yalnız Plus). Astra canlıda: "1 dakikalık video dersi izle — Hızlı ve görsel",
  stiller Gerçekçi · Çizgi roman · Beyaz tahta · Brainrot · Mem; dikey, 66 sn, 6-8 sahne,
  2-4 kelimelik akan alt yazı.
*/
const scene = (narration: string) => ({ narration, visual: "a child's lungs drawn simply" });

describe("video senaryosu", () => {
  it("Astra'nın beş stili; yazar 1 dakika ve sahne kurallarını alır", () => {
    expect(VIDEO_STYLES.map((item) => item.label)).toEqual(["Gerçekçi", "Çizgi roman", "Beyaz tahta", "Brainrot", "Mem"]);
    const system = videoSystem("document");
    expect(system).toContain("KAYNAK KURALI (kesin)");
    expect(system).toContain("5-8 sahne, toplam 110-190 kelime.");
    expect(system).toContain("resimde YAZI, harf, sayı, etiket olmaz");
    expect(videoSystem("topic")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(videoImagePrompt(scene("x"), "whiteboard")).toContain("whiteboard sketch");
    expect(videoImagePrompt(scene("x"), "comic")).toContain("no text");
  });

  it("yapı: az sahne, uzun ya da kısa toplam, uzun sahne ve kaynağa atıf yakalanır", () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(" ");
    const good = parseVideoScript({ title: "Krup", scenes: Array.from({ length: 6 }, () => scene(`${words(22)}.`)) }, "Konu")!;
    expect(videoStructureIssues(good)).toEqual([]);
    const short = parseVideoScript({ scenes: [scene("Kısa.")] }, "Konu")!;
    expect(short.title).toBe("Konu");
    expect(videoStructureIssues(short).join(" ")).toMatch(/Sahne sayısı 1/);
    const long = parseVideoScript({ scenes: Array.from({ length: 6 }, () => scene(`${words(35)}.`)) }, "K")!;
    expect(videoStructureIssues(long).join(" ")).toMatch(/35 kelime; en çok 30/);
    const cited = parseVideoScript({ scenes: Array.from({ length: 6 }, (_, i) => scene(i === 0 ? `Metne göre ${words(20)}.` : `${words(22)}.`)) }, "K")!;
    expect(videoStructureIssues(cited).join(" ")).toMatch(/kaynağa atıf/);
  });

  it("alt yazı 2-4 kelimelik parçalar, sesin süresine oranlı", () => {
    const chunks = captionChunks("Bebeklerde bronşiolit, ilk hışıltı atağıyla gelir ve destek tedavisi esastır.", 5000);
    expect(chunks.map((chunk) => chunk.text)).toEqual([
      "Bebeklerde bronşiolit,",
      "ilk hışıltı atağıyla gelir",
      "ve destek tedavisi esastır.",
    ]);
    expect(chunks[0]!.startMs).toBe(0);
    expect(chunks.at(-1)!.endMs).toBe(5000);
  });
});

describe("video: kapı, kredi, yol", () => {
  it("yalnız Plus (kurucu muafiyeti dahil); kredi 280; tek işte resim + ses + kayıt", () => {
    const route = read("src/app/api/learning/exam-prep/video/route.ts");
    expect(route).toContain('if (!requireFeature(entitlements, "video") && !(await billingExempt(service, userId))) {');
    expect(route).toContain('return errorResponse(402, "premium_required");');
    expect(read("src/lib/billing/entitlements.ts")).toContain("video: input.photoPlus,");
    expect(CREDIT_PRICE_TABLE.VIDEO_GENERATE.credits).toBe(280);
    expect(read("supabase/migrations/20261017150000_prep_videos.sql")).toContain("('VIDEO_GENERATE', 280,");
    const run = read("src/lib/learning/video-run.ts");
    expect(run).toContain('actionCode: "VIDEO_GENERATE"');
    expect(run).toContain('synthesizeLine(scene.narration, "ada")');
  });

  it("Ders oluştur'da podcast'in ardından Video; 'İzleyerek' seçen öğrenciye önerilir", () => {
    const learn = STUDY_TOOLS.filter((tool) => tool.group === "learn").map((tool) => tool.id);
    expect(learn.slice(0, 3)).toEqual(["lesson", "podcast", "video"]);
    expect(studyVideoHref("p1", "Krup", [{ id: "t1", label: "Krup" }])).toBe("/deneme-sinavlari/p1/video?topicId=t1");
    const nodes = [{ kind: "lesson", status: "ready", sortOrder: 1 }];
    expect(recommendedStudyTool(nodes, ["watching"])?.id).toBe("video");
  });

  it("göç PGlite'ta çalışır: tablo, sahip okur, kredi kuralı", async () => {
    const db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
      CREATE TABLE public.exam_preps (id uuid PRIMARY KEY);
      CREATE TABLE public.credit_rules (action_code text PRIMARY KEY, credit_cost integer NOT NULL, model_tier text NOT NULL DEFAULT 'standard',
        description text, active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());`);
    await db.exec(read("supabase/migrations/20261017150000_prep_videos.sql"));
    const rule = (await db.query<{ credit_cost: number }>("SELECT credit_cost FROM public.credit_rules WHERE action_code = 'VIDEO_GENERATE'")).rows[0];
    expect(rule?.credit_cost).toBe(280);
    await expect(
      db.exec(`INSERT INTO public.prep_videos (user_id, exam_prep_id, topic_label, style, title, scenes) VALUES
        (gen_random_uuid(), gen_random_uuid(), 'Krup', 'cartoon', 'x', '[]')`),
    ).rejects.toThrow();
    await db.close();
  });
});

describe("video ekranları", () => {
  it("Plus değilse kurulum kapıyı gösterir; Plus'ta stil ve konu seçimi", () => {
    const { unmount } = render(<VideoLessonSetup prepId="p1" entitled={false} topics={[]} initialTopicId={null} previous={[]} />);
    expect(screen.getByText("Video ders Plus'ta")).toBeTruthy();
    unmount();
    render(<VideoLessonSetup prepId="p1" entitled topics={[{ id: "t1", label: "Krup" }]} initialTopicId={null} previous={[]} />);
    expect(screen.getByText("1 dakikalık video dersi izle")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Videoyu ayarla" }));
    expect(screen.getByRole("heading", { name: "Video stili" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Beyaz tahta/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Konu seç" }));
    expect(screen.getByRole("button", { name: /Krup/ })).toBeTruthy();
  });

  it("oynatıcı: başlık, 'Dersi tamamla', ±15 sn, hız, tam ekran, alt yazı", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container } = render(
      <VideoLessonPlayer
        prepId="p1"
        videoId="v1"
        title="Çocuklarda solunum"
        topicLabel="Solunum"
        styleLabel="Beyaz tahta"
        completed={false}
        scenes={[
          { narration: "Havlar öksürük krupu düşündürür.", durationMs: 3000, imageUrl: "/a.webp", audioUrl: "/a.mp3" },
          { narration: "İlk hışıltı bronşiolittir.", durationMs: 2500, imageUrl: "/b.webp", audioUrl: "/b.mp3" },
        ]}
      />,
    );
    expect(screen.getByText("Çocuklarda solunum")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dersi tamamla" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "15 saniye geri" })).toBeTruthy();
    expect(screen.getByText("00:05")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hız" }));
    expect(screen.getByRole("button", { name: "Hız" }).textContent).toBe("1.25x");
    expect(screen.getByRole("button", { name: "Tam ekran" })).toBeTruthy();
    // Dört kelimelik cümle tek parça; metin ayrıca "Anlatımın metni" listesinde.
    expect(container.querySelector(".cp-video-caption")?.textContent).toBe("Havlar öksürük krupu düşündürür.");
    fireEvent.click(screen.getByRole("button", { name: "Oynat" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
