import { describe, expect, it } from "vitest";
import {
  EMPHASIS_RULE,
  MNEMONIC_EXAMPLES,
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  TOPIC_VERIFY_SYSTEM,
  VERIFY_SYSTEM,
  conceptStructureIssues,
  denseTableIssues,
  fixPartSystem,
  flattenedTableIssue,
  lessonStructureIssues,
  parseIssues,
  partStructureIssues,
  screenStructureIssues,
  verifySystem,
} from "@/lib/learning/teacher-lesson";
import { OPTION_ORDER_RULE } from "@/lib/learning/option-reference";
import { SOURCE_LINK_EXEMPTION, TEACHING_RUBRIC } from "@/lib/learning/teaching-rubric";
import type { LessonBlock, LessonScreen, LessonV3 } from "@/lib/learning/lesson-v3";

/*
  20 Ekim 2026 kör kıyas (aynı belgeyle Astra ve Cortex dersleri yan yana; ders çiftleri KPSS, trigonometri, Pediatri).
  Doğrulukta önde, öğretimde geride kaldık: şemadaki yer tutucu ekrana çıktı, yoğun tablo tek ekranda okunup geçildi,
  ezber kodları yalnız sırayı taşıdı, "Günlük hayattan" kutuları düz kaldı, ikinci soru başka kavramı sordu.
  Bu dosya yazar ve denetçinin aynı kuralı okuduğunu ve kodun kurallarını tutar.
*/

const tf = (prompt = "Bölgeli devlette her bölgenin ayrı bir hukuk düzeni vardır.") =>
  ({
    type: "check",
    check: {
      type: "trueFalse",
      prompt,
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: "Bölgeli devlette hukuk düzeni tektir.",
      corrected: "Bölgeli devlette hukuk düzeni tektir; bölgelere yetki tanınır.",
      review: {
        prompt: "Bölgelerine kendi meclisini veren bir ülkede bölgelerin ayrı anayasası olur.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Bölgeli devlette anayasa tektir.",
        corrected: "Bölgeli devlette anayasa tektir.",
      },
    },
  }) as LessonBlock;

const mcq = (prompt: string, review?: Record<string, unknown>) =>
  ({
    type: "check",
    check: {
      type: "mcq",
      prompt,
      options: ["Üniter devlet", "Bölgeli devlet", "Federasyon", "Konfederasyon"],
      answerIndex: 1,
      explanation: "Tek hukuk ve milliyetler prensibi bölgeli devlettir; federasyonda ayrı hukuk düzenleri vardır.",
      optionWhy: ["Tek hukuk, milli birlik.", "Tek hukuk, milliyetler prensibi.", "Ayrı hukuk, anayasa.", "Ayrı hukuk, antlaşma."],
      review: review ?? {
        prompt: "İspanya'da bölgeler kendi meclislerini kuruyor ama hukuk düzeni tek. Bu yapı hangisidir?",
        options: ["Federasyon", "Bölgeli devlet", "Üniter devlet", "Konfederasyon"],
        answerIndex: 1,
        explanation: "Tek hukuk düzeni ve milliyetler prensibi bölgeli devlettir; federasyonda bölgelerin ayrı hukuku vardır.",
      },
    },
  }) as LessonBlock;

const text = (value: string) => ({ type: "text", text: value }) as LessonBlock;
const caseNote = { type: "note", note: { title: "Örnek vaka: İspanya", body: "Bölgeler meclis kurar, hukuk tektir.", tone: "info" } } as LessonBlock;

const screen = (heading: string, blocks: LessonBlock[], concept = heading): LessonScreen => ({ heading, concept, blocks });

const lesson = (screens: LessonScreen[]): LessonV3 => ({
  format: 3,
  title: "Devlet Şekilleri",
  overview: "Aynı ülkede bölgeler meclis kuruyorsa devlet bölünmüş müdür?",
  objective: "Devlet şekillerini ayırt etmek.",
  screens,
  summary: ["Üniter: tek hukuk, milli birlik.", "Bölgeli: tek hukuk, milliyetler.", "Federasyon: ayrı hukuk, anayasa."],
  nextFocus: [],
});

describe("yer tutucu başlık (C1)", () => {
  it("şema ve kurallar 'X ile Y farkı'nı örnek başlık olarak vermez", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).not.toContain("'X ile Y farkı'");
      expect(system).not.toContain('"X ile Y farkı"');
    }
  });

  const flagged = (block: LessonBlock, heading = "Bölgeli devlet") =>
    screenStructureIssues(screen(heading, [text("Bölgeli devlette hukuk tektir."), block, mcq("Hangisi?")]), 1, {}).filter(
      (issue) => /yer tutucu/.test(issue.problem),
    );
  const note = (title: string) => ({ type: "note", note: { title, body: "Fark şudur.", tone: "warn" } }) as LessonBlock;

  it("şemadan kopyalanan başlık yüksek önemle yakalanır", () => {
    for (const title of ["X ile Y farkı", "X ve Y farkı", "X ile Y'nin arasındaki farkı", "<karıştırılan kavram> ile <öteki kavram> farkı", "Ezber kodu: <kod>", "Fark (iki kavramın gerçek adıyla)"]) {
      expect(flagged(note(title)).map((issue) => issue.severity), title).toEqual(["high"]);
    }
    expect(flagged({ type: "table", table: { caption: "Basamaklar …", columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] } } as LessonBlock)).toHaveLength(1);
    expect(flagged({ type: "cards", cards: [{ title: "kardeş kavram", body: "tanım" }, { title: "Federasyon", body: "tanım" }] } as LessonBlock)).toHaveLength(1);
    expect(screenStructureIssues(screen("ikinci kavramın adı", [text("Metin."), mcq("Hangisi?")]), 1, {}).some((issue) => /yer tutucu/.test(issue.problem))).toBe(true);
  });

  it("gerçek kavram adlarına dokunmaz", () => {
    for (const title of ["Hepatit A ile B farkı", "X ile Y kromozomu farkı", "Yokluk ile butlan farkı", "Sıkıştırılmış sıvı (T < Tsat) ve kızgın buhar (T > Tsat)"]) {
      expect(flagged(note(title)), title).toEqual([]);
    }
  });
});

describe("yazar ve denetçi aynı metni okur (C2b, C4e, C5, C7)", () => {
  it("şık sırası kuralı iki denetçide de birebir", () => {
    for (const system of [verifySystem("document"), verifySystem("topic")]) expect(system).toContain(OPTION_ORDER_RULE);
  });

  it("denetçi ikinci soruyu (review) da denetler", () => {
    for (const system of [verifySystem("document"), verifySystem("topic")]) {
      expect(system).toContain("'review' alanına");
      expect(system).toContain("review'un explanation ve corrected'ı dahil");
    }
  });

  it("öğretim ölçütü yazar, düzeltici ve iki denetçide aynı metin; 'medium'", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM, fixPartSystem("document"), fixPartSystem("topic"), verifySystem("document"), verifySystem("topic")]) {
      expect(system).toContain(TEACHING_RUBRIC);
    }
    expect(VERIFY_SYSTEM).toContain("J) ");
    expect(VERIFY_SYSTEM).toContain("'medium'");
    expect(TOPIC_VERIFY_SYSTEM).toContain("H 'medium'");
    // Öğretici olmayan soru artık 'low' değil, J ('medium').
    const lowList = VERIFY_SYSTEM.slice(VERIFY_SYSTEM.indexOf("Şunlar 'low'"));
    expect(lowList).not.toContain("öğretici olmayan soru");
  });

  it("kaynak kuralının dar istisnası yazarda ve denetçinin A maddesinde aynı cümle; belgesiz derste yok", () => {
    expect(TEACHER_SYSTEM).toContain(SOURCE_LINK_EXEMPTION);
    expect(VERIFY_SYSTEM).toContain(SOURCE_LINK_EXEMPTION);
    expect(SOURCE_LINK_EXEMPTION).toContain("yalnız 'Genel bilgi' kutusunda");
    expect(TOPIC_TEACHER_SYSTEM).not.toContain(SOURCE_LINK_EXEMPTION);
  });

  it("ezber kodu isteğe bağlı: ayrımı ya da istenen listeyi kodlar; olmaması sorun değil", () => {
    expect(EMPHASIS_RULE).not.toMatch(/ZORUNLU|zorunlu kural/);
    expect(EMPHASIS_RULE).toContain("isteğe bağlı");
    expect(EMPHASIS_RULE).toContain("soy → monarşi");
    expect(MNEMONIC_EXAMPLES).toContain("Soyda Mon, zümrede Oli, din adamında Teo, toplumda Cum");
    expect(MNEMONIC_EXAMPLES).toContain("'ÜB-FK'");
    expect(VERIFY_SYSTEM).not.toContain("ezber kodu olmaması");
    expect(VERIFY_SYSTEM).toContain("olmaması sorun değildir");
    expect(TOPIC_VERIFY_SYSTEM).toContain(MNEMONIC_EXAMPLES);
  });

  it("ikinci soru tam öğe istenir: şemada şıkları, anahtarı ve açıklaması var", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain('"review": {"prompt": "en olası yanlış seçimi ölçen YENİ bir durum; doğru cevabı bu sorununkiyle aynı", "options"');
      expect(system).toContain('"answerIndex": 0, "explanation": "doğru cevabın nedeni + en olası yanlışın neden uymadığı"}');
      expect(system).toContain("doğru şık bu sorunun doğru şıkkıyla AYNI metindir");
      expect(system).not.toContain("şıklar aynı kalır");
    }
  });

  it("yoğunluk: her ekran bir soruyla biter, 5+ satırlı tablo bölünür, ilk kavram tek ekran, en çok 12 ekran", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain("Her ekran tek bir 'check' bloğuyla biter");
      expect(system).toContain("5 ya da daha çok satırlı");
      expect(system).toContain("İlk kavram tek ekrandır");
      expect(system).toContain("En fazla 12 ekran");
      expect(system).not.toContain("nasıl okunacağını");
    }
  });
});

describe("her ekran bir soruyla biter (C3b)", () => {
  const three = (middle: LessonBlock[]) => [
    screen("Devlet şekilleri", [tf(), text("Devlet şekilleri hukuk düzenine göre ayrılır.")], "Giriş kavramı"),
    screen("Bölgeli devlet", [text("Tek hukuk, bölgelere yetki."), { type: "table", table: { columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] } } as LessonBlock, mcq("Hangisi bölgeli devlettir?")], "Bölgeli devlet"),
    screen("Bölgeli devlet: örnekler", middle, "Bölgeli devlet"),
    screen("Bölgeli devlet: ayrım", [text("Federasyondan farkı."), { type: "table", table: { columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] } } as LessonBlock, mcq("Hangisi ayırır?")], "Bölgeli devlet"),
  ];

  it("ara ekran sorusuz kalırsa yüksek; ilk ekran (önce dene) muaf; iki soru düşük", () => {
    const screens = three([text("İspanya ve İtalya."), { type: "table", table: { columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] } } as LessonBlock]);
    const issues = conceptStructureIssues(screens, { concept: "Bölgeli devlet", screens: [1, 2, 3] });
    expect(issues.filter((issue) => /bir soruyla bitmeli: her ekran/.test(issue.problem))).toEqual([
      expect.objectContaining({ where: "screens[2]", severity: "high" }),
    ]);
    const withCheck = three([text("İspanya ve İtalya."), { type: "table", table: { columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] } } as LessonBlock, mcq("Hangisi örnektir?")]);
    expect(conceptStructureIssues(withCheck, { concept: "Bölgeli devlet", screens: [1, 2, 3] }).some((issue) => /her ekran/.test(issue.problem))).toBe(false);
    // İlk ekran soruyla başlıyor (önce dene), sonda soru yok: muaf.
    const opener = [screen("Giriş", [tf(), text("Metin.")]), screen("Giriş: ayrım", [text("Ayrım."), { type: "table", table: { columns: ["a", "b"], rows: [["1", "2"], ["3", "4"]] } } as LessonBlock, mcq("Hangisi?")], "Giriş")];
    opener[0]!.concept = "Giriş";
    expect(conceptStructureIssues(opener, { concept: "Giriş", screens: [0, 1] }).some((issue) => /her ekran/.test(issue.problem))).toBe(false);
    // Ekranda iki soru: düşük kalır (ekran yalnız ilkini gösterir).
    const two = screenStructureIssues(screen("Bölgeli devlet", [text("Metin."), mcq("Bir?"), mcq("İki?")]), 1, {});
    expect(two.find((issue) => /tek 'check'/.test(issue.problem))?.severity).toBe("low");
  });
});

describe("yoğun tablo bölünür (C3c, C3e)", () => {
  const rows = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => [`${(i + offset) * 3} ay`, `beceri ${i + offset}`]);
  const table = (count: number, offset = 0) => ({ type: "table", table: { caption: "Gelişim basamakları", columns: ["Yaş", "Beceri"], rows: rows(count, offset) } }) as LessonBlock;
  const base = [
    screen("Gelişim izlemi", [tf("Her çocuk aynı ayda yürür."), text("Basamaklar aralıkla verilir."), caseNote], "Gelişim izlemi"),
  ];

  const denseOf = (lessonScreens: LessonScreen[], from: number, to: number) =>
    partStructureIssues(lesson(lessonScreens), { from, to, header: from === 0, closing: false }, {}).filter((issue) => /satırlık tablosu tek ekranda/.test(issue.problem));

  it("7 satırlı tablo ilk kavramdan sonra tek ekrandaysa yüksek; ilk kavramda düşük", () => {
    const later = [...base, screen("Basamaklar", [text("Sıradaki basamak."), table(7), mcq("Hangisi 9 aydadır?")])];
    expect(denseOf(later, 1, 1)).toEqual([expect.objectContaining({ where: "screens[1]", severity: "high" })]);
    const first = [screen("Basamaklar", [tf("Her çocuk aynı ayda yürür."), text("Basamaklar."), table(7)]), screen("Sonra", [text("Metin."), mcq("Hangisi?")])];
    expect(denseOf(first, 0, 0)).toEqual([expect.objectContaining({ severity: "low" })]);
  });

  it("iki tablo ekranına bölünen (4 + 3) ya da zaten üç ekranlı kavram geçer", () => {
    const split = [
      ...base,
      screen("Basamaklar: ilk yıl", [text("İlk yıl."), table(4), mcq("Hangisi 9 aydadır?")], "Basamaklar"),
      screen("Basamaklar: sonra", [text("İkinci yıl."), table(3, 4), mcq("Hangisi 18 aydadır?")], "Basamaklar"),
    ];
    expect(denseOf(split, 1, 2)).toEqual([]);
    expect(lessonStructureIssues(lesson(split), {}).filter((issue) => issue.severity === "high")).toEqual([]);
    const capped = [
      ...base,
      screen("Basamaklar", [text("İlk."), table(7), mcq("Hangisi?")], "Basamaklar"),
      screen("Basamaklar: hesap", [text("İkinci."), { type: "formula", formula: { title: "Düzeltilmiş yaş", expression: "takvim yaşı − erken doğum" } } as LessonBlock, mcq("Kaç?")], "Basamaklar"),
      screen("Basamaklar: örnek", [text("Üçüncü."), { type: "example", example: { prompt: "Örnek", solution: "Çözüm" } } as LessonBlock, mcq("Hangisi geçerlidir?")], "Basamaklar"),
    ];
    expect(denseOf(capped, 1, 3)).toEqual([]);
  });

  it("paragrafa dökülen 5+ satırlı kaynak tablosu için tek tur iki kuralı birden söyler", () => {
    const page = {
      page: 4,
      text: [
        "| Bulgular | Düşündürür | Ayırıcı ipucu |",
        "|---|---|---|",
        "| Havlar tarzda öksürük + stridor | Krup | Üst hava yolu |",
        "| Hışıltı + ilk atak + küçük bebek | Bronşiolit | Viral prodrom |",
        "| Tekrarlayan hışıltı + tetikleyici | Astım | Reversibilite |",
        "| Ateş + takipne + fokal bulgu | Pnömoni | Takipne |",
        "| Ani öksürük + tek taraflı bulgu | Yabancı cisim | Ani başlangıç |",
      ].join("\n"),
    };
    const prose = text(
      "Havlar tarzda öksürük ve stridor krupu; ilk kez görülen hışıltı küçük bebekte bronşioliti düşündürür. Hışıltı tekrarlıyorsa astım, ateş ve takipne pnömoni ipucudur; ani öksürük yabancı cismi düşündürür.",
    );
    const flattened = partStructureIssues(lesson([...base, screen("Ayırıcı tanı", [prose, mcq("Hangisi?")])]), { from: 1, to: 1, header: false, closing: false }, { pages: [page] }).find((issue) =>
      /paragrafa dökülmüş/.test(issue.problem),
    );
    expect(flattened?.problem).toContain("2-3 ekranına böl");
    expect(flattened?.problem).toContain("ayırt ettiren kuralı tek cümlede söylesin");
  });
});

describe("üst sınırlar son kavramı düşürmez (C3d)", () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      i === 0
        ? screen("Giriş", [tf(), text("Giriş metni."), caseNote], "Giriş")
        : screen(`Kavram ${i}`, [text(`Kavram ${i} metni.`), mcq(`Kavram ${i} hangisidir?`)], `Kavram ${Math.ceil(i / 2)}`),
    );
  const caps = (count: number) =>
    partStructureIssues(lesson(many(count)), { from: count - 1, to: count - 1, header: false, closing: true }, {}).filter((issue) =>
      /En fazla (on iki|altı)/.test(issue.problem),
    );

  // 25 Ekim 2026: tam kapsam için 9 → 12 ekran, 5 → 6 kavram.
  it("10 ekranlı ders sınırda değil; 14 ekranlı ders düşük önem (tur açmaz)", () => {
    expect(caps(10)).toEqual([]);
    const over = caps(14);
    expect(over.some((issue) => /on iki ekran/.test(issue.problem))).toBe(true);
    // Sekiz kavram: kavram sınırı da aşıldı; ikisi de düşük, mesajdaki sayı kodla aynı ("altı").
    expect(over.some((issue) => /En fazla altı kavram/.test(issue.problem))).toBe(true);
    expect(over.every((issue) => issue.severity === "low")).toBe(true);
  });
});

describe("ikinci soru yapı denetiminde (C4d)", () => {
  const issuesOf = (block: LessonBlock) => screenStructureIssues(screen("Bölgeli devlet", [text("Metin."), block]), 1, {}).filter((issue) => /İkinci soru/.test(issue.problem));

  it("yalnız kök ikinci soru yüksek; doğru şıkkı farklıysa yüksek; tam öğe temiz", () => {
    expect(issuesOf(mcq("Hangisi bölgeli devlettir?", { prompt: "İspanya hangi devlet şeklidir, hukuk düzeni tekse?" }))).toEqual([
      expect.objectContaining({ where: "screens[1].blocks[1].review", severity: "high" }),
    ]);
    const mismatch = issuesOf(
      mcq("Hangisi bölgeli devlettir?", {
        prompt: "Tek hukuk ve milli birlik ilkesi hangi devlet şeklini tanımlar?",
        options: ["Federasyon", "Bölgeli devlet", "Üniter devlet", "Konfederasyon"],
        answerIndex: 2,
        explanation: "Tek hukuk ve milli birlik üniter devlettir.",
      }),
    );
    expect(mismatch.map((issue) => issue.severity)).toEqual(["high"]);
    expect(mismatch[0]!.problem).toContain("ana sorunun doğru şıkkıyla aynı");
    expect(issuesOf(mcq("Hangisi bölgeli devlettir?"))).toEqual([]);
  });

  it("doğru/yanlışın ikinci sorusu eksikse yalnız düşük (önce dene tur açmaz)", () => {
    const bare = { ...tf(), check: { ...(tf() as Extract<LessonBlock, { type: "check" }>).check, review: undefined } } as LessonBlock;
    const issues = screenStructureIssues(screen("Giriş", [bare, text("Metin.")]), 0, {}).filter((issue) => /İkinci soru/.test(issue.problem));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.severity === "low")).toBe(true);
  });
});

describe("denetçinin 'medium'u (C7c)", () => {
  it("ders denetiminde 'medium' korunur ve [öğretim] ile işaretlenir; öbür motorlarda eskisi gibi 'high'", () => {
    const raw = { issues: [{ where: "screens[1]", severity: "medium", problem: "Aynı bilgi iki ekranda anlatılıyor." }, { where: "screens[1]", severity: "low", problem: "uzun" }] };
    expect(parseIssues(raw, { medium: true })).toEqual([
      { where: "screens[1]", severity: "medium", problem: "[öğretim] Aynı bilgi iki ekranda anlatılıyor.", fix: undefined },
      { where: "screens[1]", severity: "low", problem: "uzun", fix: undefined },
    ]);
    expect(parseIssues(raw)[0]).toMatchObject({ severity: "high", problem: "Aynı bilgi iki ekranda anlatılıyor." });
  });
});

describe("22 Ekim 2026 inceleme: kurallar gereksiz tur açmasın", () => {
  const placeholderIssues = (value: LessonScreen) => screenStructureIssues(value, 1, {}).filter((issue) => /yer tutucu/.test(issue.problem));

  it("kavramı bilmeden çözülen soru C (high) değil, öğretim ölçütü (medium)", () => {
    for (const system of [verifySystem("document"), verifySystem("topic")]) {
      expect(system).not.toContain("Kavramı bilmeden çözülen soru da C'dir");
      expect(system).toContain("kavramı bilmeden çözülebilen soru (şıklardan yalnız biri sorulan kategoriden)");
    }
  });

  it("üslup üç noktası ve eşitsizlik yer tutucu değil; kısa '…' yer tutucu", () => {
    const lead = screen("Z-skoru", [text("Metin."), mcq("Hangisi?")]);
    lead.lead = "Z-skoru nedir, nasıl hesaplanır…";
    expect(placeholderIssues(lead)).toEqual([]);
    const formula = { type: "formula", formula: { title: "a<b ve b>c", expression: "a<b<c", explanation: "" } } as LessonBlock;
    expect(placeholderIssues(screen("Sıralama", [text("Metin."), formula, mcq("Hangisi?")]))).toEqual([]);
    const stub = { type: "note", note: { title: "Örnek vaka: …", body: "Metin.", tone: "info" } } as LessonBlock;
    expect(placeholderIssues(screen("Devlet", [text("Metin."), stub, mcq("Hangisi?")]))).toHaveLength(1);
    const code = { type: "note", note: { title: "Ezber kodu: <kod>", body: "Metin.", tone: "mnemonic" } } as LessonBlock;
    expect(placeholderIssues(screen("Devlet", [text("Metin."), code, mcq("Hangisi?")]))).toHaveLength(1);
  });

  it("yoğun tablo: en büyük tablo sayılır, toplam değil", () => {
    const table = (rows: number) =>
      ({ type: "table", table: { columns: ["a", "b"], rows: Array.from({ length: rows }, (_, i) => [`${i}`, `${i}`]) } }) as LessonBlock;
    const two = [screen("Hormonlar", [text("Metin."), table(3), table(2), mcq("Hangisi?")])];
    expect(denseTableIssues(two, { concept: "Hormonlar", screens: [0] }, "high")).toEqual([]);
    const one = [screen("Hormonlar", [text("Metin."), table(5), mcq("Hangisi?")])];
    expect(denseTableIssues(one, { concept: "Hormonlar", screens: [0] }, "high")).toHaveLength(1);
  });

  it("paragrafa dökülmüş tablo: ilk kavrama bölme cümlesi yazılmaz", () => {
    const source = { columns: ["Yaş", "Basamak"], rows: Array.from({ length: 6 }, (_, i) => [`${i} ay`, `b${i}`]) };
    expect(flattenedTableIssue(source, { split: false })).not.toContain("2-3 ekranına böl");
    expect(flattenedTableIssue(source, { split: true })).toContain("2-3 ekranına böl");
    expect(flattenedTableIssue(source)).toContain("2-3 ekranına böl");
  });
});
