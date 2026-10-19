// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isWholeDocumentRequest, loadDocumentGenerationContext } from "@/lib/documents/generation-context";
import { estimatedPodcastMinutes, podcastLengthSpec } from "@/lib/learning/podcast-formats";

/*
  19 Ekim 2026, ürün sahibi: "her özelliği farklı belgeyle tek tek dene; istediği sayıda ve dakikada
  üretebiliyor mu". Canlıda bulunanlar ve bu testin tuttuğu kurallar:
  - "Belgenin tamamı" yazan öğrencinin kart isteği "belge hazır değil" diye düştü (yalnız tek
    kelimelik "tümü" tanınıyordu); konu bulunamayınca da istek düşüyordu.
  - "tümü" denince podcast 8 sayfalık notun yalnız ilk 6 sayfasını anlattı (son iki dönem yok).
  - Kart sayısı ekranda hep 10'du; Doğru/Yanlış ve sözlü belge almıyordu.
  - "~5 dk" denen podcast 7:29 çıktı (kelime aralıkları dakikada 130 kelime varsayıyordu).
  - Sohbet: "Genel sohbet"teyken PDF eklenince katı moda düşüp belgede yazanı reddediyordu; her
    mesaja gizlice "[Matematik]" ekleniyordu.
*/

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/student/student-shell-context", () => ({
  useStudentShellAccount: () => ({ isPremium: true }),
  useIsFounder: () => false,
}));

afterEach(() => cleanup());

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("belgenin tamamı isteği", () => {
  it("öğrencinin yazdığı biçimlerle tanınır", () => {
    for (const phrase of ["Belgenin tamamı", "tümü", "Tüm konular", "hepsi", "bütün belge", "belge", "Notun tamamından"]) {
      expect(isWholeDocumentRequest(phrase), phrase).toBe(true);
    }
  });
  it("gerçek konu adını tamama çevirmez", () => {
    for (const phrase of ["Genel kimya", "Calvin döngüsü", "Osman Bey Dönemi"]) {
      expect(isWholeDocumentRequest(phrase), phrase).toBe(false);
    }
  });
});

function fakeDocument(pages: number, topics: { id: string; title: string; pages: number[] }[]) {
  const selected: number[][] = [];
  const service = {
    from(table: string) {
      let columns = "";
      let inPages: number[] = [];
      let topicFilter: string | null = null;
      const query = {
        select(value: string) { columns = value; return query; },
        eq(column: string, value: string) { if (column === "topic_id") topicFilter = value; return query; },
        is() { return query; },
        order() { return query; },
        range() { return query; },
        in(_c: string, values: number[]) { inPages = values; selected.push(values); return query; },
        maybeSingle: async () => ({ data: { id: "doc", file_name: "Tarih.pdf", status: "completed" }, error: null }),
        then(resolve: (value: unknown) => void) {
          const data = table === "document_topic_nodes"
            ? topics.map((t, i) => ({ id: t.id, title: t.title, parent_id: null, sort_order: i }))
            : table === "document_topic_page_links"
              ? topics.filter((t) => !topicFilter || t.id === topicFilter).flatMap((t) => t.pages.map((page) => ({ topic_id: t.id, page_number: page })))
              : columns.includes("text_content")
                ? inPages.map((page) => ({ page_number: page, text_content: `Sayfa ${page} metni.`, formulas: [], extraction_ok: true, page_kind: "content" }))
                : Array.from({ length: pages }, (_, i) => ({ page_number: i + 1, headings: [], extraction_ok: true, page_kind: "content" }));
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { service, selected };
}

describe("belge kaynağı seçimi", () => {
  const topics = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `Dönem ${i + 1}`, pages: [i * 3 + 1, i * 3 + 2, i * 3 + 3] }));

  it("tamamı istenince her konudan sayfa gelir (son konu dahil)", async () => {
    const { service } = fakeDocument(30, topics);
    const context = await loadDocumentGenerationContext(service, "u", "doc", "Belgenin tamamı");
    expect(context?.wholeDocument).toBe(true);
    expect(context?.matched).toBe(true);
    for (const topic of topics) {
      expect(context?.topicPages.some((page) => topic.pages.includes(page)), topic.title).toBe(true);
    }
    expect(context?.topicPages.length).toBeLessThanOrEqual(14);
  });

  it("konu belgede yoksa istek düşmez, belgenin tamamına genişler", async () => {
    const { service } = fakeDocument(30, topics);
    const context = await loadDocumentGenerationContext(service, "u", "doc", "Kuantum fiziği");
    expect(context).not.toBeNull();
    expect(context?.wholeDocument).toBe(true);
    expect(context?.matched).toBe(false);
  });

  it("konu bulunursa yalnız o konunun sayfaları", async () => {
    const { service } = fakeDocument(30, topics);
    const context = await loadDocumentGenerationContext(service, "u", "doc", "Dönem 4");
    expect(context?.wholeDocument).toBe(false);
    expect(context?.topicPages).toEqual([10, 11, 12]);
  });
});

describe("podcast süresi ölçülen okuma hızıyla", () => {
  it("5 dakikalık diyaloğun kelime aralığı 5 dakikada okunur", () => {
    const brief = podcastLengthSpec("diyalog").brief;
    const [low, high] = (brief.match(/(\d+)-(\d+) kelime/) ?? []).slice(1).map(Number);
    expect(estimatedPodcastMinutes(low, "duo")).toBeGreaterThanOrEqual(4);
    expect(estimatedPodcastMinutes(high, "duo")).toBeLessThanOrEqual(6);
    // Canlıdaki ölçüm: 657 kelime, iki ses, 7:29.
    expect(estimatedPodcastMinutes(657, "duo")).toBe(7);
  });
  it("her türün aralığı kendi dakikasına oturur", () => {
    for (const id of ["ozet", "diyalog", "soru_cevap", "basit", "derin"] as const) {
      const spec = podcastLengthSpec(id);
      const [low, high] = (spec.brief.match(/(\d+)-(\d+) kelime/) ?? []).slice(1).map(Number);
      const mid = estimatedPodcastMinutes((low + high) / 2, spec.speakers);
      expect(Math.abs(mid - spec.minutes), id).toBeLessThanOrEqual(1);
    }
  });
});

describe("araç kurulumu", () => {
  it("kartlar: belge seçilince belgenin konuları ve sayı seçimi görünür", async () => {
    const { FlashcardStudio } = await import("@/components/learning/studio/flashcard-studio");
    render(
      <FlashcardStudio
        creditCost={3}
        documents={[{ id: "d1", fileName: "Biyoloji.pdf", topics: ["Calvin döngüsü", "Fermantasyon"] }]}
        initialDocumentId="d1"
      />,
    );
    expect(screen.getByRole("button", { name: "Belgenin tamamı" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calvin döngüsü" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "15 kart" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Yeni belge yükle" })).toBeTruthy();
  });

  it("kartlar: seçilen sayı ve belge isteğe gider", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({ title: "t", cards: [{ id: "c", front: "Ön", back: "Arka" }] }), { status: 200 });
    }));
    const { FlashcardStudio } = await import("@/components/learning/studio/flashcard-studio");
    render(
      <FlashcardStudio
        creditCost={3}
        documents={[{ id: "d1", fileName: "Biyoloji.pdf", topics: ["Calvin döngüsü"] }]}
        initialDocumentId="d1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "20 kart" }));
    fireEvent.click(screen.getByRole("button", { name: "Belgenin tamamı" }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toMatchObject({ topic: "Belgenin tamamı", count: 20, documentId: "d1" });
    vi.unstubAllGlobals();
  });

  it("podcast ekranında kredi sayısı ve 'tek öğretmen' yazmaz; tür ve süre seçilir", () => {
    const source = read("src/components/learning/studio/podcast-studio.tsx");
    expect(source).not.toMatch(/tek öğretmen/);
    expect(source).not.toMatch(/<dt>Kredi<\/dt>/);
    expect(source).toContain("Tür ve süre");
    expect(read("src/app/api/learning/podcast/generate/route.ts")).toContain("parsePodcastLength(parsedBody.data.length)");
  });

  it("Doğru/Yanlış ve sözlü belge ve sayı alır; D/Y öğretmen motorunda", () => {
    const tf = read("src/app/api/learning/true-false/generate/route.ts");
    expect(tf).toContain("teacherTrueFalseLoop");
    expect(tf).not.toContain("generateJson");
    expect(tf).toContain("documentId: z.string().uuid().optional()");
    const oral = read("src/app/api/learning/oral/generate/route.ts");
    expect(oral).toContain("studioTeacherSource");
    expect(oral).toContain("expectedPoints: item.expectedPoints");
    expect(read("src/app/api/learning/oral/grade/route.ts")).toContain("Beklenen noktalar:");
  });
});

describe("sohbet ve belge", () => {
  it("'Genel sohbet' katı mod göndermez; sunucu katı modu belge modu açıkken kabul eder", () => {
    expect(read("src/components/chat/chat-panel.tsx")).toContain("documentsOnly: useDocuments ? documentsOnly : false");
    expect(read("src/app/api/ai/chat/route.ts")).toContain("const strict = grounded && documentsOnly && useDocuments;");
  });
  it("ders etiketi varsayılan olarak boş; belgeyle konuşurken eklenmez", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain('const [subject, setSubject] = useState("");');
    expect(panel).toContain("subject && !activeDocumentId.current");
  });
  it("sohbetten yüklenen belge hemen işlenir", () => {
    expect(read("src/components/chat/chat-panel.tsx")).toContain("requestDocumentProcessing({ documentId: uploaded.documentId");
  });
});

describe("yazılı deneme aracının geçici hazırlığı", () => {
  it("Sınavlar listesine, ücretsiz hazırlık hakkına ve ana sayfa sayımına girmez", () => {
    expect(read("src/lib/learning/prep-cards.ts")).toContain(".or(NOT_STUDIO_EXAM_FILTER)");
    expect(read("src/lib/billing/free-prep-limit.ts")).toContain('.neq("exam_type", STUDIO_EXAM_TYPE)');
    expect(read("src/app/ogretmen/page.tsx")).toContain('.neq("exam_type", STUDIO_EXAM_TYPE)');
    expect(read("src/app/api/learning/exam/generate/route.ts")).toContain("exam_type: STUDIO_EXAM_TYPE");
    // Dördüncü tur: kurulumun "Devam ettiklerin" listesinde "deneme" diye ders görünüyordu.
    for (const file of ["src/app/deneme-sinavlari/olustur/page.tsx", "src/lib/gamification/load-badge-facts.ts", "src/app/siniflar/[id]/page.tsx"]) {
      expect(read(file), file).toContain(".or(NOT_STUDIO_EXAM_FILTER)");
    }
  });
});

/*
  İkinci tur (19 Ekim 2026): yazılı deneme aracı belge almıyordu — öteki araçlar belge seçerken o
  "hazırlığının sayfasını aç" diyordu. Artık belge seçilir; konular belgenin kendi konularından.
*/
describe("yazılı deneme aracı belgeden", () => {
  it("belge seçici, belgenin konuları ve sayı isteğe gider", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? "{}")));
      return new Response(JSON.stringify({
        examId: "e1", title: "Hukuk", source: { kind: "document", wholeDocument: true, matched: true },
        questions: [{ id: "q1", text: "Sözleşme nedir?", options: ["A", "B"] }],
      }), { status: 200 });
    }));
    const { WrittenStudio } = await import("@/components/learning/studio/written-studio");
    render(
      <WrittenStudio
        creditCost={15}
        documents={[{ id: "d1", fileName: "Hukuk.pdf", topics: ["Sözleşmenin kurulması", "İrade sakatlıkları"] }]}
        initialDocumentId="d1"
      />,
    );
    expect(screen.getByRole("button", { name: "Yeni belge yükle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "İrade sakatlıkları" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "15 soru" }));
    fireEvent.click(screen.getByRole("button", { name: "Belgenin tamamı" }));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0]).toMatchObject({ topic: "Belgenin tamamı", questionCount: 15, documentId: "d1" });
    expect(await screen.findByText("Belgenin tamamından hazırlandı.")).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("uç belgeyi konuların kaynağına yazar; geçici hazırlığa belge kimliği yazmaz", () => {
    const route = read("src/app/api/learning/exam/generate/route.ts");
    expect(route).toContain("documentId: z.string().uuid().optional()");
    expect(route).toContain("studioExamTopics(service, userId, documentId, topic, questionCount)");
    expect(route).toContain("source_refs: row.refs");
    expect(route).not.toMatch(/document_id:\s*documentId/);
    expect(read("src/app/dokumanlar/[documentId]/page.tsx")).toContain("/studio/yazili?documentId=");
  });

  it("belgenin tamamında konular belgeye eşit aralıkla yayılır (ilk ve son dahil)", async () => {
    const { spreadPick } = await import("@/lib/learning/studio-exam-topics");
    expect(spreadPick([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 8)).toEqual([1, 3, 4, 6, 7, 9, 10, 12]);
    expect(spreadPick([1, 2, 3], 8)).toEqual([1, 2, 3]);
    expect(spreadPick([1, 2, 3, 4, 5], 1)).toEqual([1]);
  });
});

/*
  Üçüncü tur (19 Ekim 2026): Araçlar'daki 5 dakikalık diyalogda senaryo 37 sn sürdü, oynatıcı ise
  bütün sesi bekleyip ~3,5 dk sonra açıldı. Ses artık akışla gelir; ilk satır gelince oynatıcı açılır.
*/
describe("podcast aracı sesi akışla alır", () => {
  it("ilk satırın sesi gelince oynatıcı açılır; geri kalanı gelirken bunu söyler", async () => {
    const chapters = [
      { title: "Sözleşmenin kurulması", lines: [{ speaker: "ada", text: "Sözleşme iki iradenin uyuşmasıdır." }, { speaker: "kerem", text: "Öneri ve kabul gerekir." }] },
      { title: "Ehliyet", lines: [{ speaker: "ada", text: "Ayırt etme gücü şarttır." }, { speaker: "kerem", text: "Kısıtlılar sınırlı ehliyetlidir." }] },
    ];
    let push: ((line: string) => void) | null = null;
    let close: (() => void) | null = null;
    const encoder = new TextEncoder();
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")));
      if (url.includes("/podcast/generate")) {
        return new Response(JSON.stringify({ title: "Sözleşme Hukukuna Giriş", chapters }), { status: 200 });
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          push = (line) => controller.enqueue(encoder.encode(`${line}\n`));
          close = () => controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
    }));
    const { PodcastStudio } = await import("@/components/learning/studio/podcast-studio");
    render(<PodcastStudio creditCost={12} documents={[{ id: "d1", fileName: "Hukuk.pdf", topics: ["Ehliyet"] }]} initialDocumentId="d1" />);
    fireEvent.click(screen.getByRole("button", { name: "Belgenin tamamı" }));
    await waitFor(() => expect(push).not.toBeNull());
    expect(bodies[1]).toMatchObject({ stream: true });
    const line = (index: number, chapterIndex: number, speaker: string, text: string) =>
      JSON.stringify({ type: "line", index, chapterIndex, speaker, text, url: `https://cdn.test/${index}.mp3`, durationMs: 2000 });
    push!(line(0, 0, "ada", "Sözleşme iki iradenin uyuşmasıdır."));
    expect(await screen.findByRole("button", { name: "Oynat" })).toBeTruthy();
    expect(screen.getByText("Dinlemeye başlayabilirsin; sesin geri kalanı hazırlanıyor.")).toBeTruthy();
    const all = [
      { chapterIndex: 0, speaker: "ada", text: "Sözleşme iki iradenin uyuşmasıdır." },
      { chapterIndex: 0, speaker: "kerem", text: "Öneri ve kabul gerekir." },
      { chapterIndex: 1, speaker: "ada", text: "Ayırt etme gücü şarttır." },
      { chapterIndex: 1, speaker: "kerem", text: "Kısıtlılar sınırlı ehliyetlidir." },
    ].map((item, index) => ({ ...item, url: `https://cdn.test/${index}.mp3`, durationMs: 2000 }));
    push!(JSON.stringify({ type: "done", lines: all }));
    close!();
    await waitFor(() => expect(screen.queryByText("Dinlemeye başlayabilirsin; sesin geri kalanı hazırlanıyor.")).toBeNull());
    expect(screen.getByText("0:00 / 0:08")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("genel sohbetin sesi", () => {
  // Canlıda: "Bu notu kısaca özetle." → "Takıldığın özel bir nokta belirtilmedi. … Kontrol sorusu: …"
  it("eski (1) takıldığı yer (2) ipucu (3) kontrol sorusu kalıbı genel sohbette de yok", () => {
    const route = read("src/app/api/ai/chat/route.ts");
    expect(route).not.toContain("tutorStylePrompt");
    expect(route).toContain("${CHAT_NATURAL_VOICE}");
    expect(read("src/lib/ai/teacher-tutor.ts")).toContain("takıldığın bir nokta belirtilmedi");
  });
});

describe("yazılı deneme aracı: açık uçlu ve çok cevaplı soru", () => {
  // Canlıda: Ekonomi yazılısının 7. sorusu açık uçluydu; ekran şık bekledi, "Sonraki soru" açılmadı.
  it("açık uçluya yazı alanı, çok cevaplıya çoklu işaret; teslimde cevaplar doğru biçimde gider", async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      posts.push({ url, body });
      if (url.includes("/exam/grade")) return new Response(JSON.stringify({ score: 70, analysis: "İyi." }), { status: 200 });
      return new Response(JSON.stringify({
        examId: "e1", title: "Ekonomi",
        questions: [
          { id: "q1", text: "Hangileri para politikası aracıdır?", options: ["Reeskont", "Vergi", "Açık piyasa"], question_type: "multi_mcq" },
          { id: "q2", text: "Reel getiriyi hesaplayınız.", options: [], question_type: "open" },
        ],
      }), { status: 200 });
    }));
    // Sonuç ekranı ses çalar; azaltılmış hareket = sessiz (jsdom matchMedia bilmez).
    Object.defineProperty(window, "matchMedia", { value: () => ({ matches: true }), configurable: true, writable: true });
    const { WrittenStudio } = await import("@/components/learning/studio/written-studio");
    render(<WrittenStudio creditCost={15} initialTopic="Ekonomi" />);
    fireEvent.click(screen.getByRole("button", { name: "Yazılıyı aç" }));
    expect(await screen.findByText("Birden çok doğru şık olabilir; hepsini işaretle.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Reeskont/ }));
    fireEvent.click(screen.getByRole("button", { name: /Açık piyasa/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sonraki soru" }));
    const box = screen.getByRole("textbox", { name: "Cevabın" });
    // Boş açık uçlu teslimi engellemez.
    expect((screen.getByRole("button", { name: "Kağıdı teslim et" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(box, { target: { value: "45 - 40 = yaklaşık %5" } });
    fireEvent.click(screen.getByRole("button", { name: "Kağıdı teslim et" }));
    await waitFor(() => expect(posts.some((post) => post.url.includes("/exam/grade"))).toBe(true));
    const grade = posts.find((post) => post.url.includes("/exam/grade"))!;
    expect(grade.body.answers).toEqual({ q1: ["Reeskont", "Açık piyasa"], q2: "45 - 40 = yaklaşık %5" });
    // Puan yüzde; çıplak "70" ne olduğu belli olmayan bir sayıydı.
    expect(await screen.findByText("%70")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("kurulum sihirbazı: ders adımı", () => {
  // Canlıda "Farmakoloji" yazınca altında hiçbir şey olmayan iki başlık kalıyordu.
  it("aramayla eşleşen ders yoksa 'Devam ettiklerin' ve 'Dersler' başlıkları çizilmez", () => {
    const wizard = read("src/components/parity/exam-create-wizard.tsx");
    expect(wizard).toContain("{recentMatches.length ? (");
    expect(wizard).toContain("{commonMatches.length ? (");
  });
});
