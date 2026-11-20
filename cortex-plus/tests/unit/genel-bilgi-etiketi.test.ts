/**
 * EK-1 Bulgu 1 (15 Kasım 2026, Burhan kararı 3): "Belgem + genel bilgi" modunda denetçinin tek itirazı "Genel bilgiden:
 * etiketi eksik" ise cevap reddedilmez, kod etiketi ekler. Sayı/çelişki/yanlış bilgi itirazında ve "Yalnızca belgem"
 * modunda eski sıkı davranış aynen. Model çağrısı eklenmez (aynı denetçi, yapılandırılmış alanlar). Örnekler farklı dersler.
 */
import { describe, expect, it, vi } from "vitest";
import { runTeacherTutor } from "@/lib/ai/teacher-tutor-run";
import { tutorVerifySystem } from "@/lib/ai/teacher-tutor";
import {
  GENERAL_LABEL,
  isLabelOnlyIssue,
  labelGeneralParagraphs,
  parseTutorIssueRows,
  settleLabelOnlyIssues,
} from "@/lib/ai/tutor-general-label";

const ANSWER = [
  "Notunda mekanik enerjinin korunumu sürtünmesiz sistemler için verilmiş.",
  "Sürtünme varken mekanik enerjinin bir kısmı ısıya dönüşür, bu yüzden mekanik enerji korunmaz.",
  "Sence toplam enerji yine de korunur mu?",
].join("\n\n");

const LABEL_ONLY = {
  issues: [
    {
      severity: "high",
      rule: "A",
      problem: "Sürtünmenin mekanik enerjiyi ısıya dönüştürdüğü bilgisi pasajlarda yok; Genel bilgiden paragrafı değil.",
      fix: "Genel bilgiden: diye başlayan paragrafta ver.",
      quote: "Sürtünme varken mekanik enerjinin bir kısmı ısıya dönüşür",
      generalCorrect: true,
      hasNumber: false,
    },
  ],
};

function fakeClient(reviews: unknown[]) {
  let draft = 0;
  let review = 0;
  const create = vi.fn(async (body: { response_format?: unknown }) => {
    if (body.response_format) {
      return { usage: {}, choices: [{ message: { content: JSON.stringify(reviews[review++] ?? { issues: [] }) } }] };
    }
    draft += 1;
    return { usage: {}, choices: [{ message: { content: ANSWER } }] };
  });
  return { client: { chat: { completions: { create } } } as never, calls: () => ({ draft, review }) };
}

const run = (client: never, mode: "mixed" | "document") =>
  runTeacherTutor({
    client,
    model: "gpt-test",
    context: { mode, passages: [{ label: "s.4", text: "Sürtünmesiz sistemde mekanik enerji korunur." }] } as never,
    history: [],
    message: "Sürtünme varken mekanik enerji neden korunmuyor?",
    onUsage: async () => undefined,
  });

describe("yalnız etiket eksikse: etiket eklenir, cevap geçer (ilk denemede)", () => {
  it("mixed modda tek itiraz etiket eksikliği → etiketli cevap, ikinci taslak yok", async () => {
    const fake = fakeClient([LABEL_ONLY]);
    const outcome = await run(fake.client, "mixed");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.attempts).toBe(1);
    expect(fake.calls()).toEqual({ draft: 1, review: 1 });
    expect(outcome.content).toContain(`${GENERAL_LABEL} Sürtünme varken mekanik enerjinin`);
    // Belgeye dayanan paragraf ve soru etiketlenmez.
    expect(outcome.content.startsWith("Notunda mekanik")).toBe(true);
    expect(outcome.content.match(new RegExp(GENERAL_LABEL, "g"))).toHaveLength(1);
  });
});

describe("eski sıkı davranış aynen", () => {
  const strictCases: [string, unknown][] = [
    ["çelişki (B)", { issues: [{ severity: "high", rule: "B", problem: "Pasajla çelişiyor.", quote: "x" }] }],
    ["yanlış genel bilgi", { issues: [{ ...LABEL_ONLY.issues[0], generalCorrect: false }] }],
    ["sayı içeriyor", { issues: [{ ...LABEL_ONLY.issues[0], hasNumber: true }] }],
    ["alıntı cevapta yok", { issues: [{ ...LABEL_ONLY.issues[0], quote: "Isı makinelerinin verimi Carnot sınırını aşamaz ve bu sınır sıcaklıklara bağlıdır" }] }],
    ["alan eksik (eski biçim)", { issues: [{ severity: "high", problem: "Pasajda dayanağı yok." }] }],
    ["etiket + başka itiraz", { issues: [LABEL_ONLY.issues[0], { severity: "high", rule: "E", problem: "Bozuk cümle.", quote: "Sence" }] }],
  ];
  for (const [name, review] of strictCases) {
    it(`mixed · ${name}: reddedilir, ikinci deneme`, async () => {
      const fake = fakeClient([review, review]);
      const outcome = await run(fake.client, "mixed");
      expect(outcome.ok).toBe(false);
      expect(fake.calls()).toEqual({ draft: 2, review: 2 });
    });
  }

  it('"Yalnızca belgem" (document) modunda hiçbir gevşeme yok', async () => {
    const fake = fakeClient([LABEL_ONLY, LABEL_ONLY]);
    const outcome = await run(fake.client, "document");
    expect(outcome.ok).toBe(false);
    expect(settleLabelOnlyIssues("document", ANSWER, parseTutorIssueRows(LABEL_ONLY))).toBeNull();
  });
});

describe("parçalar", () => {
  it("denetçi istemi yalnız mixed modda yapılandırılmış alanları ister; kurallar aynı", () => {
    expect(tutorVerifySystem("mixed")).toContain('"generalCorrect"');
    expect(tutorVerifySystem("mixed")).toContain("A) 'Genel bilgiden:' paragrafı dışında");
    expect(tutorVerifySystem("document")).not.toContain("generalCorrect");
  });

  it("rakam taşıyan alıntı etiket yoluna girmez; kutu paragrafı etiketlenmez", () => {
    expect(isLabelOnlyIssue({ rule: "A", quote: "Kaynama noktası 100 derecedir", generalCorrect: true, hasNumber: false, severity: "high" })).toBe(false);
    expect(labelGeneralParagraphs("> 💡 Benzetme: Hücre zarı bir kapı gibidir.", ["Hücre zarı bir kapı gibidir"])).toBeNull();
  });

  it("zaten etiketli paragrafa ikinci etiket eklenmez (tarih örneği)", () => {
    const text = "Genel bilgiden: Tanzimat Fermanı Gülhane'de okundu.";
    expect(labelGeneralParagraphs(text, ["Tanzimat Fermanı Gülhane'de okundu"])).toEqual({ content: text, labeled: 0 });
  });
});
