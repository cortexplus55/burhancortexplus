import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { toDisplay } from "@/lib/learning/speech-normalizer";
import {
  REPEAT_RULE,
  TABLE_RULE,
  parsePodcastIssues,
  parseTeacherPodcast,
  podcastFixSystem,
  podcastIssueLine,
  podcastFlowNotes,
  podcastLineProblems,
  podcastStructureIssues,
  podcastSystem,
  podcastVerifySystem,
  podcastVerifyUserPrompt,
  salvagePodcast,
} from "@/lib/learning/teacher-podcast";
import { DUO_TURN_RULE } from "@/lib/learning/podcast-formats";
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
    // Ardışık tekrar 23 Ekim 2026'dan beri akış gözlemi: düzeltme turu açmaz, satır sildirmez.
    expect(issues).not.toMatch(/önceki cümlenin tekrarı/);
    expect(podcastFlowNotes(episode).join(" | ")).toMatch(/önceki cümlenin tekrarı/);
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
    expect(duo).toContain("Kerem 'Ben … sanmışım' diye itiraf etmez; yaygın hatayı 'Çoğu öğrenci … sanır' diye söyler");
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
    // 20 Ekim 2026: "kaynaktaki bir örnek" Kerem'e "Notlarındaki örnekte …" dedirtiyordu.
    expect(duo).toContain('{"speaker":"kerem","text":"1-3 cümle: bir örnek (kaynağı anmadan)');
    expect(duo).not.toContain("Kerem kesin bilgi vermez");
    const qa = podcastSystem("document", "soru_cevap");
    expect(qa).toContain("Kerem yalnızca soru sorar");
    expect(qa).not.toContain("Kerem yalnız soru sormaz");
    // Belgede olmayan bilgi: 20 Ekim etiketli (en çok iki), 23 Ekim gecesinden beri ders kitabı bilgisi etiketsiz.
    // 23 Ekim 2026 gecesi (ürün sahibinin kararı): ders kitabı bilgisi etiketsiz; sayı, eşik, doz, tanı ölçütü kaynaktan.
    const writer = podcastSystem("document", "diyalog");
    expect(writer).toContain("DERS KİTABI BİLGİSİ: Konuyu ders kitaplarında tartışmasız olan bilgiyle açabilirsin, etiket koymadan");
    expect(writer).toContain("Sayı, eşik, yaş sınırı, süre, tarih, doz, formül, tanı ölçütü ve sınıflandırma yalnızca");
    expect(writer).toContain("kaynak 'ayrıntılı değerlendirme' diyorsa 'acil' denmez");
    expect(writer).not.toContain("Kitaplarda şöyle anlatılır");
    expect(podcastSystem("topic", "diyalog")).not.toContain("DERS KİTABI BİLGİSİ");
    const verifier = podcastVerifySystem("document");
    expect(verifier).toContain("F) Ders kitabından katılan bilgide yanlış, tartışmalı ya da güncel olarak değişebilecek bilgi");
    expect(verifier).toContain("Doğru ve tartışmasız ders kitabı bilgisi etiketsiz olsa da sorun değildir.");
    expect(verifier).toContain("aciliyeti ya da önemi kaynaktan yükselten ifade");
    // Kapsam kalır, derinlik seçilir (1 dakikalık özette yok).
    expect(podcastSystem("document", "diyalog")).toContain("Kaynağın sınavda sorulan bütün noktalarını kapsa: tablo satırları, eşikler ve uyarı bulguları dahil");
    expect(podcastSystem("document", "ozet")).not.toContain("Kaynağın sınavda sorulan bütün noktalarını kapsa");
    // 23 Ekim 2026 (ürün sahibinin kararı): yalnız doğruluk yüksek; kulak maddeleri G-J düşük.
    expect(podcastVerifySystem("document")).toContain("A-F 'high'; G-J 'low'.");
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
    // 20 Ekim 2026: motor senaryoyla birlikte dinleme kontrolünü de döndürür.
    expect(route).toContain("const { episode, check } = await teacherPodcastEpisode(input, core, length);");
    // Sayfa listesi boş düğümde test ve podcast dersin çözücüsünden aynı sayfaları alır.
    const block = route.slice(route.indexOf("if (TEACHER_PAGE_KINDS.has(kind) && teachingV2"), route.indexOf("// Podcast, sayfa kaynağı duruyorsa"));
    expect(block).toContain("await resolveLessonSource(service, {");
    // Eski zincir ve motor anahtarları 3 Ekim 2026'da silindi.
    expect(readFileSync("src/lib/env.ts", "utf8")).not.toMatch(/(LESSON|QUIZ|PODCAST|CARDS|PRACTICE)_ENGINE: z/);
    expect(route).toContain('const noPages = () => new NodeGenerationError(503, "source_unavailable", ["lesson_core_missing"]);');
  });
});

/*
  19 Ekim 2026, ürün sahibi: "podcast istendiyse üretilsin; 'üretilemedi' olmasın". 18 Ekim'de
  iki podcast tek bir "bu konu sınavda ağırlıklı" cümlesi ve tutmayan bir eşitlik yüzünden
  tümden düşmüştü. Artık düzeltme turlarından sonra kalan sorunlu satır çıkarılır; satıra
  bağlanamayan sorun kaldıysa ikinci taslak yazılır.
*/
describe("öğretmen podcast motoru: kurtarma", () => {
  const episodeOf = () => parseTeacherPodcast(draft, { length: "basit", topicLabel: "Hükümsüzlük" })!;

  it("denetçinin gösterdiği satır çıkar; iki satırın altına inen bölüm düşer", () => {
    const out = salvagePodcast(episodeOf(), ["[chapters[1].lines[1]] Organ satımı kaynakta yok → çıkar"])!;
    expect(out.removed).toBe(2);
    expect(out.episode.chapters.map((chapter) => chapter.title)).toEqual(["Yokluk", "Nispi butlan", "Akılda kalacaklar"]);
    expect(JSON.stringify(out.episode)).not.toContain("Organ satımı");
  });

  it("'Cevap:' satırı giderse sorusu da gider; biçim sorunları yayını durdurmaz", () => {
    const out = salvagePodcast(episodeOf(), ["[chapters[0].lines[3]] Cevap eksik", "Bölüm sayısı 4; 5-7 olmalı."])!;
    expect(out.removed).toBe(2);
    expect(out.episode.chapters[0]!.lines.map((item) => item.beat ?? "")).toEqual(["", ""]);
    const untouched = salvagePodcast(episodeOf(), ["Bölüm sayısı 4; 5-7 olmalı."])!;
    expect(untouched.removed).toBe(0);
    expect(untouched.episode).toBe(untouched.episode);
  });

  it("satıra bağlanamayan sorun kurtarılmaz", () => {
    expect(salvagePodcast(episodeOf(), ["Denetim yapılamadı: zaman aşımı"])).toBeNull();
  });

  it("döngü: düzeltme aynı metni döndürse de sorunlu satır çıkarılır, podcast yayınlanır", async () => {
    const ask = vi.fn(async (system: string) => {
      if (system.includes("denetçisisin")) return { issues: [{ where: "chapters[1].lines[1]", severity: "high", problem: "Organ satımı kaynakta yok" }] };
      return draft;
    });
    const loop = await teacherPodcastLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], length: "basit" });
    expect(loop.problems).toEqual([]);
    expect(loop.salvaged).toBe(2);
    expect(loop.unverified).toBe(false);
    expect(JSON.stringify(loop.episode)).not.toContain("Organ satımı");
  });

  it("döngü: ilk düzeltmeden sonra kalan sorun 1-2 satırsa ikinci tur yerine satır çıkar (hız)", async () => {
    const roles: (string | undefined)[] = [];
    let fix = 0;
    const ask = vi.fn(async (system: string, _user: string, role?: "draft" | "verify" | "fix" | "script" | "scriptfix") => {
      roles.push(role);
      if (system.includes("denetçisisin")) return { issues: [{ where: "chapters[1].lines[1]", severity: "high", problem: "Organ satımı kaynakta yok" }] };
      if (system.startsWith("Sen aynı podcast")) {
        fix += 1;
        return { ...draft, title: `${draft.title} (düzeltme ${fix})` };
      }
      return draft;
    });
    const loop = await teacherPodcastLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], length: "ozet" });
    expect(loop.problems).toEqual([]);
    expect(fix).toBe(1);
    expect(roles).toEqual(["draft", "verify", "fix", "verify"]);
    expect(JSON.stringify(loop.episode)).not.toContain("Organ satımı");
  });

  it("döngü: satıra bağlanamayan sorun kalırsa ikinci taslak yazılır", async () => {
    let verify = 0;
    const ask = vi.fn(async (system: string) => {
      if (system.includes("denetçisisin")) {
        verify += 1;
        return verify === 1 ? { issues: [{ where: "chapters", severity: "high", problem: "Bütün anlatım yanlış çerçevede." }] } : { issues: [] };
      }
      return draft;
    });
    const loop = await teacherPodcastLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], length: "basit" });
    expect(loop.problems).toEqual([]);
    expect(loop.drafts).toBe(2);
    expect(loop.episode?.chapters).toHaveLength(4);
  });
});

/*
  20 Ekim 2026 kör kıyas (P6, bizim çıktımız): podcast robot gibiydi ve kendisiyle çelişiyordu.
  Kerem doğru cevabı verip "yanlış sanmışım" dedi; bir bölümde art arda iki soru sordu, Ada ilgisiz
  bir tanımla devam etti; "Notlarındaki örnekte" dört kez geçti (kod yazara söyletiyordu); 21
  hücrelik tablo satır satır okundu; "kendi eğrisi" beş kez söylendi. Yazar ve denetçi aynı kural
  metnini okur; kod yalnız işaretler ve siler.
*/
const k = (text: string) => line(text, "kerem");
const p6Draft = {
  title: "Büyüme ve Gelişme",
  chapters: [
    {
      title: "Persentil eğrisi",
      lines: [
        line("Bir çocuğun tek ölçümü normal aralıkta olsa bile, büyüme değerlendirmesi için bu bilgi tek başına yeterli midir?"),
        k("Hayır; boy, kilo ve baş çevresini zamana karşı persentil eğrisiyle değerlendirmek gerekir."),
        k("Çünkü tek ölçüm, çocuğun zaman içindeki değişimini göstermez."),
        line("Doğru."),
        line("Çocuğun kendi eğrisini koruması, çoğu zaman tek ölçümünün normal aralıkta olmasından daha değerlidir."),
        line("Böylece ölçümün gidişatını da yorumlarız."),
        k("Ben tek ölçümün normal aralıkta olmasını yeterli sanmışım."),
        k("Şimdi kendi eğrisine bakmanın, ölçümü zaman içinde karşılaştırmayı sağladığını anlıyorum."),
      ],
    },
    {
      title: "Büyüme ve gelişmenin ölçümleri",
      lines: [
        k("Kilo ile boy aynı hızda mı etkilenir?"),
        k("Ölçümleri birlikte yorumlarken bu ayrımı nasıl kullanmalıyız?"),
        line("Büyüme, vücut ölçülerindeki niceliksel artıştır; gelişme ise motor, dil, bilişsel ve sosyal becerilerin olgunlaşmasıdır."),
        k("Kilo, akut beslenme ve enerji dengesinden daha hızlı etkilenir; boy uzaması daha çok kronik süreçleri yansıtır."),
        line("Baş çevresi özellikle ilk 2 yılda beyin büyümesi hakkında önemli ipucu verir."),
      ],
    },
    {
      title: "Gelişim basamakları",
      lines: [
        line("Dokuz aylık bir çocuğun becerilerini düşün: Hangi basamak kaba motor, hangisi dil alanındadır?"),
        k("Notlarındaki örnekte 9 ayda kaba motor desteksiz oturur, emekleyebilir."),
        k("Notlarındaki örnekte 2 ayda başını kısa süre kaldırır, sosyal gülümser."),
        k("İki yaş satırında topa vurma dil basamağı mıdır, yoksa kaba motor basamağı mı?"),
        line("Kaba motor basamağıdır."),
        line("Aynı yaşın dil basamağı iki kelimeli cümlelerdir; beceriyi doğru alanla eşleştirmek yanılgıyı önler."),
      ],
    },
    {
      title: "Alarm bulguları",
      lines: [
        k("Bir çocuk daha önce kazandığı becerileri kaybediyorsa bunu yalnızca yaşıtlarından farklı gelişmesi diye yorumlamak doğru olur mu?"),
        line("Hayır."),
        line("Gelişimde gerileme her yaşta ciddidir; kazanılmış becerilerin kaybı sıradan bir farklılık değildir."),
        k("Notlarındaki örnekte sosyal gülümseme 2 ay satırındaki ince motor-sosyal basamaktadır."),
        line("Ayrıca 18 ayda anlamlı kelime olmaması ayrıntılı değerlendirme gerektirir."),
      ],
    },
    {
      title: "Büyüme ve gelişmenin değerlendirilmesi",
      lines: [
        line("Büyüme ölçülerde niceliksel artış, gelişme becerilerin olgunlaşmasıdır."),
        k("Boy, kilo ve baş çevresi zaman içindeki persentil eğrisiyle değerlendirilir."),
        line("Gelişimde gerileme her yaşta ciddidir."),
      ],
    },
  ],
};
const p6 = () => parseTeacherPodcast(p6Draft, { length: "diyalog", topicLabel: "Büyüme ve gelişme" })!;
const at = (episode: ReturnType<typeof p6>, chapter: number, start: string) =>
  episode.chapters[chapter]!.lines.findIndex((item) => item.text.startsWith(start));

describe("podcast: kaynağa gönderme yok (20 Ekim 2026)", () => {
  it("yazar 'notlarındaki' demeyi bilir; etiketli genel bilgi yalnız belgeli kipte", () => {
    for (const [mode, length] of [["document", "diyalog"], ["topic", "basit"], ["document", "ozet"]] as const) {
      expect(podcastSystem(mode, length)).toContain("'notlarındaki'");
      expect(podcastSystem(mode, length)).toContain("Bilgiyi kaynağa değil konuya bağla");
    }
    expect(podcastSystem("topic", "diyalog")).not.toContain("DERS KİTABI BİLGİSİ");
    expect(podcastSystem("document", "diyalog")).not.toContain("açılışları bu yasağın dışındadır");
    expect(podcastSystem("document", "diyalog")).not.toContain("kaynaktaki bir örneği anlatır");
    expect(podcastFixSystem("document", "diyalog")).toContain("kaynağa göndermeyi kaldır");
  });

  it("kod kaynağa göndermeyi tek sorun olarak işaretler; satır numarası yok, kurtarma silmez", () => {
    const episode = p6();
    const attribution = podcastStructureIssues(episode).filter((issue) => issue.startsWith("Kaynağa gönderme"));
    expect(attribution).toHaveLength(1);
    expect(attribution[0]).toContain("Notlarındaki örnekte 9 ayda");
    expect(attribution[0]).not.toMatch(/chapters\[\d+\]/);
    const salvaged = salvagePodcast(episode, attribution)!;
    expect(salvaged).not.toBeNull();
    expect(salvaged.removed).toBe(0);
  });

  it("etiketli genel bilgi ve 'belgende geçmiyor' gönderme sayılmaz; 'belgende yazan' sayılır", () => {
    const clean = parseTeacherPodcast(
      { ...draft, chapters: [{ title: "Yokluk", lines: [line("Belgende geçmiyor ama bilmen iyi olur: yokluk tespit davasıyla ileri sürülür."), line("Kurucu unsur eksikse işlem hiç doğmamış sayılır.")] }, ...draft.chapters.slice(1)] },
      { length: "basit", topicLabel: "Hükümsüzlük" },
    )!;
    expect(podcastStructureIssues(clean).some((issue) => issue.startsWith("Kaynağa gönderme"))).toBe(false);
    const cited = parseTeacherPodcast(
      { ...draft, chapters: [{ title: "Yokluk", lines: [line("Belgende yazan örnekte nikâh memuru yoktur."), line("Notlarına göre bu evlilik yok hükmündedir.")] }, ...draft.chapters.slice(1)] },
      { length: "basit", topicLabel: "Hükümsüzlük" },
    )!;
    expect(podcastStructureIssues(cited).filter((issue) => issue.startsWith("Kaynağa gönderme"))).toHaveLength(1);
  });
});

describe("podcast: konuşma ve kulak kuralları yazarda ve denetçide aynı metin", () => {
  it("konuşma sırası kuralı iki sunuculu yazarda ve iki kipteki denetçide", () => {
    for (const length of ["diyalog", "soru_cevap"] as const) expect(podcastSystem("document", length)).toContain(DUO_TURN_RULE);
    expect(podcastSystem("document", "diyalog")).toContain("Kerem Ada'nın cümlesini tekrar etmez");
    for (const mode of ["document", "topic"] as const) {
      const verify = podcastVerifySystem(mode);
      expect(verify).toContain(DUO_TURN_RULE);
      expect(verify).toContain(TABLE_RULE);
      expect(verify).toContain(REPEAT_RULE);
      expect(verify).toContain("G) (İki konuşmacılı metinde)");
      expect(verify).toContain('"rule"');
    }
    expect(podcastVerifySystem("topic")).toContain("A-E 'high'; G-J 'low'.");
    expect(podcastVerifySystem("document")).toContain("Şunlar da 'low': tekdüze anlatım, uzunluk, bilgi taşımayan cümle.");
  });

  it("tablo ve tekrar kuralı her türün yazarında; bölüm kalıbı geri gelmez", () => {
    for (const length of ["diyalog", "basit", "ozet", "derin", "soru_cevap"] as const) {
      const system = podcastSystem("document", length);
      expect(system, length).toContain(TABLE_RULE);
      expect(system, length).toContain(REPEAT_RULE);
      expect(system, length).toContain("Her bölüm (son tekrar bölümü hariç) tek bir fikir taşır");
      expect(system, length).not.toContain("Her bölüm: ne olduğu");
    }
  });

  it("denetçinin madde harfi okunur; tanınmayan harf atılır", () => {
    const issues = parsePodcastIssues({
      issues: [
        { where: "chapters[0].lines[1]", rule: "g", severity: "high", problem: "Soru cevapsız" },
        { where: "chapters[1].lines[0]", rule: "Z", severity: "high", problem: "Bilinmeyen" },
        { where: "chapters[2]", severity: "low", problem: "Tekdüze" },
        { where: "chapters[3]", rule: "A" },
      ],
    });
    expect(issues.map((issue) => issue.rule)).toEqual(["G", undefined, undefined]);
    expect(podcastIssueLine(issues[0]!)).toBe("[chapters[0].lines[1]] (G) Soru cevapsız");
  });
});

describe("podcast kurtarma: kulak kuralları (20 Ekim 2026)", () => {
  it("I (tablo okuma) silinmez; satırsız H bölüm düşürmez ve yayını durdurmaz", () => {
    const episode = p6();
    const table = salvagePodcast(episode, ["[chapters[2].lines[1]] (I) Tablo satır satır okunuyor"])!;
    expect(table.removed).toBe(0);
    const repeat = salvagePodcast(episode, ["[chapters[1]] (H) 'kendi eğrisi' tekrar ediyor"])!;
    expect(repeat).not.toBeNull();
    expect(repeat.removed).toBe(0);
    expect(repeat.episode.chapters).toHaveLength(episode.chapters.length);
  });

  it("G satırı çıkar: doğruyu kendisi söyleyip yanılgı itiraf eden satır", () => {
    const episode = p6();
    const confession = at(episode, 0, "Ben tek ölçümün");
    const out = salvagePodcast(episode, [`[chapters[0].lines[${confession}]] (G) Doğruyu kendisi söyledikten sonra yanılgı itirafı`])!;
    expect(out.removed).toBe(1);
    expect(JSON.stringify(out.episode)).not.toContain("yeterli sanmışım");
  });

  it("cevabın ilk satırı giderse soru da gider; soru giderse çıplak 'Hayır.' da gider", () => {
    const episode = p6();
    const answer = at(episode, 2, "Kaba motor basamağıdır");
    const first = salvagePodcast(episode, [`[chapters[2].lines[${answer}]] Eksik cevap`])!;
    expect(JSON.stringify(first.episode)).not.toContain("topa vurma dil basamağı mıdır");
    expect(first.removed).toBe(2);
    const question = at(episode, 3, "Bir çocuk daha önce");
    const second = salvagePodcast(episode, [`[chapters[3].lines[${question}]] (G) Soru cevapsız`])!;
    expect(second.removed).toBe(2);
    expect(second.episode.chapters[3]!.lines[0]!.text).toMatch(/^Gelişimde gerileme/);
  });

  it("kod ikinci yanılgı itirafını ve kimsenin cevaplamadığı soruyu işaretler (yalnız iki sunucuda)", () => {
    const twice = parseTeacherPodcast(
      {
        ...p6Draft,
        chapters: [
          ...p6Draft.chapters.slice(0, 4),
          { title: "Değerlendirme", lines: [k("Ben kiloyu boyla aynı sanmışım."), line("Kilo akut süreçleri yansıtır."), k("Peki baş çevresi neyi gösterir?")] },
        ],
      },
      { length: "diyalog", topicLabel: "Büyüme" },
    )!;
    // 23 Ekim 2026'dan beri akış gözlemi: kayda geçer, satır sildirmez, düzeltme turu açmaz.
    const notes = podcastFlowNotes(twice);
    expect(notes).toContain("chapters[4].lines[0]: ikinci yanılgı itirafı");
    expect(notes).toContain("chapters[4].lines[2]: cevapsız soru");
    expect(podcastLineProblems(twice)).toEqual([]);
    expect(podcastStructureIssues(twice).some((issue) => issue.includes("ikinci yanılgı itirafı"))).toBe(false);
    // Tek öğretmende konuşma kuralı yok: bölüm sonundaki soru dinleyene sorulabilir.
    const single = parseTeacherPodcast(
      { ...draft, chapters: [...draft.chapters.slice(0, 3), { title: "Akılda kalacaklar", lines: [line("Yoklukta işlem doğmaz."), line("Mutlak butlanda işlem kesin geçersizdir."), line("Sence hangisi daha ağır?")] }] },
      { length: "basit", topicLabel: "Hükümsüzlük" },
    )!;
    expect(podcastLineProblems(single)).toEqual([]);
  });

  it("döngü: denetçinin I sorunu düzeltme turuna harfiyle gider, sonra podcast silinmeden yayınlanır", async () => {
    const roles: (string | undefined)[] = [];
    const fixPrompts: string[] = [];
    let fix = 0;
    const ask = vi.fn(async (system: string, user: string, role?: "draft" | "verify" | "fix" | "script" | "scriptfix") => {
      roles.push(role);
      if (system.includes("denetçisisin")) {
        return { issues: [{ where: "chapters[1].lines[0]", rule: "I", severity: "high", problem: "Tablo satır satır okunuyor" }] };
      }
      if (system.startsWith("Sen aynı podcast")) {
        fix += 1;
        fixPrompts.push(user);
        return { ...draft, title: `${draft.title} (düzeltme ${fix})` };
      }
      return draft;
    });
    const loop = await teacherPodcastLoop(ask, { topicLabel: "Hükümsüzlük", prepTitle: "KPSS", pages: [{ page: 8, text: "Yokluk…" }], length: "basit" });

    expect(roles).toEqual(["draft", "verify", "fix", "verify"]);
    expect(fixPrompts[0]).toContain("[chapters[1].lines[0]] (I) Tablo satır satır okunuyor");
    expect(loop.problems).toEqual([]);
    expect(loop.salvaged).toBe(0);
    expect(loop.earIssues).toEqual({ G: 0, H: 0, I: 1 });
    expect(loop.episode?.chapters).toHaveLength(4);
  });
});
