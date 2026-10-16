import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { toDisplay } from "@/lib/learning/speech-normalizer";
import {
  parseTeacherPodcast,
  podcastStructureIssues,
  podcastSystem,
  podcastVerifySystem,
  podcastVerifyUserPrompt,
} from "@/lib/learning/teacher-podcast";
import { teacherPodcastLoop } from "@/lib/learning/teacher-podcast-run";

/*
  Öğretmen podcast motoru (2 Ekim 2026). Altın denemede KPSS "Basit anlatım"
  ve Termodinamik "Diyalog" geçti. İki ders: gösterim çevirici "P-v"yi
  "P⁻v" yapıyordu (kod hatası, denetçi yakaladı); denetçi belgede olmayan
  "300 K, R = 0,287" örneğini kaçırdı (artık sayı ipucu veriliyor).
*/
const line = (text: string, speaker: "ada" | "kerem" = "ada") => ({ speaker, text });
const draft = {
  title: "Hükümsüzlük",
  chapters: [
    { title: "Yokluk", lines: [line("Bir işlem yapılmış görünüp hiç doğmamış olabilir mi?"), line("Kurucu unsur eksikse işlem hiç doğmamış sayılır."), line("Dur ve düşün: Nikâh memuru olmadan yapılan evlilik hangi durumdadır?"), line("Cevap: Yokluk; kurucu unsur eksiktir.")] },
    { title: "Mutlak butlan", lines: [line("Mutlak butlanda işlem kurulmuştur ama kesin geçersizdir."), line("Organ satımı sözleşmesi buna örnektir.")] },
    { title: "Nispi butlan", lines: [line("Nispi butlanda irade sakatlığı vardır."), line("Hakkı zedelenen kişi iptal hakkını kullanır.")] },
    { title: "Akılda kalacaklar", lines: [line("Yoklukta işlem doğmaz."), line("Mutlak butlanda işlem kesin geçersizdir."), line("Nispi butlanda iptal hakkı kullanılır.")] },
  ],
};

describe("öğretmen podcast motoru: biçim ve yapı", () => {
  it("taslak bölüm/satır yapısına oturur; 'Dur ve düşün' / 'Cevap' işaret olur", () => {
    const episode = parseTeacherPodcast(draft, { length: "basit", topicLabel: "Hükümsüzlük" })!;
    expect(episode.chapters).toHaveLength(4);
    const beats = episode.chapters[0].lines.map((item) => item.beat ?? "");
    expect(beats).toContain("ask");
    expect(beats).toContain("reveal");
    expect(podcastStructureIssues(episode)).toEqual([]);
  });

  it("soru-cevap eksikliği, tekrar eden cümle, kısa tekrar bölümü ve tutmayan hesap yakalanır", () => {
    const episode = parseTeacherPodcast(
      {
        ...draft,
        chapters: [
          { title: "Yokluk", lines: [line("İşlem hiç doğmamış olabilir mi diye düşün."), line("Kurucu unsur eksikse işlem hiç doğmamış sayılır.")] },
          { title: "Cebri icra", lines: [line("İptal, idari işlemi; cebri icra ise borcun ödenmesini sağlar."), line("İptal idari işlemi kaldırır; cebri icra ise borcun ödenmesini sağlar.")] },
          { title: "Hesap", lines: [line("Toplam kütle 14 g + 4 g = 17 g olur."), line("Bu kütle korunur.")] },
          { title: "Akılda kalacaklar", lines: [line("Yoklukta işlem doğmaz."), line("Mutlak butlanda işlem kesin geçersizdir.")] },
        ],
      },
      { length: "basit", topicLabel: "Hükümsüzlük" },
    )!;
    const issues = podcastStructureIssues(episode).join(" | ");
    expect(issues).toMatch(/Dur ve düşün/);
    expect(issues).toMatch(/önceki cümlenin tekrarı/);
    expect(issues).toMatch(/Son bölüm üç/);
    expect(issues).toMatch(/Tutmayan hesap/);
  });

  it("gösterim çevirici tireli adı iyon sanmaz", () => {
    expect(toDisplay("P-v eğrisinin altındaki alan")).toBe("P-v eğrisinin altındaki alan");
    expect(toDisplay("Na+ ve Cl- iyonları")).toBe("Na⁺ ve Cl⁻ iyonları");
  });

  it("istem: türün biçimi, kaynak kuralı; diyalogda Kerem; özette soru-cevap yok", () => {
    expect(podcastSystem("document", "diyalog")).toContain('{"speaker":"kerem"');
    expect(podcastSystem("document", "diyalog")).toContain('{"speaker":"ada"');
    expect(podcastSystem("document", "basit")).toContain("KAYNAK KURALI (kesin)");
    expect(podcastSystem("topic", "basit")).toContain("BİLGİ KURALI (belgesiz, kesin)");
    expect(podcastSystem("document", "basit")).toContain("'Dur ve düşün:'");
    expect(podcastSystem("document", "ozet")).not.toContain("'Dur ve düşün:'");
    // 16 Ekim 2026 Pediatri podcast'i: her bölüm aynı kalıp (soru → belge cümlesi →
    // "Ben … varsaymışım" → "Tekrar edelim"). Kalıp istemden geliyordu.
    for (const length of ["diyalog", "basit"] as const) {
      const system = podcastSystem("document", length);
      expect(system).not.toContain("Her bölüm: ne olduğu");
      expect(system).toContain("her bölümde aynı sırayla dizme");
    }
    const duo = podcastSystem("document", "diyalog");
    expect(duo).toContain("'Tekrar edelim' yalnız son bölümde");
    expect(duo).toContain("bu bütün podcast'te en çok bir kez olur");
    // Biçimin kendi kuralıyla çelişmez: Kerem yanlış cümleyi doğru gibi söylemez.
    expect(duo).not.toContain("yanlış tahmin");
    expect(podcastSystem("document", "basit")).toContain("'Tekrar edelim' kalıbı her bölümde kullanılmaz");
    // 16 Ekim 2026 Astra kıyası: bizim her satır tek cümleydi ve belge cümlesi okuyordu;
    // Astra'nın konuşma sıraları 2-4 cümle, nedeni ve sonucu açıyor.
    for (const length of ["diyalog", "basit"] as const) {
      const system = podcastSystem("document", length);
      expect(system).not.toContain("TEK cümle");
      // Canlıda örnek kuraldan güçlü çıktı: "text":"tek cümle" örneği varken sıraların %83'ü tek cümleydi.
      expect(system).not.toContain('"text":"tek cümle"');
      expect(system).toContain("2-4 cümle — olgu, nedeni, sonucu ya da örneği");
      expect(system).toContain("1-4 cümle");
      expect(system).toMatch(/Bilgi taşımayan cümle kurma/);
    }
    // 17 Ekim 2026, ürün sahibi "Astra gibi iki ses de anlatsın": canlıda Kerem'in bütün sıraları tek
    // cümlelik soruydu. Diyalogda Kerem de anlatır; örnek de bunu gösterir. Soru-cevapta Kerem yine sorar.
    expect(duo).toContain("Kerem yalnız soru sormaz");
    expect(duo).toContain("en az yarısı soru değil");
    expect(duo).toContain('{"speaker":"kerem","text":"1-3 cümle: kaynaktaki bir örnek');
    expect(duo).not.toContain("Kerem kesin bilgi vermez");
    const qa = podcastSystem("document", "soru_cevap");
    expect(qa).toContain("Kerem yalnızca soru sorar");
    expect(qa).not.toContain("Kerem yalnız soru sormaz");
    // Belgede olmayan neden/bilgi: sesli etiketle, en çok iki yerde; denetçi doğruluğunu ayrıca denetler.
    expect(podcastSystem("document", "diyalog")).toContain("'Belgende geçmiyor ama bilmen iyi olur:'");
    expect(podcastSystem("topic", "diyalog")).not.toContain("Belgende geçmiyor ama");
    expect(podcastVerifySystem("document")).toContain("F) 'Belgende geçmiyor ama bilmen iyi olur:' cümlesinde yanlış");
    expect(podcastVerifySystem("document")).toContain("A-F 'high'");
    expect(podcastVerifySystem("document")).toContain("Kaynakta dayanağı olmayan");
  });

  it("denetçiye kaynakta geçmeyen sayılar ipucu olarak verilir", () => {
    const episode = parseTeacherPodcast(
      { ...draft, chapters: [{ title: "Politropik iş", lines: [line("İdeal gaz 300 K'de, R = 0,287 iken iş 59,7 kJ çıkar."), line("Bu bir örnektir.")] }, ...draft.chapters.slice(1)] },
      { length: "basit", topicLabel: "Sınır işi" },
    )!;
    const prompt = podcastVerifyUserPrompt(episode, {
      topicLabel: "Sınır işi",
      prepTitle: "Termodinamik",
      pages: [{ page: 14, text: "Gaz 200 kPa sabit basınçta 0,10 m³'ten 0,30 m³'e genleşiyor. W = 40 kJ." }],
      length: "basit",
    });
    expect(prompt).toMatch(/KAYNAKTA GEÇMEYEN SAYILAR: .*300/);
    expect(prompt).toContain("59.7");
  });
});

describe("öğretmen podcast motoru: döngü", () => {
  const input = { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], length: "basit" as const };

  it("denetçi sorun bulursa model düzeltir; sorun kalmazsa podcast döner", async () => {
    let verify = 0;
    const ask = vi.fn(async (system: string) => {
      if (system.includes("denetçisisin")) {
        verify += 1;
        return verify === 1 ? { issues: [{ where: "chapters[1]", problem: "Organ satımı kaynakta yok" }] } : { issues: [] };
      }
      if (system.startsWith("Sen aynı podcast")) {
        return { ...draft, chapters: [draft.chapters[0], { title: "Mutlak butlan", lines: [line("Mutlak butlanda işlem kesin geçersizdir."), line("Sonradan geçerli hâle getirilemez.")] }, ...draft.chapters.slice(2)] };
      }
      return draft;
    });
    const loop = await teacherPodcastLoop(ask, input);
    expect(loop.problems).toEqual([]);
    expect(loop.drafts).toBe(2);
    expect(JSON.stringify(loop.episode)).not.toContain("Organ satımı");
  });
});

describe("rota podcast'i öğretmen motoruna yollar", () => {
  it("yalnız öğretmen motoru, çekirdek sayfa ya da belgesiz; önbellek korunur", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('const TEACHER_PAGE_KINDS = new Set<PlanNodeKind>([...TEACHER_QUIZ_KINDS, ...TEACHER_CARD_KINDS, "podcast", "true_false"]);');
    expect(route).toContain("const episode = await teacherPodcastEpisode(input, core, length);");
    // Sayfa listesi boş düğümde test ve podcast dersin çözücüsünden aynı sayfaları alır.
    const block = route.slice(route.indexOf("if (TEACHER_PAGE_KINDS.has(kind) && teachingV2"), route.indexOf("// Podcast, sayfa kaynağı duruyorsa"));
    expect(block).toContain("await resolveLessonSource(service, {");
    // Eski zincir ve motor anahtarları 3 Ekim 2026'da silindi.
    expect(readFileSync("src/lib/env.ts", "utf8")).not.toMatch(/(LESSON|QUIZ|PODCAST|CARDS|PRACTICE)_ENGINE: z/);
    expect(route).toContain('const noPages = () => new NodeGenerationError(503, "source_unavailable", ["lesson_core_missing"]);');
  });
});
