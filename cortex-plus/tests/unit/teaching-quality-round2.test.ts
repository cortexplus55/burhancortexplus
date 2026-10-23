import { describe, expect, it } from "vitest";
import { repetitionIssues, sourceFrameIssue, TEACHER_SYSTEM, verifySystem } from "@/lib/learning/teacher-lesson";
import { nearSameQuestion, reviewItemProblems, stemOverlap } from "@/lib/learning/teacher-brain";
import { TEACHING_RUBRIC } from "@/lib/learning/teaching-rubric";
import { podcastLineProblems, podcastStructureIssues, podcastSystem } from "@/lib/learning/teacher-podcast";
import { DUO_TURN_RULE } from "@/lib/learning/podcast-formats";
import { podcastSyllabusLines } from "@/lib/learning/podcast-episode";
import { TOPIC_TEST_RULE, quizSetIssues } from "@/lib/learning/teacher-quiz";
import type { LessonBlock, LessonScreen } from "@/lib/learning/lesson-v3";
import type { PodcastEpisode } from "@/lib/learning/podcast-episode";

/*
  22 Ekim 2026, kör kıyas 2. tur (on çift, iki sıra, dört göz). Doğrulukta 20/20, sınav gözünde 18/20 bizden yana;
  öğrenci gözünde 12/20 Astra'dan yana, podcast'te üç gözde Astra önde. Yargıçların ortak cümlesi: "kaynağın tekrarı
  gibi okunuyor". Buradaki örnekler o turun Cortex malzemesinden birebir alındı.
*/

const text = (value: string): LessonBlock => ({ type: "text", text: value });
const note = (title: string, body: string, tone: "info" | "general" | "warn" = "info"): LessonBlock =>
  ({ type: "note", note: { title, body, tone } }) as LessonBlock;
const table = (rows: string[][]): LessonBlock =>
  ({ type: "table", table: { caption: "Seçim tarihleri", columns: ["Yıl", "Olay"], rows } }) as LessonBlock;
const screen = (heading: string, blocks: LessonBlock[]): LessonScreen => ({ heading, concept: heading, blocks });

const YSK =
  "Yüksek Seçim Kurulu 1950’de kurulmuş, 1961’de anayasal nitelik kazanmıştır. Kurul 7 asil ve 4 yedek üyeden oluşur; " +
  "6 üye Yargıtay’dan, 5 üye Danıştay’dan gelir.";
const DATES = [
  ["1934", "Genel oy"],
  ["1946", "Çok partili ilk seçim"],
  ["1950", "Gizli oy ve açık sayım"],
];

describe("ders: ekranlar arası tekrar (K2, R1)", () => {
  it("aynı paragraf ve aynı tablo sonraki ekranda yeniden verilince işaretlenir (öğretim önemi)", () => {
    const screens = [
      screen("Demokratik devlet", [text(`Demokratik devlette seçimler düzenli ve serbest yapılır. ${YSK}`), table(DATES)]),
      screen("Seçim tarihleri", [text("Çok partili ilk seçimi gizli oyun uygulandığı seçimle karıştırma."), table(DATES)]),
      screen("Yüksek Seçim Kurulu", [text(`${YSK} Kararları kesindir ve yargı yolu kapalıdır.`)]),
    ];
    const found = repetitionIssues(screens, [1, 2]);
    expect(found.map((issue) => [issue.where, issue.severity])).toEqual([
      ["screens[1].blocks[1]", "medium"],
      ["screens[2].blocks", "medium"],
    ]);
    expect(found[0]!.problem).toContain("1. ekranda zaten verildi");
    expect(found[1]!.problem).toContain("yeniden anlatıyor");
  });

  it("üstüne kuran ekran tekrar sayılmaz", () => {
    const screens = [
      screen("YSK", [text(YSK)]),
      screen("YSK kararları", [text("YSK kararlarına karşı yargı yolu kapalıdır; bu, yasamanın yargı denetiminden kısıntısıdır.")]),
    ];
    expect(repetitionIssues(screens, [1])).toEqual([]);
  });

  it("kuralı 'bir kişi' diye yeniden söyleyen örnek vaka işaretlenir; somut ayrıntılı vaka geçer", () => {
    const rule = "Seçilme yeterliliği olmadığı milletvekili seçildikten sonra anlaşılırsa vekilliği YSK kararıyla düşer.";
    const fake = screen("YSK", [
      text(rule),
      note("Örnek vaka: Yeterliliği olmayan milletvekili", "Bir kişi milletvekili seçildikten sonra seçilme yeterliliği olmadığı anlaşılırsa, vekilliği YSK kararıyla düşer."),
    ]);
    const real = screen("YSK", [
      text(rule),
      note(
        "Örnek vaka: Ayşe Hanım’ın itirazı",
        "Ayşe Hanım 2023’te seçildi; altı ay sonra memuriyetten istifa etmediği ortaya çıktı. YSK vekilliğin düştüğüne karar verdi, Ayşe Hanım mahkemeye gidemez.",
      ),
    ]);
    expect(repetitionIssues([fake], [0]).map((issue) => issue.problem)).toEqual([expect.stringContaining("vaka kurmuyor")]);
    expect(repetitionIssues([real], [0])).toEqual([]);
  });
});

describe("ders: kaynağa ve kaynağın biçimine gönderme (K2, R2)", () => {
  it("'için verilen bilgi', 'Notlarda … belirtiliyor', 'kaynakta verilen' yakalanır; genel bilgi kutusu ve düz anlatım geçer", () => {
    expect(sourceFrameIssue(screen("Seçim", [text("Genel oy için verilen bilgi 1934 yılıdır.")]))).toBe("için verilen bilgi");
    const retry = {
      type: "check",
      check: {
        type: "mcq",
        prompt: "Soru",
        options: ["a", "b", "c", "d"],
        answerIndex: 0,
        explanation: "x",
        review: { prompt: "Notlarda çok partili ilk seçimin 1946’da yapıldığı belirtiliyor. Hangi yıl?" },
      },
    } as LessonBlock;
    expect(sourceFrameIssue(screen("Seçim", [text("Çok partili ilk seçim 1946’dadır."), retry]))).toBe("Notlarda");
    expect(sourceFrameIssue(screen("Beslenme", [text("Bu durumda kaynakta verilen uyarı geçerlidir.")]))).toBe("kaynakta");
    expect(sourceFrameIssue(screen("Seçim", [note("Genel bilgi: Genel oy", "Belgede geçmiyor ama genel oy herkesin oy hakkıdır.", "general")]))).toBeNull();
    expect(sourceFrameIssue(screen("Seçim", [text("Genel oy ilkesinin yılı 1934; çok partili ilk seçim 1946.")]))).toBeNull();
  });

  it("yazar ve denetçi aynı ölçütü okur: tekrar, ikinci soru, çözümlü örnek adımı, kaynağı anmama", () => {
    for (const phrase of ["Aynı tabloyu ya da paragrafı ikinci", "'Doğrusu' cümlesini yeniden sormaz", "8) Çözümlü örnek", "9) Kaynağı ve biçimini anma"]) {
      expect(TEACHING_RUBRIC).toContain(phrase);
    }
    expect(TEACHER_SYSTEM).toContain(TEACHING_RUBRIC);
    expect(verifySystem("document")).toContain(TEACHING_RUBRIC);
    expect(TEACHER_SYSTEM).toContain("Kuralı 'Bir kişi …' diye yeniden söyleyen kutu da vaka değildir");
  });
});

describe("ikinci soru ana sorunun aynısı olamaz (R3, T3)", () => {
  const tfMain = {
    type: "trueFalse" as const,
    prompt: "Yenidoğanda resüsitasyon gerekiyorsa öncelik göğüs kompresyonudur.",
    options: ["Doğru", "Yanlış"],
    answerIndex: 1,
    explanation: "Öncelik etkili ventilasyondur.",
    corrected: "Yenidoğanda resüsitasyon gerekiyorsa öncelik etkili ventilasyondur.",
  };

  it("doğru/yanlışta 'Doğrusu' cümlesini yeniden soran ikinci soru reddedilir", () => {
    const same = {
      ...tfMain,
      review: {
        prompt: "Yenidoğanda resüsitasyon gereksinimi varsa etkili ventilasyon önceliklidir.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Öncelik ventilasyondur.",
      },
    };
    expect(reviewItemProblems(same).join(" ")).toContain("'Doğrusu' cümlesinin aynısı");
    const fresh = {
      ...tfMain,
      review: {
        prompt: "Doğumdan hemen sonra nefes almayan bebekte ilk iş kalp masajına başlamaktır.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Önce etkili ventilasyon sağlanır.",
      },
    };
    expect(reviewItemProblems(fresh)).toEqual([]);
  });

  it("çoktan seçmelide kökün neredeyse aynısı reddedilir; yeni bir durum geçer", () => {
    const main = {
      type: "mcq" as const,
      prompt: "Prematüre bir bebekte sürfaktan eksikliğiyle ilişkili solunum tablosu hangisidir?",
      options: ["Yenidoğan sepsisi", "Hipoglisemi", "Respiratuvar distres sendromu", "Geçici takipne"],
      answerIndex: 2,
      explanation: "Sürfaktan eksikliği RDS yapar.",
    };
    const near = {
      ...main,
      review: {
        prompt: "Prematüre bir bebekte sürfaktan eksikliğiyle ilişkilendirilen solunum tablosu hangisidir?",
        options: ["Geçici takipne", "Respiratuvar distres sendromu", "Hipoglisemi", "Yenidoğan sepsisi"],
        answerIndex: 1,
        explanation: "Sürfaktan eksikliği RDS yapar.",
      },
    };
    expect(reviewItemProblems(near).join(" ")).toContain("neredeyse aynısı");
    const fresh = {
      ...main,
      review: {
        prompt: "30. haftada doğan bebekte doğumdan saatler sonra artan inleme ve çekilme var. En olası tablo hangisidir?",
        options: ["Geçici takipne", "Respiratuvar distres sendromu", "Hipoglisemi", "Yenidoğan sepsisi"],
        answerIndex: 1,
        explanation: "Prematürede sürfaktan eksikliği RDS yapar; geçici takipne miadında sezaryenle doğanda görülür.",
      },
    };
    expect(reviewItemProblems(fresh)).toEqual([]);
  });

  it("sayıları değişen hesap sorusu yeni sorudur; aynı sayıların yer değiştirmesi değil", () => {
    const main = "Ölçümü 104 cm, yaşıt ortalaması 110 cm, SD 3 cm olan çocuğun Z-skoru kaçtır?";
    expect(nearSameQuestion("Ölçümü 102 cm, yaşıt ortalaması 110 cm, SD 4 cm olan çocuğun Z-skoru kaçtır?", main)).toBe(false);
    expect(
      nearSameQuestion("Annesi 176 cm, babası 160 cm olan erkek çocuğun hedef boyu kaçtır?", "Annesi 160 cm, babası 176 cm olan erkek çocuğun hedef boyu kaçtır?"),
    ).toBe(true);
  });

  it("örtüşme ölçüsü kısa metinleri karşılaştırmaz", () => {
    expect(stemOverlap("45°–45°–90° üçgeninin kenar oranı", "30°–60°–90° üçgeninde kenar oranı")).toBe(0);
  });
});

const line = (speaker: "ada" | "kerem", value: string) => ({ speaker, text: value });

describe("podcast: evet/hayır kalıbı, yalnız soran Kerem, bağlamsız sınav satırı (P)", () => {
  const robotic: PodcastEpisode = {
    title: "Büyüme ve Gelişme",
    length: "diyalog",
    chapters: [
      {
        title: "Büyüme ve gelişme",
        lines: [
          line("kerem", "Bir çocuğun boyunun uzamasıyla yeni bir beceri kazanması aynı şeyi mi gösterir?"),
          line("ada", "Hayır; büyüme vücut ölçülerindeki niceliksel artıştır, gelişme ise becerilerin olgunlaşmasıdır."),
          line("kerem", "Sosyal gülümseme ölçü değil, gelişim basamağı sayılır mı?"),
          line("ada", "Evet; boy ve kilo büyümeyle, sosyal gülümseme ise gelişmeyle ilgilidir."),
          line("ada", "Bu konu sınavda ağırlıklı."),
        ],
      },
      {
        title: "Persentil eğrisi",
        lines: [
          line("kerem", "Normal aralıktaki bir çocuğu tek ölçümle değerlendirebilir miyim?"),
          line("ada", "Hayır; bu ölçüler zamana karşı persentil eğrisiyle değerlendirilir."),
          line("kerem", "Kilo da boy gibi yavaş mı etkilenir?"),
          line("ada", "Kilo akut beslenme durumundan daha hızlı etkilenir."),
        ],
      },
    ],
  };

  it("kod üç evet/hayır açılışını ve soru ağırlıklı Kerem'i kayda geçirir; düzeltme turu açmaz (23 Ekim 2026)", async () => {
    const { podcastFlowNotes } = await import("@/lib/learning/teacher-podcast");
    expect(podcastStructureIssues(robotic).some((issue) => issue.startsWith("Evet/Hayır"))).toBe(false);
    const found = podcastFlowNotes(robotic);
    expect(found.some((issue) => issue.startsWith("Evet/Hayır kalıbı 3 satırda"))).toBe(true);
    expect(found.some((issue) => issue.startsWith("Kerem'in sıralarının 4/4'i soru"))).toBe(true);
    expect(found.some((issue) => issue.includes("bağlamsız 'sınavda ağırlıklı'"))).toBe(true);
  });

  it("bağlamsız sınav satırı artık silinmez (akış gözlemi)", () => {
    expect(podcastLineProblems(robotic)).toEqual([]);
  });

  it("yazar ve denetçi aynı konuşma kuralını okur; sınav ağırlığı kalıp cümleyle istenmez", () => {
    expect(DUO_TURN_RULE).toContain("Cevap 'Evet;' ya da 'Hayır;' diye açılmaz");
    expect(podcastSystem("document", "diyalog")).toContain(DUO_TURN_RULE);
    const lines = podcastSyllabusLines("Mol kavramı", {
      weighted: [{ topic: "Mol kavramı", documentName: "not.pdf", note: "ağırlık 30", weight: 30 }],
      excluded: [],
    });
    expect(lines).toContain("tek başına kalıp cümle olarak kurma");
    expect(lines).not.toContain("Bunu bir cümlede açıkça söyle");
  });
});

describe("konu testi: aynı testte iki soru aynı (K2 S3/S4)", () => {
  const q = (text: string) => ({
    text,
    options: ["Kişisel oy", "Eşit oy", "Genel oy", "Gizli oy"],
    correctIndex: 0,
    explanation: "Kişisel oy bizzat oy kullanmaktır.",
  });

  it("neredeyse aynı ikinci soru I koduyla işaretlenir; kural metni yazar ve denetçide", () => {
    const found = quizSetIssues(
      [
        q("Bir Bakanın TBMM’de başka bir Bakan yerine oy kullanması hangi seçim ilkesiyle bağdaşmaz?"),
        q("Bir Bakanın TBMM’de başka bir Bakanın yerine oy kullanması hangi seçim ilkesiyle bağdaşmaz?"),
        q("YSK’nın kararlarına karşı hangi yola başvurulamaz?"),
      ] as never,
      { pointsAvailable: 0 },
    );
    expect(found.map((issue) => [issue.index, issue.code])).toEqual([[1, "I"]]);
    expect(TOPIC_TEST_RULE).toContain("'Bir öğrenci … diyor / savunuyor / yorumluyor' kalıbı vaka değildir");
  });
});

describe("podcast: sahne, neden, sıra (23 Ekim 2026, 3. kör ölçüm)", () => {
  it("yazar ve denetçi aynı kuralları okur; özette sahne yok; belgesiz kipte etiketli genel bilgi yok; J satır silmez", async () => {
    const { SCENE_RULE, CAUSE_RULE, ORDER_RULE, podcastVerifySystem, salvagePodcast } = await import("@/lib/learning/teacher-podcast");
    for (const rule of [SCENE_RULE, CAUSE_RULE, ORDER_RULE]) {
      expect(podcastSystem("document", "diyalog")).toContain(rule);
      expect(podcastVerifySystem("document")).toContain(rule);
      expect(podcastVerifySystem("topic")).toContain(rule);
    }
    expect(podcastSystem("document", "ozet")).not.toContain(SCENE_RULE);
    expect(podcastSystem("topic", "diyalog")).not.toContain("Belgende geçmiyor ama");
    expect(podcastSystem("document", "diyalog")).toContain("Kerem dinlediklerini kendi sözleriyle");
    const episode: PodcastEpisode = {
      title: "Büyüme",
      length: "diyalog",
      chapters: [
        { title: "Persentil", lines: [line("ada", "Çocuğun eğrisi önemlidir."), line("kerem", "Tek ölçüm yetmez mi?"), line("ada", "Yetmez, çünkü seyir görünmez.")] },
        { title: "Tekrar", lines: [line("kerem", "Eğri tek ölçümden değerli."), line("kerem", "Kilo hızlı değişir."), line("kerem", "Gerileme ciddidir.")] },
      ],
    };
    const salvaged = salvagePodcast(episode, ["[chapters[0]] (J) Bölüm sahneyle açılmıyor."]);
    expect(salvaged?.removed).toBe(0);
  });
});

describe("podcast kurtarma: soru silinince çıplak onay da gider (23 Ekim 2026)", () => {
  it("'Aynen.' yalnız önceki satır karşı konuşmacının sorusuysa kalır", async () => {
    const { salvagePodcast } = await import("@/lib/learning/teacher-podcast");
    const episode: PodcastEpisode = {
      title: "Büyüme",
      length: "soru_cevap",
      chapters: [
        {
          title: "Büyüme ve gelişme",
          lines: [
            line("kerem", "Boy uzaması ile beceri kazanmak aynı şey mi?"),
            line("kerem", "Bu iki durumu aynı şey sanmışım."),
            line("ada", "Aynen."),
            line("ada", "Büyüme ölçülerdeki artış, gelişme becerilerin olgunlaşmasıdır."),
          ],
        },
        { title: "Tekrar", lines: [line("kerem", "Büyüme ölçü artışıdır."), line("kerem", "Gelişme beceridir."), line("ada", "Gerileme ciddidir.")] },
      ],
    };
    const salvaged = salvagePodcast(episode, ["[chapters[0].lines[1]] (G) Yanılgı itirafı yersiz."])!;
    expect(salvaged.episode.chapters[0]!.lines.map((item) => item.text)).toEqual([
      "Boy uzaması ile beceri kazanmak aynı şey mi?",
      "Büyüme ölçülerdeki artış, gelişme becerilerin olgunlaşmasıdır.",
    ]);
  });
});
