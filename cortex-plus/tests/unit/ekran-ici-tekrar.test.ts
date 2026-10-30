import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import {
  SCREEN_DEDUP_MAX_DROPS,
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  dedupScreens,
  dedupWithinScreen,
} from "@/lib/learning/teacher-lesson";
import { lessonSanitySystem } from "@/lib/learning/lesson-sanity";
import { BLOCK_ROLE_RULE, TEACHING_RUBRIC } from "@/lib/learning/teaching-rubric";
import type { LessonScreen, LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Ekran içi tekrar (30 Ekim 2026, ürün sahibinin kararı). Canlı "Farklı anlat" dersinde kaynağın sınav ipucundaki
  sayısal örnek bir ekranda metin, sınav ipucu ve örnek vakada aynı sayılarla duruyordu (derste ayrıca sık yapılan
  hata ve özette). İki katman: yazar blok rollerini okur (`BLOCK_ROLE_RULE`), kod üçüncü kez geçen örneği süs
  kutusundan siler (`dedupWithinScreen`). Örnekler bilerek farklı derslerden.
*/

type Block = LessonScreen["blocks"][number];
const text = (value: string): Block => ({ type: "text", text: value });
const note = (title: string, body: string, tone: string): Block => ({ type: "note", note: { title, body, tone } }) as Block;
const check = (prompt: string, options: string[], answerIndex: number, explanation: string): Block => ({
  type: "check",
  check: { type: "mcq", prompt, options, answerIndex, explanation },
});
const types = (screen: LessonScreen) => screen.blocks.map((block) => (block.type === "note" ? `note:${block.note.title}` : block.type));

/** Canlıdaki "Farklı anlat" dersinin 2. ekranı (fdd5d5ce, 30 Ekim 2026), kısaltılmış. */
const liveScreen: LessonScreen = {
  heading: "İlgili kavramlar ve ölçüm",
  concept: "Enflasyon ve İlgili Kavramlar",
  blocks: [
    text(
      "Deflasyonda genel fiyat düzeyi sürekli düşer; dezenflasyonda ise enflasyon oranı düşerken fiyatlar artmaya devam eder. " +
        "**%60'tan %40'a inen enflasyon dezenflasyondur**; fiyatlar düşmüş değildir.",
    ),
    {
      type: "table",
      table: {
        columns: ["Kavram", "Anlamı"],
        rows: [
          ["Deflasyon", "Genel fiyat düzeyinin sürekli düşmesi"],
          ["Dezenflasyon", "Enflasyon oranının düşmesi; fiyatlar hâlâ artar ama daha yavaş"],
        ],
      },
    },
    note("Sınav ipucu: Dezenflasyon ile deflasyon", "Enflasyon %60'tan %40'a inerse bu dezenflasyondur; fiyatlar düşmemiş, daha yavaş artmıştır.", "exam"),
    text("**TÜFE (Tüketici Fiyat Endeksi)**, hanehalkının satın aldığı mal ve hizmetlerin fiyat değişimini ölçer."),
    {
      type: "cards",
      cards: [
        { title: "TÜFE", body: "Hanehalkının satın aldığı mal ve hizmetlerin fiyat değişimini ölçer." },
        { title: "Yİ-ÜFE", body: "Üreticilerin sattığı malların fiyat değişimini ölçer." },
      ],
    },
    note(
      "Örnek vaka: Enflasyon oranının gerilemesi",
      "Bir dönemde enflasyon %60, sonraki dönemde %40'tır. Bu değişim dezenflasyondur; fiyatlar düşmemiş, artış daha yavaşlamıştır.",
      "info",
    ),
    check(
      "Bir ülkede yüksek işsizlikle birlikte enflasyon görülüyor. Bu durumu hangi kavram adlandırır?",
      ["Hiperenflasyon", "Enflasyon", "Deflasyon", "Dezenflasyon", "Stagflasyon"],
      4,
      "Stagflasyon, durgunluk (yüksek işsizlik) ile enflasyonun birlikte görülmesidir.",
    ),
  ],
} as LessonScreen;

describe("dedupWithinScreen: ekranda üçüncü kez geçen örnek süs kutusundan silinir", () => {
  it("canlı ders: metin + sınav ipucu + örnek vaka aynı sayılarla → yalnız örnek vaka gider; ipucu, tablo, kartlar, soru kalır", () => {
    const { screen, dropped } = dedupWithinScreen(liveScreen);
    expect(dropped).toBe(1);
    expect(types(screen)).toEqual(["text", "table", "note:Sınav ipucu: Dezenflasyon ile deflasyon", "text", "cards", "check"]);
  });

  it("fizik: aynı hesap metin, çözümlü örnek, kaydırma ve sınav tuzağında → kaydırma gider; yanlış inancı gösteren tuzak kalır", () => {
    const screen: LessonScreen = {
      heading: "Ortalama hız",
      concept: "Ortalama hız",
      blocks: [
        text("Ortalama hız, toplam yolun toplam süreye bölümüdür. 120 km yolu 2 saatte alan aracın ortalama hızı 60 km/sa olur."),
        {
          type: "example",
          example: { prompt: "120 km yolu 2 saatte alan aracın ortalama hızı kaçtır?", solution: "120 / 2 = 60 km/sa", result: "60 km/sa" },
        },
        {
          type: "comparison_carousel",
          carousel: {
            mode: "compare",
            slides: [
              { title: "Yol", body: "Araç 120 km yol alır ve bu 2 saat sürer." },
              { title: "Hız", body: "Ortalama hız bölmeyle bulunur: 60 km/sa." },
            ],
          },
        },
        {
          type: "exam_trap_card",
          trap: { title: "Hız tuzağı", wrong: "120 km ve 2 saatte hız 240 km/sa olur.", right: "120 / 2 = 60 km/sa; yol süreye bölünür.", tell: "Çarpma değil bölme." },
        },
        check("Ortalama hız nasıl bulunur?", ["Yol ÷ süre", "Yol × süre", "Süre ÷ yol", "Yol + süre", "Yol − süre"], 0, "Toplam yol toplam süreye bölünür."),
      ],
    } as LessonScreen;
    const { screen: out, dropped } = dedupWithinScreen(screen);
    // Kaydırmanın iki slaytından biri hesabın tekrarı (yarısı): kaydırma bütünüyle gider. Sınav tuzağı sayılır ama
    // silinmez: "çarpılır" yanılgısını gösteren tek kutu.
    expect(dropped).toBe(1);
    expect(types(out)).toEqual(["text", "example", "exam_trap_card", "check"]);
  });

  it("biyoloji: aile ızgarasında tek kart tekrarsa ızgara bozulmaz; kartların çoğu tekrarsa ızgara bütünüyle gider", () => {
    const screen: LessonScreen = {
      heading: "Organeller",
      concept: "Organeller",
      blocks: [
        text("Mitokondri hücrede enerji üretimini sağlayan zarlı organeldir ve oksijenli solunum burada gerçekleşir."),
        {
          type: "table",
          table: {
            columns: ["Organel", "Görev"],
            rows: [["Mitokondri", "Hücrede enerji üretimini sağlayan zarlı organel; oksijenli solunum burada gerçekleşir"]],
          },
        },
        {
          type: "cards",
          cards: [
            { title: "Mitokondri", body: "Hücrede enerji üretimini sağlayan zarlı organeldir; oksijenli solunum burada gerçekleşir." },
            { title: "Ribozom", body: "Protein sentezinin yapıldığı zarsız organeldir." },
            { title: "Golgi", body: "Salgı maddelerini paketleyip hücre dışına gönderir." },
          ],
        },
        check("Protein sentezi hangi organelde yapılır?", ["Ribozom", "Mitokondri", "Golgi", "Lizozom", "Koful"], 0, "Ribozom protein sentezler."),
      ],
    } as LessonScreen;
    // Üç organelin ailesi: yalnız Mitokondri kartı metni ve tabloyu tekrar ediyor → ızgara olduğu gibi kalır.
    expect(dedupWithinScreen(screen).dropped).toBe(0);
    // Tablo bütün aileyi verirse kartların üçü de tekrar olur → ızgara bütünüyle gider.
    const full = {
      ...screen,
      blocks: screen.blocks.map((block) =>
        block.type === "table"
          ? {
              ...block,
              table: {
                ...block.table,
                rows: [
                  ...block.table.rows,
                  ["Ribozom", "Protein sentezinin yapıldığı zarsız organel"],
                  ["Golgi", "Salgı maddelerini paketleyip hücre dışına gönderir"],
                ],
              },
            }
          : block,
      ),
    } as LessonScreen;
    const fullText = {
      ...full,
      blocks: [
        text("Ribozom protein sentezinin yapıldığı zarsız organeldir; Golgi salgı maddelerini paketleyip hücre dışına gönderir."),
        ...full.blocks,
      ],
    } as LessonScreen;
    const { screen: out, dropped } = dedupWithinScreen(fullText);
    expect(dropped).toBe(1);
    expect(types(out)).toEqual(["text", "text", "table", "check"]);
  });

  it("iki veriliş serbest; tek sayı (eşik) örnek değil; korunan notlar hiç silinmez", () => {
    // İki veriliş: metin + örnek vaka.
    const two = {
      heading: "Reel faiz",
      blocks: [
        text("Mevduat faizi %45, enflasyon %40 ise reel getiri yaklaşık %5 olur."),
        note("Örnek vaka: Mevduat", "Faiz %45 ve enflasyon %40 iken mevduat sahibi yaklaşık %5 kazanır.", "info"),
      ],
    } as LessonScreen;
    expect(dedupWithinScreen(two).dropped).toBe(0);
    // Tek sayı: aynı eşik üç yerde, cümleler farklı.
    const threshold = {
      heading: "Hiperenflasyon",
      blocks: [
        text("Cagan'a göre ölçüt aylık %50'nin üzeridir."),
        note("Akılda tut", "Yıllık değil, aylık oran: %50.", "remember"),
        note("Bilgi", "Kontrolden çıkan fiyatlar için eşik %50 aylık.", "info"),
      ],
    } as LessonScreen;
    expect(dedupWithinScreen(threshold).dropped).toBe(0);
    // Korunan notlar (sınav ipucu, uyarı, akılda tut) aynı örneği taşısa da kalır.
    const guarded = {
      heading: "Vize",
      blocks: [
        text("Vizede 20 sorunun 15'i doğruysa not 75 olur."),
        note("Sınav ipucu", "20 sorudan 15 doğru: 75.", "exam"),
        note("Dikkat", "20 soruda 15 doğru 75 eder, 80 değil.", "warn"),
        note("Akılda tut", "15/20 = 75.", "remember"),
      ],
    } as LessonScreen;
    expect(dedupWithinScreen(guarded).dropped).toBe(0);
  });

  it("bir ekrandan en çok üç birim silinir; dedupScreens toplamı sayar", () => {
    const many = {
      heading: "Tekrar",
      blocks: [
        text("Toplam 8 elmanın 3'ü yenirse 5 elma kalır."),
        { type: "example", example: { prompt: "8 elmanın 3'ü yenirse kaç elma kalır?", solution: "8 − 3 = 5", result: "5" } },
        ...Array.from({ length: 5 }, (_, i) => note(`Not ${i + 1}`, `8 elmadan 3 yenince geriye 5 elma kalır (${i + 1}).`, "info")),
      ],
    } as LessonScreen;
    const { screen, dropped } = dedupWithinScreen(many);
    expect(dropped).toBe(SCREEN_DEDUP_MAX_DROPS);
    expect(screen.blocks).toHaveLength(7 - SCREEN_DEDUP_MAX_DROPS);
    expect(dedupScreens([many, liveScreen]).dropped).toBe(SCREEN_DEDUP_MAX_DROPS + 1);
  });
});

describe("yazar ve doğrulayıcı blok rollerini aynı metinle okur", () => {
  it("BLOCK_ROLE_RULE yazarda (belgeli ve belgesiz), hafif doğrulayıcıda; vaka, sık yapılan hata ve özet satırları", () => {
    expect(TEACHER_SYSTEM).toContain(BLOCK_ROLE_RULE);
    expect(TOPIC_TEACHER_SYSTEM).toContain(BLOCK_ROLE_RULE);
    expect(lessonSanitySystem("document")).toContain(BLOCK_ROLE_RULE);
    expect(BLOCK_ROLE_RULE).toMatch(/sınav tuzağı[\s\S]*1-2 kısa cümleyle/u);
    expect(TEACHER_SYSTEM).toMatch(/metindeki örneği yeniden anlatmaz/u);
    expect(TEACHER_SYSTEM).toMatch(/yeni sayı uydurma/u);
    expect(TEACHER_SYSTEM).toMatch(/commonMistake[^\n]*aynı sayılarla yeniden anlatmaz/u);
    expect(TOPIC_TEACHER_SYSTEM).toMatch(/commonMistake[^\n]*aynı sayılarla yeniden anlatmaz/u);
    expect(TEACHER_SYSTEM).toMatch(/summary: [^\n]*sayısal örneği yeniden anlatmaz/u);
    expect(TEACHING_RUBRIC).toContain("özet kuralı söyler, derste verilen sayısal örneği yeniden anlatmaz");
    // Ders bağımsız: kuralda ders adı ya da örnek sayı yok ("1-2 kısa cümle" yalnız uzunluk).
    expect(BLOCK_ROLE_RULE).not.toMatch(/%|\d{2,}|enflasyon|mitokondri/iu);
  });
});

/* ───────────── Ders hattı: yayımlanan ekranda tekrar kalmaz ───────────── */

const lessonWithEcho: LessonV3 = {
  format: 3,
  title: "Dezenflasyon",
  objective: "Dezenflasyonu deflasyondan ayırmak.",
  screens: [
    {
      heading: "Dezenflasyon",
      concept: "Dezenflasyon",
      blocks: [
        check("Enflasyon oranının düşmesi fiyatların düştüğünü gösterir.", ["Doğru", "Yanlış"], 1, "Oran düşse de fiyatlar artmaya devam eder."),
        text("Enflasyon %60'tan %40'a inerse fiyatlar hâlâ artar, yalnız daha yavaş: bu dezenflasyondur."),
        { type: "table", table: { columns: ["Kavram", "Anlamı"], rows: [["Dezenflasyon", "Enflasyon oranının düşmesi"], ["Deflasyon", "Fiyat düzeyinin düşmesi"]] } },
        { type: "example", example: { prompt: "Enflasyon %60'tan %40'a iniyor. Bu nedir?", solution: "Oran düşer, fiyatlar artar: dezenflasyon.", result: "Dezenflasyon" } },
        note("Örnek vaka: Gerileyen oran", "Bir ülkede enflasyon %60'tan %40'a geriliyor; fiyatlar yine artıyor.", "info"),
        {
          type: "diagram_card",
          diagramKind: "number_line",
          title: "Oranın gerilemesi",
          items: [{ label: "Önce", value: "%60" }, { label: "Sonra", value: "%40" }],
        },
      ],
    },
  ],
  summary: ["Dezenflasyon: oran düşer, fiyatlar artar.", "Deflasyon: fiyat düzeyi düşer.", "İkisini karıştırma."],
  nextFocus: [],
} as LessonV3;

describe("ders hattı: süzgeç yayımdan önce çalışır, günlüğe yazar", () => {
  it("örnek vaka (üçüncü veriliş) yayımlanan derste yok; teacher_lesson_teaching_flags deduped: 1", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
    const queue = [JSON.stringify(lessonWithEcho)];
    const result = await teacherLessonPipeline(
      {
        write: async (_system, _user, onDelta) => {
          const body = queue.shift() ?? "";
          onDelta(body);
          return { text: body, finish: "stop" };
        },
      },
      {
        topicLabel: "Dezenflasyon",
        prepTitle: "KPSS İktisat",
        pages: [{ page: 1, text: "Enflasyon %60'tan %40'a inerse bu dezenflasyondur, fiyatlar düşmemiştir." }],
        upcomingTopics: [],
        sanity: false,
      },
    );
    const blocks = result.lesson!.screens[0]!.blocks;
    expect(blocks.some((block) => block.type === "note" && block.note.title.startsWith("Örnek vaka"))).toBe(false);
    expect(blocks.map((block) => block.type)).toEqual(["check", "text", "table", "example", "diagram_card"]);
    expect(info).toHaveBeenCalledWith("teacher_lesson_teaching_flags", expect.objectContaining({ deduped: 1 }));
    info.mockRestore();
  });
});
