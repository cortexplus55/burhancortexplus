import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { abbreviationTerms, lessonKeyFacts, uncoveredKeyFacts } from "@/lib/learning/lesson-key-facts";
import { coverageCompletionUserPrompt, lessonCoverageGaps } from "@/lib/learning/teacher-lesson";
import type { LessonScreen, LessonV3 } from "@/lib/learning/lesson-v3";

/*
  Kapsam tamamlaması (30 Ekim 2026). Kör öğrenci deneyinde "Farklı anlat" ile yeniden yazılan ders kaynağın
  TÜİK / TÜFE / Yİ-ÜFE satırını hiç işlemedi; aynı derse çalışan öğrenci sınavın endeks sorusunu boş bıraktı. İki
  açık vardı: (1) açılımıyla verilen kısaltma ve "Kavram | Anlamı" sözlük tablosu kilit bilgi sayılmıyordu, yazara
  gitmiyor, onları atlayan ders kapsam ölçüsünden geçiyordu; (2) tek geçişte kapsam açığı yalnız günlüğe yazılıyordu.
  Örnekler bilerek başka derslerden: ölçü biçimdendir, ders adı ya da terim listesi yok.
*/

const LAW_SOURCE = [
  "Türkiye'de yasama yetkisini Türkiye Büyük Millet Meclisi (TBMM) kullanır. Kanunların Anayasaya uygunluğunu",
  "AYM (Anayasa Mahkemesi) denetler.",
  "",
  "| Kavram | Anlamı |",
  "|---|---|",
  "| Yasama | Kanun yapma, değiştirme ve kaldırma yetkisi |",
  "| Yürütme | Kanunları uygulama yetkisi |",
  "| Yargı | Uyuşmazlıkları bağımsız mahkemelerin çözmesi |",
].join("\n");

describe("kilit bilgi: açılımıyla verilen kısaltma ve sözlük tablosu", () => {
  it("kısaltma iki yönde de yakalanır; Roma rakamı, tek sözcüklü ek ve yıl kısaltma sayılmaz", () => {
    expect(abbreviationTerms(LAW_SOURCE).map((term) => term.abbr)).toEqual(["AYM", "TBMM"]);
    expect(
      abbreviationTerms(
        "Kalıtım bilgisini DNA (Deoksiribo Nükleik Asit) taşır. Kalbin elektriksel etkinliği EKG (Elektro Kardiyo Grafi) ile kaydedilir.",
      ).map((term) => term.abbr),
    ).toEqual(["DNA", "EKG"]);
    expect(
      abbreviationTerms(
        "Hanehalkının satın aldıklarını TÜFE (Tüketici Fiyat Endeksi), üreticilerin sattıklarını Yİ-ÜFE (Yurt İçi Üretici Fiyat Endeksi) ölçer.",
      ).map((term) => term.abbr),
    ).toEqual(["TÜFE", "Yİ-ÜFE"]);
    expect(abbreviationTerms("Bölüm (II) ve hazırlık (KPSS) sayfası; KPSS (2026) takvimi.")).toEqual([]);
  });

  it("sözlük tablosunun satırları terim olur; kısa hücreli çapraz tablo eski kuralla kalır", () => {
    const facts = lessonKeyFacts([{ text: LAW_SOURCE }]);
    const terms = facts.filter((fact) => fact.kind === "term").map((fact) => fact.text.split(/[:(]/)[0]!.trim());
    expect(terms).toEqual(expect.arrayContaining(["Yasama", "Yürütme", "Yargı", "AYM", "TBMM"]));
    expect(terms).not.toContain("Kavram");
    const cross = lessonKeyFacts([{ text: "| Araç | Sıkı | Gevşek |\n|---|---|---|\n| Faiz | Artar | Düşer |\n| Kredi | Azalır | Artar |" }]);
    expect(cross.some((fact) => fact.kind === "term")).toBe(false);
    expect(cross.some((fact) => fact.kind === "table_row")).toBe(true);
  });

  it("terimi anmayan ders kapsamdan geçmez; anan ders geçer", () => {
    const facts = lessonKeyFacts([{ text: LAW_SOURCE }]);
    const partial = [{ blocks: [{ type: "text", text: "Yasama yetkisini TBMM kullanır. Yürütme kanunları uygular." }] }];
    const missing = uncoveredKeyFacts(partial, facts).map((fact) => fact.text);
    expect(missing.some((text) => text.startsWith("AYM"))).toBe(true);
    expect(missing.some((text) => text.startsWith("Yargı"))).toBe(true);
    const full = [
      {
        blocks: [
          { type: "text", text: "Yasama yetkisini TBMM kullanır, yürütme kanunları uygular, yargıda uyuşmazlığı bağımsız mahkemeler çözer." },
          { type: "text", text: "Kanunların Anayasaya uygunluğunu AYM denetler." },
        ],
      },
    ];
    expect(uncoveredKeyFacts(full, facts)).toEqual([]);
  });
});

/* ───────────── Ders hattı: açık kalırsa tek küçük çağrı ───────────── */

const text = (value: string): LessonScreen["blocks"][number] => ({ type: "text", text: value });
const check = (prompt: string, options: string[], answerIndex: number, explanation: string): LessonScreen["blocks"][number] => ({
  type: "check",
  check: { type: "mcq", prompt, options, answerIndex, explanation },
});

const lawLesson: LessonV3 = {
  format: 3,
  title: "Kuvvetler ayrılığı",
  objective: "Yasama ve yürütmeyi ayırt etmek.",
  screens: [
    {
      heading: "Yasama",
      concept: "Yasama",
      blocks: [
        text("**Yasama**, kanun yapma, değiştirme ve kaldırma yetkisidir. Türkiye'de bu yetkiyi **TBMM** kullanır."),
        { type: "table", table: { columns: ["Yetki", "Organ"], rows: [["Yasama", "TBMM"], ["Yürütme", "Hükümet"]] } },
        { type: "example", example: { prompt: "Yeni bir kanunu kim kabul eder?", solution: "Yasama yetkisi TBMM'dedir.", result: "TBMM" } },
        check("Yasama yetkisini kim kullanır?", ["TBMM", "Bakanlar", "Valiler", "Belediyeler", "Mahkemeler"], 0, "Yasama yetkisini TBMM kullanır."),
      ],
    },
    {
      heading: "Yürütme",
      concept: "Yürütme",
      blocks: [
        text("**Yürütme**, kanunları uygulama yetkisidir."),
        {
          type: "diagram_card",
          diagramKind: "process_network",
          title: "Yetkinin yolu",
          items: [{ label: "Yasama" }, { label: "Yürütme" }],
        },
        { type: "example", example: { prompt: "Kabul edilen kanunu kim uygular?", solution: "Uygulama yürütmenin işidir.", result: "Yürütme" } },
        check("Kanunları uygulama yetkisi hangisidir?", ["Yasama", "Yürütme", "Denetim", "Seçim", "Temsil"], 1, "Kanunları uygulamak yürütmedir."),
      ],
    },
  ],
  summary: ["Yasama kanun yapar.", "Yürütme kanunu uygular."],
  nextFocus: [],
} as LessonV3;

const completion = JSON.stringify({
  title: "Kuvvetler ayrılığı",
  screens: [
    {
      heading: "Yargı ve AYM",
      concept: "Yargı",
      blocks: [
        {
          type: "text",
          text: "**Yargı**, uyuşmazlıkları bağımsız mahkemelerin çözmesidir. Kanunların Anayasaya uygunluğunu **AYM** (Anayasa Mahkemesi) denetler.",
        },
        {
          type: "check",
          check: {
            type: "mcq",
            prompt: "Kanunların Anayasaya uygunluğunu hangi kurum denetler?",
            options: ["TBMM", "AYM", "Valilik", "Belediye", "Bakanlık"],
            answerIndex: 1,
            explanation: "Kanunların Anayasaya uygunluğunu AYM denetler.",
          },
        },
      ],
    },
  ],
});

const input = { topicLabel: "Kuvvetler ayrılığı", prepTitle: "KPSS Vatandaşlık", pages: [{ page: 2, text: LAW_SOURCE }], upcomingTopics: [], sanity: false };

async function run(drafts: string[]) {
  const { teacherLessonPipeline } = await import("@/lib/learning/teacher-lesson-run");
  const writes: { system: string; user: string }[] = [];
  const queue = [...drafts];
  const result = await teacherLessonPipeline(
    {
      write: async (system, user, onDelta) => {
        writes.push({ system, user });
        const body = queue.shift() ?? "";
        onDelta(body);
        return { text: body, finish: "stop" };
      },
    },
    input,
  );
  return { result, writes };
}

describe("ders hattı: kapsam açığı kalırsa yalnız eksikleri öğreten ekran istenir", () => {
  it("eksik kısaltma ve sözlük terimi istemde; dönen ekran sona eklenir, kapsam kapanır", async () => {
    expect(lessonCoverageGaps(lawLesson, input).facts.some((fact) => fact.startsWith("AYM"))).toBe(true);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { result, writes } = await run([JSON.stringify(lawLesson), completion]);
    expect(writes).toHaveLength(2);
    expect(writes[1]!.user).toContain("KAPSAM TAMAMLAMASI");
    expect(writes[1]!.user).toContain("Kilit bilgi: AYM (Anayasa Mahkemesi)");
    expect(writes[1]!.user).toContain("Kilit bilgi: Yargı:");
    expect(writes[1]!.user).toContain("[2] Yürütme (Yürütme)");
    const headings = result.lesson!.screens.map((screen) => screen.heading);
    expect(headings).toEqual(["Yasama", "Yürütme", "Yargı ve AYM"]);
    expect(result.done).toBe(true);
    expect(info).toHaveBeenCalledWith("teacher_lesson_coverage", expect.objectContaining({ verdict: "added", added: 1, after: 0 }));
    info.mockRestore();
  });

  it("açığı kapatmayan ya da bozuk tamamlama dersi değiştirmez", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const offTopic = JSON.stringify({
      title: "Kuvvetler ayrılığı",
      screens: [{ heading: "Tekrar", concept: "Tekrar", blocks: [text("Yasama kanun yapar."), check("Yasama nedir?", ["Kanun yapma", "Uygulama", "Temsil", "Denetim", "Seçim"], 0, "Yasama kanun yapmaktır.")] }],
    });
    const same = await run([JSON.stringify(lawLesson), offTopic]);
    expect(same.result.lesson!.screens.map((screen) => screen.heading)).toEqual(["Yasama", "Yürütme"]);
    expect(info).toHaveBeenCalledWith("teacher_lesson_coverage", expect.objectContaining({ verdict: "no_gain", added: 0 }));
    const broken = await run([JSON.stringify(lawLesson), "{ bozuk"]);
    expect(broken.result.lesson!.screens).toHaveLength(2);
    expect(info).toHaveBeenCalledWith("teacher_lesson_coverage", expect.objectContaining({ verdict: "unparsed" }));
    info.mockRestore();
  });

  it("kapsamı tam ders ve belgesiz ders tamamlama çağrısı yapmaz", async () => {
    const full: LessonV3 = { ...lawLesson, screens: [...lawLesson.screens, JSON.parse(completion).screens[0]] };
    // Ek ekranın dört parçası eksik: dört parça tamamlaması koşabilir, kapsam tamamlaması koşmaz.
    const { writes } = await run([JSON.stringify(full)]);
    expect(writes.some((write) => write.user.includes("KAPSAM TAMAMLAMASI"))).toBe(false);
    expect(lessonCoverageGaps(lawLesson, { ...input, mode: "topic" })).toEqual({ headings: [], facts: [] });
    expect(coverageCompletionUserPrompt(lawLesson, input, { headings: ["Yargı"], facts: [] })).toContain("- Alt başlık: Yargı");
  });
});
