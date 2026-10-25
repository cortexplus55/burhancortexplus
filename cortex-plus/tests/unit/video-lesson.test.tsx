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
  persistVideoStyle,
  resolveVideoStyle,
  videoImagePrompt,
  videoStructureIssues,
  videoSystem,
  videoStyle,
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
    expect(VIDEO_STYLES.map((item) => item.label)).toEqual([
      "Gerçekçi & Sinematik",
      "Çizgi Roman / Anime",
      "Beyaz Tahta & El Çizimi",
      "Neon İnfografik & Şema",
      "Hızlı Odak (Yüksek Enerji)",
    ]);
    const system = videoSystem("document");
    expect(system).toContain("KAYNAK KURALI (kesin)");
    expect(system).toContain("6-8 sahne, toplam 85-115 kelime.");
    expect(system).toContain("en çok 18 kelime");
    expect(system).toContain("resimde YAZI, harf, sayı, etiket olmaz");
    expect(videoSystem("topic")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(videoImagePrompt(scene("x"), "whiteboard")).toContain("whiteboard");
    expect(videoImagePrompt(scene("x"), "comic")).toContain("no text");
    expect(videoImagePrompt(scene("x"), "cinematic")).toContain("cinematic");
    expect(resolveVideoStyle("realistic")).toBe("cinematic");
    expect(resolveVideoStyle("brainrot")).toBe("infographic");
    expect(resolveVideoStyle("meme")).toBe("fast_focus");
    expect(videoStyle("realistic").id).toBe("cinematic");
    expect(persistVideoStyle("cinematic")).toBe("realistic");
    expect(persistVideoStyle("infographic")).toBe("brainrot");
  });

  it("yapı: az sahne, uzun ya da kısa toplam, uzun sahne ve kaynağa atıf yakalanır", () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(" ");
    const text = (script: ReturnType<typeof parseVideoScript>) => videoStructureIssues(script!).map((issue) => issue.problem).join(" ");
    const good = parseVideoScript({ title: "Krup", scenes: Array.from({ length: 7 }, () => scene(`${words(14)}.`)) }, "Konu")!;
    expect(videoStructureIssues(good)).toEqual([]);
    const short = parseVideoScript({ scenes: [scene("Kısa.")] }, "Konu")!;
    expect(short.title).toBe("Konu");
    expect(text(short)).toMatch(/Sahne sayısı 1/);
    const long = parseVideoScript({ scenes: Array.from({ length: 6 }, () => scene(`${words(35)}.`)) }, "K")!;
    expect(text(long)).toMatch(/35 kelime; en çok 18/);
    const cited = parseVideoScript({ scenes: Array.from({ length: 7 }, (_, i) => scene(i === 0 ? `Metne göre ${words(12)}.` : `${words(14)}.`)) }, "K")!;
    expect(text(cited)).toMatch(/kaynağa atıf/);
  });

  it("süre: 1:48'lik senaryo (8 × 22 kelime) düşer; hedefi biraz kaçıran düzeltilir ama atılmaz", () => {
    // 17 Ekim canlı: 178 kelime 108,5 sn sürdü; "1 dakikalık" video 1:48 çıktı.
    const words = (n: number) => Array.from({ length: n }, (_, i) => `kelime${i}`).join(" ");
    const high = (script: ReturnType<typeof parseVideoScript>) =>
      videoStructureIssues(script!).filter((issue) => issue.severity === "high").map((issue) => issue.problem);
    const live = parseVideoScript({ scenes: Array.from({ length: 8 }, () => scene(`${words(22)}.`)) }, "K")!;
    expect(high(live).join(" ")).toMatch(/Toplam 176 kelime/);
    const slightlyLong = parseVideoScript({ scenes: Array.from({ length: 6 }, () => scene(`${words(20)}.`)) }, "K")!;
    expect(videoStructureIssues(slightlyLong).length).toBeGreaterThan(0);
    expect(high(slightlyLong)).toEqual([]);
    const fiveScenes = parseVideoScript({ scenes: Array.from({ length: 5 }, () => scene(`${words(18)}.`)) }, "K")!;
    expect(high(fiveScenes)).toEqual([]);
    const fourScenes = parseVideoScript({ scenes: Array.from({ length: 4 }, () => scene(`${words(18)}.`)) }, "K")!;
    expect(high(fourScenes).join(" ")).toMatch(/Sahne sayısı 4/);
    // Koşucu yalnız "high" yapı sorununda videoyu düşürür.
    expect(read("src/lib/learning/video-run.ts")).toContain('structural.filter((issue) => issue.severity === "high")');
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
    expect(run).toContain('synthesizeLine(speechText(scene.narration), "ada")');
  });

  it("Ders oluştur'da podcast'in ardından Video; 'İzleyerek' seçen öğrenciye önerilir", () => {
    const learn = STUDY_TOOLS.filter((tool) => tool.group === "learn").map((tool) => tool.id);
    expect(learn.slice(0, 3)).toEqual(["lesson", "podcast", "video"]);
    expect(studyVideoHref("p1", "Krup", [{ id: "t1", label: "Krup" }])).toBe("/deneme-sinavlari/p1/video?topicId=t1");
    const nodes = [{ kind: "lesson", status: "ready", sortOrder: 1 }];
    expect(recommendedStudyTool(nodes, ["watching"])?.id).toBe("video");
    // 17 Ekim canlı: Video kutusunun simgesi renkli zeminsiz kalmıştı — her aracın kuralı olsun.
    const css = read("src/styles/oral-exam-chrome.css");
    for (const tool of STUDY_TOOLS) expect(css, tool.id).toContain(`.cp-study-hub-icon--${tool.id} {`);
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
    await db.exec(read("supabase/migrations/20261025121000_video_visual_styles.sql"));
    const rule = (await db.query<{ credit_cost: number }>("SELECT credit_cost FROM public.credit_rules WHERE action_code = 'VIDEO_GENERATE'")).rows[0];
    expect(rule?.credit_cost).toBe(280);
    await expect(
      db.exec(`INSERT INTO public.prep_videos (user_id, exam_prep_id, topic_label, style, title, scenes) VALUES
        (gen_random_uuid(), gen_random_uuid(), 'Krup', 'cartoon', 'x', '[]')`),
    ).rejects.toThrow();
    expect(read("supabase/migrations/20261025121000_video_visual_styles.sql")).toContain("cinematic");
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
    expect(screen.getByRole("button", { name: /Gerçekçi & Sinematik/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Konu seç" }));
    expect(screen.getByRole("button", { name: /Krup/ })).toBeTruthy();
  });

  it("konudan gelindiyse düğme 'Konu seç' demez; konu adı yazar", () => {
    render(<VideoLessonSetup prepId="p1" entitled topics={[{ id: "t1", label: "Krup" }]} initialTopicId="t1" previous={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Videoyu ayarla" }));
    expect(screen.queryByRole("button", { name: "Konu seç" })).toBeNull();
    expect(screen.getByRole("button", { name: "Videoyu oluştur" })).toBeTruthy();
    expect(screen.getByText("Konu: Krup")).toBeTruthy();
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
    expect(container.querySelector(".cp-video-image")?.className).toMatch(/is-kb-0/);
    fireEvent.click(screen.getByRole("button", { name: "Oynat" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    // Ses daha yüklenmeden düğme "Duraklat" olur (ikinci dokunuş oynatmayı iptal etmesin).
    expect(screen.getByRole("button", { name: "Duraklat" })).toBeTruthy();
  });
});

/*
  Videoda kilit bilgi (18 Ekim 2026, ürün sahibinin kararı). Astra'nın beyaz tahta videosunda
  takipne eşikleri tahtaya büyük yazılıydı (belgede olmasa da). Bizde kilit bilgi yalnız kaynaktan,
  resmin üstüne oynatıcı yazar (resim modeli yazıyı bozuyor); anahtar kelime alt yazıda renkli.
*/
describe("videoda kilit bilgi", () => {
  it("senaryo kilit bilgiyi ve anahtar kelimeyi ister; uzun kilit bilgi atılır", () => {
    const system = videoSystem("document");
    expect(system).toContain("keyFact");
    expect(system).toContain("**iki yıldız**");
    const parsed = parseVideoScript(
      {
        title: "Krup",
        scenes: [
          { ...scene("**Havlar öksürük** krupu düşündürür."), keyFact: "Havlar öksürük + stridor → krup" },
          { ...scene("İlk hışıltı bronşiolittir."), keyFact: "bu çok uzun bir cümle ekrana sığmaz ve akılda da kalmaz çünkü fazla kelime var" },
        ],
      },
      "Krup",
    )!;
    expect(parsed.scenes[0]!.keyFact).toBe("Havlar öksürük + stridor → krup");
    expect(parsed.scenes[1]!.keyFact).toBeUndefined();
  });

  it("anahtar kelime alt yazıda işaretli, seslendirmede yok", async () => {
    const { speechText } = await import("@/lib/learning/video-lesson");
    expect(speechText("**Havlar öksürük** krupu düşündürür.")).toBe("Havlar öksürük krupu düşündürür.");
    const chunks = captionChunks("**Havlar öksürük** krupu düşündürür.", 3000);
    expect(chunks[0]!.text).toBe("Havlar öksürük krupu düşündürür.");
    expect(chunks[0]!.words.filter((item) => item.key).map((item) => item.word)).toEqual(["Havlar", "öksürük"]);
    expect(read("src/lib/learning/video-run.ts")).toContain("synthesizeLine(speechText(scene.narration)");
  });

  it("oynatıcı kilit bilgiyi resmin üstüne yazar ve anahtar kelimeyi renklendirir", () => {
    const { container } = render(
      <VideoLessonPlayer
        prepId="p1"
        videoId="v1"
        title="Çocuklarda solunum"
        topicLabel="Solunum"
        styleLabel="Beyaz tahta"
        completed={false}
        scenes={[
          { narration: "**Havlar öksürük** krupu düşündürür.", durationMs: 3000, imageUrl: "/a.webp", audioUrl: "/a.mp3", keyFact: "Havlar öksürük + stridor → krup" },
        ]}
      />,
    );
    expect(container.querySelector(".cp-video-fact")?.textContent).toBe("Havlar öksürük + stridor → krup");
    expect([...container.querySelectorAll(".cp-video-key")].map((node) => node.textContent?.trim())).toEqual(["Havlar", "öksürük"]);
    expect(container.querySelector(".cp-video-caption")?.textContent).toBe("Havlar öksürük krupu düşündürür.");
  });
});
