import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { acceptCleanPage, isRunningHeader, repeatedEdgeLines } from "@/lib/documents/clean-text";
import { corePageRun } from "@/lib/learning/core-pages";
import {
  TEACHER_SYSTEM,
  TOPIC_TEACHER_SYSTEM,
  VERIFY_SYSTEM,
  calmHeading,
  fixSystem,
  teacherSystem,
  verifySystem,
  verifyUserPrompt,
  lessonStructureIssues,
  parseIssues,
  parseTeacherLesson,
  shuffleLessonChecks,
  teacherUserPrompt,
} from "@/lib/learning/teacher-lesson";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { screenCheck, screenText, v2ToV3, type LessonV3 } from "@/lib/learning/lesson-v3";

/** Fikstürler V2 yazılı (okunaklı); motor V3 okur — kayıtlı derslerle aynı çeviriden geçer. */
const structureOf = (lesson: LessonV2 | LessonV3, input: { runningHeaders?: string[] } = {}) =>
  lessonStructureIssues("format" in lesson ? lesson : v2ToV3(lesson), input);

/*
  Öğretmen ders motoru (2 Ekim 2026). Kurallar aynı KPSS PDF'iyle Astra'nın
  ve bizim dersimizin yan yana okunmasından çıktı
  (docs/delivery/ICERIK-KALITE-YOL-HARITASI.md).
*/

const KPSS_HEADER = "KPSS HUKUKUN TEMEL KAVRAMLARI";

describe("temiz metin kabulü", () => {
  const raw =
    "Bu kurallara uymayanlar ceza, cebri icra, iptal, hükümsüzlük ve tazminat gibi maddi yaptırımlarla ile muhatap olurlar. " +
    "Kesin Hükümsüzlük Her zaman irade sürdürülebilir. Zamanaşımı süresi yoktur. Medeni Kanun m.124 ve m.131, 17 yaş, 2004 değişikliği.";

  it("yazım düzeltmesi kabul, özet ve sayı kaybı red", () => {
    const fixed = raw.replace("irade sürdürülebilir", "ileri sürülebilir").replace("ile muhatap", "muhatap");
    expect(acceptCleanPage(raw, fixed)).toBe(true);
    expect(acceptCleanPage(raw, "Hukuk kurallarının maddi yaptırımı vardır.")).toBe(false);
    expect(acceptCleanPage(raw, fixed.replace("124", "").replace("131", "").replace("2004", "").replace("17", ""))).toBe(false);
    expect(acceptCleanPage(raw, "")).toBe(false);
  });

  it("üst/alt bilgideki sayfa numaraları atılınca temizlik reddedilmez", () => {
    const body = [
      "13. İş: Sınır İşi",
      "Gaz 200 kPa sabit basınçta 0.10 m³'ten 0.30 m³'e genleşiyor.",
      "W = 200×(0.30-0.10) = 40 kJ.",
      "Rijit tankta sınır işi sıfırdır.",
      "Aynı 1 ve 2 halleri arasında farklı yollar farklı iş verir.",
      "kPa·m³ = kJ özdeşliğini kullan.",
    ];
    const page = ["TERMODİNAMİK I | VİZE NOTLARI | Sayfa 14/30", ...body, "Termodinamik I | Standart vize kapsamı 14"].join("\n");
    expect(acceptCleanPage(page, body.join("\n"))).toBe(true);
    // Gövdedeki sayılar kaybolursa yine red.
    expect(acceptCleanPage(page, body.join("\n").replace(/200|0\.30|40/g, ""))).toBe(false);
  });

  it("sayfa kenarında tekrar eden başlık bulunur, konu adı olamaz", () => {
    const pages = Array.from({ length: 6 }, (_, i) => `${KPSS_HEADER}\nKonu metni ${i}\nbaşka satır\n${i + 5}`);
    const edges = repeatedEdgeLines(pages);
    expect(edges).toContain(KPSS_HEADER);
    expect(isRunningHeader("Kpss Hukukun Temel Kavramları", edges)).toBe(true);
    expect(isRunningHeader("Hukukun Müeyyidesi ve Uygulama Alanları", edges)).toBe(false);
  });
});

describe("dersin çekirdek sayfaları", () => {
  it("dağınık listeden en uzun ardışık diziyi alır", () => {
    expect(corePageRun([5, 6, 11, 13, 28])).toEqual([5, 6]);
    expect(corePageRun([5, 6, 7, 9, 28])).toEqual([5, 6, 7, 8, 9]);
    expect(corePageRun([12, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([3, 4, 5, 6, 7, 8]);
    expect(corePageRun([])).toEqual([]);
  });
});

const good: LessonV2 = {
  title: "Hukukun Müeyyidesi ve Uygulama Alanları",
  overview: "Bir kuralın hukuk kuralı sayılması için arkasında devlet gücü bulunması gerekir.",
  sections: [
    {
      heading: "Hukuki Yaptırımın Gücü ve Türleri",
      body: "Hukuku diğer sosyal kurallardan ayıran şey **maddi yaptırım**dır. Ahlak ve görgü kurallarına uymayan ayıplanır; hukuka uymayanı devlet zorlar.",
      checkFirst: true,
      cards: [
        { title: "Ceza", body: "Suç sayılan fiile uygulanan yaptırım." },
        { title: "Tazminat", body: "Hukuka aykırı davranışla verilen zararın giderilmesi." },
      ],
      note: {
        title: "Günlük hayattan: Ceza ve tazminat",
        body: "Kırmızı ışıkta geçip bir arabaya çarptığında devlete ödediğin para ceza, karşı tarafın hasarını ödemen tazminattır.",
        tone: "info",
      },
      check: {
        type: "trueFalse",
        prompt: "Hukuk kurallarını diğer kurallardan ayıran şey yalnızca hapis cezasıdır.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Ayıran şey yaptırımın maddi olmasıdır; tazminat ve hükümsüzlük de maddi yaptırımdır.",
        corrected: "Hukuk kurallarını ayıran şey maddi yaptırımdır; hapis cezası bunlardan yalnızca biridir.",
      },
    },
    {
      heading: "Hükümsüzlüğün Dereceleri",
      body: "Kurucu unsuru hiç olmayan işlem **yokluk** ile sakattır. Kurucu unsurları olup emredici kurala aykırı olan işlem **mutlak butlan** ile geçersizdir.",
      note: { title: "Yokluk ile butlan farkı", body: "Yoklukta işlem hiç doğmamıştır; butlanda doğmuş ama sakattır.", tone: "warn" },
      check: {
        type: "mcq",
        prompt: "Resmi nikâh memuru önünde yapılmayan evlilik hangi hükümsüzlük türüdür?",
        options: ["Yokluk", "Mutlak butlan", "Nispi butlan", "Tek taraflı bağlamazlık"],
        answerIndex: 0,
        explanation: "Nikâh memuru kurucu unsurdur; yoksa işlem hiç doğmaz. Mutlak butlanda unsur vardır ama kurala aykırıdır.",
        optionWhy: ["Kurucu unsur yok.", "Unsur var, emredici kurala aykırı.", "İrade sakatlığı.", "Onay eksikliği."],
        review: { prompt: "Kurucu unsurları tam ama amca ile yeğen arasında yapılan evlilik hangi türdür?" },
      },
    },
  ],
  summary: ["Hukuku ayıran maddi yaptırımdır.", "Kurucu unsur yoksa yokluk.", "Emredici kurala aykırılık mutlak butlan."],
  nextFocus: [],
};

describe("yapı denetimi", () => {
  it("Astra tarzı ders geçer", () => {
    expect(structureOf(good, { runningHeaders: [KPSS_HEADER] })).toEqual([]);
  });

  it("eski KPSS dersinin kusurları yakalanır", () => {
    const bad: LessonV2 = {
      ...good,
      title: KPSS_HEADER,
      sections: [
        { ...good.sections[0], heading: KPSS_HEADER, checkFirst: false, body: `${good.sections[0].body} Kaynak: KPSS.pdf, s.6.` },
        {
          ...good.sections[1],
          check: { ...good.sections[1].check!, prompt: "Hükümsüzlük kaç ana başlıkta incelenir?", optionWhy: undefined, review: undefined },
        },
      ],
      summary: ["Hukukun amacı düzendir."],
    };
    const problems = structureOf(bad, { runningHeaders: [KPSS_HEADER] }).map((issue) => `${issue.where}: ${issue.problem}`);
    expect(problems.some((p) => p.startsWith("title:") && /BÜYÜK HARF/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("title:") && /sayfa kenarında/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("screens[0].blocks[0]:") && /önce dene/.test(p))).toBe(true);
    expect(problems.some((p) => /Kaynak|sayfa notu/.test(p))).toBe(true);
    expect(problems.some((p) => /Sayma sorusu/.test(p))).toBe(true);
    expect(problems.some((p) => /optionWhy/.test(p))).toBe(true);
    expect(problems.some((p) => /review/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("summary:"))).toBe(true);
  });

  it("şemayı oturtur, metne dokunmaz, yalnız liste dışı sıradaki konuyu düşürür", () => {
    const parsed = parseTeacherLesson({ ...good, nextFocus: ["Örf ve Âdet", "KPSS"] }, ["Örf ve âdet"]);
    expect(parsed?.nextFocus).toEqual(["Örf ve Âdet"]);
    expect(screenText(parsed!.screens[0]!)).toBe(good.sections[0].body);
    expect(parseTeacherLesson({ title: "x" }, [])).toBeNull();
  });

  it("kaynaktan aynen alınmış BÜYÜK HARF başlık normal yazıma döner, kısaltma kalır", () => {
    expect(calmHeading("KESİN HÜKÜMSÜZLÜK VE İPTAL EDİLEBİLİRLİK")).toBe("Kesin Hükümsüzlük ve İptal Edilebilirlik");
    expect(calmHeading("KPSS HUKUKUN TEMEL KAVRAMLARI")).toBe("KPSS Hukukun Temel Kavramları");
    expect(calmHeading("Hükümsüzlüğün Dereceleri")).toBe("Hükümsüzlüğün Dereceleri");
    const parsed = parseTeacherLesson(
      { ...good, sections: [{ ...good.sections[0], heading: "MADDİ YAPTIRIMLAR" }, good.sections[1]] },
      [],
    );
    expect(parsed?.screens[0]?.heading).toBe("Maddi Yaptırımlar");
    expect(structureOf(parsed!).some((issue) => /BÜYÜK HARF/.test(issue.problem))).toBe(false);
  });

  // Faz 5 (9 Ekim 2026): KPSS dersinde "Devlet herkesten eşit oranda vergi
  // alıyor → denkleştirici adalet" sorusu iki adalet türüne de okunabiliyordu.
  it("durum sorusu tek kavrama okunmalı: yazar ve denetçi aynı kuralı biliyor", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain("Durum sorusundaki olay tek kavrama okunmalı");
    }
    for (const system of [verifySystem("document"), verifySystem("topic")]) {
      expect(system).toContain("durum sorusundaki olayın iki kavrama da okunabilmesi");
    }
  });

  // Faz 5 (9 Ekim 2026): Astra yanlış ifadenin doğrusunu ayrı satırda veriyor.
  it("yanlış doğru/yanlış ifadesinin doğrusu istenir; eksikliği dersi düşürmez", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain("'corrected' alanına ifadenin doğru hâlini");
    }
    for (const system of [verifySystem("document"), verifySystem("topic")]) {
      expect(system).toContain("corrected'da (yanlış ifadenin doğrusu)");
    }
    const first = good.sections[0]!;
    const missing: LessonV2 = {
      ...good,
      sections: [{ ...first, check: { ...first.check!, corrected: undefined } }, ...good.sections.slice(1)],
    };
    const issues = structureOf(missing).filter((issue) => /doğrusu/.test(issue.problem));
    expect(issues).toEqual([expect.objectContaining({ where: "screens[0].blocks[0]", severity: "low" })]);
    // Doğru ifadenin "doğrusu" olmaz.
    const trueStatement: LessonV2 = {
      ...good,
      sections: [{ ...first, check: { ...first.check!, answerIndex: 0, corrected: undefined } }, ...good.sections.slice(1)],
    };
    expect(structureOf(trueStatement).some((issue) => /doğrusu/.test(issue.problem))).toBe(false);
  });

  // 16 Ekim 2026 canlı ders: gövde "doğru mu, yanlış mı?" diye sordu, kontrol çoktan seçmeliydi.
  it("'önce dene' doğru/yanlış olur ve gövdede tekrar sorulmaz; ikisi de dersi düşürmez", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain("Bu soru doğru/yanlıştır");
      expect(system).toContain("Soruyu metin bloğunda tekrar sorma");
    }
    const first = good.sections[0]!;
    const opener: LessonV2 = {
      ...good,
      sections: [
        {
          ...first,
          body: `Önce düşün: kişilik ana rahminde mi başlar? Doğru mu, yanlış mı? ${first.body}`,
          check: {
            type: "mcq",
            prompt: "Hukuku diğer kurallardan ayıran nedir?",
            options: ["Maddi yaptırım", "Ayıplanma", "Vicdan azabı", "Dışlanma"],
            answerIndex: 0,
            explanation: "Hukuku ayıran maddi yaptırımdır; diğerleri ahlak ve görgü kurallarının yaptırımıdır.",
            optionWhy: ["Devlet zorlar.", "Görgü kuralı.", "Ahlak kuralı.", "Görgü kuralı."],
            review: { prompt: "Borcunu ödemeyenin malı haczediliyor; bu hangi kuralın yaptırımıdır?" },
          },
        },
        ...good.sections.slice(1),
      ],
    };
    const found = structureOf(opener).filter((issue) => issue.where.startsWith("screens[0]"));
    expect(found.map((issue) => issue.where).sort()).toEqual(["screens[0]", "screens[0].blocks[0]"]);
    expect(found.every((issue) => issue.severity === "low")).toBe(true);
    expect(structureOf(good).some((issue) => issue.where.startsWith("screens[0]"))).toBe(false);
  });

  // 16 Ekim 2026 Pediatri dersi: şema örneğindeki ilk bölüm çoktan seçmeliydi ve model onu
  // kopyaladı; yaş basamakları gövdede sıralandı; gündelik örnek yalnız "eğriye işler" dedi.
  it("şema örneği 'önce dene'yi doğru/yanlış gösterir; yaş listesi tablo, örnek iki kavramı ayırır", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      const firstScreen = system.slice(system.indexOf('"blocks": ['), system.indexOf('"heading": "aynı kavram: hesap"'));
      expect(firstScreen.indexOf('"type": "check"')).toBeLessThan(firstScreen.indexOf('"type": "text"'));
      expect(firstScreen).toContain('"type": "trueFalse"');
      expect(firstScreen).toContain('"corrected"');
      expect(firstScreen).not.toContain('"type": "mcq"');
      expect(system).toContain("'table' kur (satır yaş/evre, sütun alan)");
      expect(system).toContain("aynı olayda FARKLI sonuç versin");
    }
  });

  // 16 Ekim 2026 Gastroenterit dersi: kanca "asıl risk dehidratasyon" dedi, bir adım sonra
  // "önce dene" "temel risk etkenin kendisidir" diye sordu.
  it("kanca 'önce dene'nin cevabını verirse düşük önemle işaretlenir; tablolu gövde tabloyu saymaz", () => {
    for (const system of [TEACHER_SYSTEM, TOPIC_TEACHER_SYSTEM]) {
      expect(system).toContain("o sorunun cevabını vermez");
      expect(system).toContain("metin tablonun satırlarını yeniden saymaz");
    }
    const first = good.sections[0]!;
    const opener = {
      ...first,
      check: {
        type: "trueFalse" as const,
        prompt: "Akut ishalde çoğu zaman temel risk, enfeksiyöz etkenin kendisidir.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 1,
        explanation: "Asıl risk sıvı ve elektrolit kaybıdır.",
        corrected: "Akut ishalde çoğu zaman temel risk dehidratasyon ve elektrolit bozukluğudur.",
      },
    };
    const leaking: LessonV2 = {
      ...good,
      overview: "Akut ishale çoğunlukla enfeksiyöz etkenler yol açar; asıl risk dehidratasyon ve elektrolit bozukluğu olabilir.",
      sections: [opener, ...good.sections.slice(1)],
    };
    const found = structureOf(leaking).filter((issue) => issue.where === "overview");
    expect(found).toEqual([expect.objectContaining({ severity: "low" })]);
    const quiet: LessonV2 = { ...leaking, overview: "İshalli bir çocukta seni en çok ne korkutmalı: mikrop mu, başka bir şey mi?" };
    expect(structureOf(quiet).some((issue) => issue.where === "overview")).toBe(false);
  });

  it("ders yazılırken bağlantı koparsa sayfa önce hazır dersi arar", () => {
    const session = readFileSync("src/components/parity/exam-node-session.tsx", "utf8");
    expect(session).toContain("if (resumeEnabled && (await resumeAfterLostStart())) return;");
  });

  it("belgesiz ders: aynı akış, kaynak kuralı yerine doğruluk kuralı", () => {
    expect(TOPIC_TEACHER_SYSTEM).toContain("BİLGİ KURALI (belgesiz ders, kesin)");
    expect(TOPIC_TEACHER_SYSTEM).not.toContain("KAYNAK KURALI (kesin)");
    expect(TOPIC_TEACHER_SYSTEM).not.toContain("'example' bloğu yalnız kaynakta");
    expect(TOPIC_TEACHER_SYSTEM).toContain("kendin kurduğun basit, adım adım doğrulanabilir");
    // Akış ve anlatım belgeli dersle aynı kaynaktan.
    for (const rule of ["GÜNDELİK ÖRNEK (zorunlu)", "İlk ekranın İLK bloğu bir 'check' bloğudur", "kardeş terimler", "optionWhy", "'Kaynak:'"]) {
      expect(TOPIC_TEACHER_SYSTEM).toContain(rule);
    }
    expect(teacherSystem("topic")).toBe(TOPIC_TEACHER_SYSTEM);
    expect(teacherSystem()).toBe(TEACHER_SYSTEM);
    expect(verifySystem("topic")).toContain("Belgesi olmayan");
    expect(fixSystem("topic")).toContain("BİLGİ KURALI");
    const prompt = teacherUserPrompt({ topicLabel: "Üslü sayılar", prepTitle: "TYT Matematik", pages: [], upcomingTopics: [], mode: "topic" });
    expect(prompt).toContain("KAYNAK: (yok — belgesiz ders");
    expect(verifyUserPrompt(v2ToV3(good), { pages: [], mode: "topic", topicLabel: "Üslü sayılar", prepTitle: "TYT Matematik" })).toContain("KONU: Üslü sayılar");
  });

  it("çoktan seçmeli kontroller gerekçeleriyle karışır; doğru cevap yer değiştirse de doğru kalır", () => {
    const options = ["Yokluk", "Mutlak butlan", "Nispi butlan", "Tek taraflı bağlamazlık"];
    const why = options.map((option) => `${option} gerekçesi burada.`);
    const lessons = Array.from({ length: 10 }, (_, i): LessonV2 => ({
      ...good,
      sections: [
        good.sections[0],
        { ...good.sections[1], check: { type: "mcq", prompt: `Soru ${i}: kurucu unsur eksikse?`, options, answerIndex: 0, optionWhy: why, explanation: "Yokluk." } },
      ],
    }));
    const positions = new Set<number>();
    for (const lesson of lessons) {
      const check = screenCheck(shuffleLessonChecks(v2ToV3(lesson)).screens[1]!)!;
      expect(check.options![check.answerIndex!]).toBe("Yokluk");
      check.options!.forEach((option, index) => expect(check.optionWhy![index]).toBe(`${option} gerekçesi burada.`));
      expect(screenCheck(shuffleLessonChecks(v2ToV3(lesson)).screens[1]!)!.options).toEqual(check.options);
      positions.add(check.answerIndex!);
    }
    expect(positions.size).toBeGreaterThanOrEqual(3);
    // Doğru/yanlış kontrolüne dokunulmaz.
    expect(screenCheck(shuffleLessonChecks(v2ToV3(good)).screens[0]!)).toEqual(good.sections[0].check);
  });

  it("gündelik örnek kutusu olmayan ders düzeltmeye gider", () => {
    const noExample: LessonV2 = {
      ...good,
      sections: [{ ...good.sections[0], note: undefined }, good.sections[1]],
    };
    expect(structureOf(noExample).some((issue) => /Gündelik örnek kutusu yok/.test(issue.problem))).toBe(true);
    expect(TEACHER_SYSTEM).toContain("GÜNDELİK ÖRNEK (zorunlu)");
  });

  it("kaynağın hatasından söz eden iç not yakalanır", () => {
    const noted: LessonV2 = {
      ...good,
      sections: [
        { ...good.sections[0], body: `${good.sections[0].body} Kaynaktaki tanımda geçen “yapılması” ifadesi anlatım hatasıdır.` },
        good.sections[1],
      ],
    };
    expect(structureOf(noted).some((issue) => /iç not/.test(issue.problem))).toBe(true);
    expect(structureOf(good).some((issue) => /iç not/.test(issue.problem))).toBe(false);
  });

  it("denetçi sorunları okunur; ciddiyet belirtilmezse yüksek sayılır", () => {
    const issues = parseIssues({ issues: [{ where: "sections[1].check", problem: "İki doğru şık var" }, { problem: "uzun", severity: "low" }, { x: 1 }] });
    expect(issues).toEqual([
      { where: "sections[1].check", severity: "high", problem: "İki doğru şık var", fix: undefined },
      { where: "ders", severity: "low", problem: "uzun", fix: undefined },
    ]);
  });
});

describe("öğretmen istemi", () => {
  it("kaynak kuralı, önce dene, kardeş çeldirici, farklı yönden tekrar ve yasaklar istemde", () => {
    expect(TEACHER_SYSTEM).toContain("KAYNAK KURALI");
    expect(TEACHER_SYSTEM).toContain("yeni bir bilgi");
    expect(TEACHER_SYSTEM).toContain("İlk ekranın İLK bloğu bir 'check' bloğudur (önce dene)");
    expect(TEACHER_SYSTEM).toContain("kardeş terimler");
    expect(TEACHER_SYSTEM).toContain("optionWhy");
    expect(TEACHER_SYSTEM).toContain("bir durumdan (olaydan) terim");
    expect(TEACHER_SYSTEM).toContain("'Kaynak:'");
    expect(VERIFY_SYSTEM).toContain("Kaynakta dayanağı olmayan");
  });

  it("kullanıcı istemi kaynağı sayfa işaretleriyle ve kenar başlıklarını uyarıyla verir", () => {
    const prompt = teacherUserPrompt({
      topicLabel: "Hukukun yaptırımları",
      prepTitle: "KPSS",
      pages: [{ page: 5, text: "Hukuk kuralları maddi yaptırımlıdır." }],
      upcomingTopics: ["Örf ve âdet"],
      runningHeaders: [KPSS_HEADER],
    });
    expect(prompt).toContain("[s.5]");
    expect(prompt).toContain("SIRADAKİ KONULAR: Örf ve âdet");
    expect(prompt).toContain(`konu ya da bölüm adı değildir: ${KPSS_HEADER}`);
  });

  it("rota dersi yalnız öğretmen motoruna yollar; sayfa yoksa ders yazılmaz", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("return teacherLessonPayload(input, activity, core);");
    // Belgesiz hazırlık dersi de öğretmen motorundan (2 Ekim 2026): pagesReady topic_only'yi sayar.
    expect(route).toContain("const pagesReady = Boolean(core || input.lessonTopicOnly);");
    expect(route).toContain('mode: core ? "document" : "topic"');
    // Eski zincir ve motor anahtarları 3 Ekim 2026'da silindi.
    expect(readFileSync("src/lib/env.ts", "utf8")).not.toMatch(/(LESSON|QUIZ|PODCAST|CARDS|PRACTICE)_ENGINE: z/);
    expect(route).toContain('const noPages = () => new NodeGenerationError(503, "source_unavailable", ["lesson_core_missing"]);');
  });

  it("yeni hazırlık eski belgenin sayfa başlığını ve test sorusu kökünü konu yapmaz", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(route).toContain("documentRunningHeaders(service, id)");
    // Öğrencinin elle yazdığı konu (nodeId yok) "bozuk başlık" diye silinmez.
    expect(route).toContain("!isRunningHeader(title, edges) && !(topicNodeIds[index] && isJunkTopicTitle(title))");
  });
});
