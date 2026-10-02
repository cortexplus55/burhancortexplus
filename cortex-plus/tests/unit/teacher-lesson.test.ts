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
  teacherUserPrompt,
} from "@/lib/learning/teacher-lesson";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

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
    expect(lessonStructureIssues(good, { runningHeaders: [KPSS_HEADER] })).toEqual([]);
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
    const problems = lessonStructureIssues(bad, { runningHeaders: [KPSS_HEADER] }).map((issue) => `${issue.where}: ${issue.problem}`);
    expect(problems.some((p) => p.startsWith("title:") && /BÜYÜK HARF/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("title:") && /sayfa kenarında/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("sections[0]:") && /önce dene/.test(p))).toBe(true);
    expect(problems.some((p) => /Kaynak|sayfa notu/.test(p))).toBe(true);
    expect(problems.some((p) => /Sayma sorusu/.test(p))).toBe(true);
    expect(problems.some((p) => /optionWhy/.test(p))).toBe(true);
    expect(problems.some((p) => /review/.test(p))).toBe(true);
    expect(problems.some((p) => p.startsWith("summary:"))).toBe(true);
  });

  it("şemayı oturtur, metne dokunmaz, yalnız liste dışı sıradaki konuyu düşürür", () => {
    const parsed = parseTeacherLesson({ ...good, nextFocus: ["Örf ve Âdet", "KPSS"] }, ["Örf ve âdet"]);
    expect(parsed?.nextFocus).toEqual(["Örf ve Âdet"]);
    expect(parsed?.sections[0].body).toBe(good.sections[0].body);
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
    expect(parsed?.sections[0].heading).toBe("Maddi Yaptırımlar");
    expect(lessonStructureIssues(parsed!, {}).some((issue) => /BÜYÜK HARF/.test(issue.problem))).toBe(false);
  });

  it("belgesiz ders: aynı akış, kaynak kuralı yerine doğruluk kuralı", () => {
    expect(TOPIC_TEACHER_SYSTEM).toContain("BİLGİ KURALI (belgesiz ders, kesin)");
    expect(TOPIC_TEACHER_SYSTEM).not.toContain("KAYNAK KURALI (kesin)");
    expect(TOPIC_TEACHER_SYSTEM).not.toContain("example yalnız kaynakta");
    expect(TOPIC_TEACHER_SYSTEM).toContain("kendin kurduğun basit, adım adım doğrulanabilir");
    // Akış ve anlatım belgeli dersle aynı kaynaktan.
    for (const rule of ["GÜNDELİK ÖRNEK (zorunlu)", "checkFirst=true", "kardeş terimler", "optionWhy", "'Kaynak:'"]) {
      expect(TOPIC_TEACHER_SYSTEM).toContain(rule);
    }
    expect(teacherSystem("topic")).toBe(TOPIC_TEACHER_SYSTEM);
    expect(teacherSystem()).toBe(TEACHER_SYSTEM);
    expect(verifySystem("topic")).toContain("Belgesi olmayan");
    expect(fixSystem("topic")).toContain("BİLGİ KURALI");
    const prompt = teacherUserPrompt({ topicLabel: "Üslü sayılar", prepTitle: "TYT Matematik", pages: [], upcomingTopics: [], mode: "topic" });
    expect(prompt).toContain("KAYNAK: (yok — belgesiz ders");
    expect(verifyUserPrompt(good, { pages: [], mode: "topic", topicLabel: "Üslü sayılar", prepTitle: "TYT Matematik" })).toContain("KONU: Üslü sayılar");
  });

  it("gündelik örnek kutusu olmayan ders düzeltmeye gider", () => {
    const noExample: LessonV2 = {
      ...good,
      sections: [{ ...good.sections[0], note: undefined }, good.sections[1]],
    };
    expect(lessonStructureIssues(noExample, {}).some((issue) => /Gündelik örnek kutusu yok/.test(issue.problem))).toBe(true);
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
    expect(lessonStructureIssues(noted, {}).some((issue) => /iç not/.test(issue.problem))).toBe(true);
    expect(lessonStructureIssues(good, {}).some((issue) => /iç not/.test(issue.problem))).toBe(false);
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
    expect(TEACHER_SYSTEM).toContain("checkFirst=true");
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

  it("rota belgeli dersi öğretmen motoruna yollar; eski motor anahtarla geri açılır", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain('input.kind === "lesson" && input.teachingV2 && env.LESSON_ENGINE === "teacher"');
    expect(route).toContain("if (input.lessonCore) return teacherLessonPayload(input, activity, input.lessonCore);");
    // Belgesiz hazırlık dersi de öğretmen motorundan (2 Ekim 2026).
    expect(route).toContain("if (input.lessonTopicOnly) return teacherLessonPayload(input, activity, null);");
    expect(route).toContain('mode: core ? "document" : "topic"');
    expect(readFileSync("src/lib/env.ts", "utf8")).toContain('LESSON_ENGINE: z.enum(["teacher", "legacy"]).default("teacher")');
  });

  it("yeni hazırlık eski belgenin sayfa başlığını ve test sorusu kökünü konu yapmaz", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(route).toContain("documentRunningHeaders(service, id)");
    // Öğrencinin elle yazdığı konu (nodeId yok) "bozuk başlık" diye silinmez.
    expect(route).toContain("!isRunningHeader(title, edges) && !(topicNodeIds[index] && isJunkTopicTitle(title))");
  });
});
