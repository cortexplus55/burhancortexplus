import { describe, expect, it } from "vitest";
import { finishTaughtLesson } from "@/lib/learning/lesson-teach";
import { stripInlineSourceLine } from "@/lib/learning/lesson-source";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

describe("stripInlineSourceLine", () => {
  it("extracts a trailing citation and cleans the body", () => {
    const { body, source } = stripInlineSourceLine(
      "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Kaynak: pdf-12-sayfa.pdf, s.3.",
    );
    expect(body).toBe("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.");
    expect(source).toEqual({ file: "pdf-12-sayfa.pdf", page: 3 });
  });

  it("extracts a citation embedded mid-body and keeps the trailing sentence readable", () => {
    // The real pipeline can leave a citation in the middle of a section's
    // body when a second pass (weaveUnusedSources) appends more prose after
    // the first citation attachCitations already added.
    const { body, source } = stripInlineSourceLine(
      "44 g/mol ile 2 mol eder. Kaynak: pdf-12-sayfa.pdf, s.4. Mol kütlesi yerine atom kütlesini koymak sonucu şaşırtır.",
    );
    expect(body).toBe("44 g/mol ile 2 mol eder. Mol kütlesi yerine atom kütlesini koymak sonucu şaşırtır.");
    expect(source).toEqual({ file: "pdf-12-sayfa.pdf", page: 4 });
  });

  it("keeps the last citation when a body has more than one", () => {
    const { source } = stripInlineSourceLine(
      "Bir cümle. Kaynak: a.pdf, s.1. Başka bir cümle. Kaynak: b.pdf, s.9.",
    );
    expect(source).toEqual({ file: "b.pdf", page: 9 });
  });

  it("leaves ordinary text without a citation untouched", () => {
    const text = "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.";
    expect(stripInlineSourceLine(text)).toEqual({ body: text, source: null });
  });

  it("does not treat the word 'kaynak' inside a sentence as a citation", () => {
    const text = "Bu bilginin kaynak güvenilirliği tartışmalıdır ve derste ele alınmaz.";
    expect(stripInlineSourceLine(text)).toEqual({ body: text, source: null });
  });
});

const MOL_SOURCE = [
  "[s.3] pdf-12-sayfa.pdf: Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbon 12 g/mol, oksijen 16 g/mol olduğunda karbondioksit 12 + 2 × 16 = 44 g/mol olur.",
  "[s.4] pdf-12-sayfa.pdf: Kütle ile mol arasındaki bağıntı n = m / M şeklindedir. Örnek: 88 g karbondioksit için n = 88 / 44 = 2 mol. Tanecik sayısı N = n × N_A bağıntısıyla bulunur.",
].join("\n");

function baseLesson(): LessonV2 {
  return {
    title: "Mol kütlesi",
    overview:
      "Atomlar tek tek tartılamayacak kadar küçüktür. Kimyacılar bu tanecikleri mol denen paketlerle sayar.",
    sections: [
      {
        heading: "Mol kütlesi",
        body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbondioksitte karbon 12 g/mol ve iki oksijen 2 × 16 g/mol toplanır. Toplam 12 + 2 × 16 = 44 g/mol olur.",
        check: {
          type: "mcq",
          prompt: "88 g karbondioksit kaç mol eder?",
          options: ["2 mol", "3872 mol", "0,5 mol", "88 mol"],
          answerIndex: 0,
          explanation: "Bölme, kütleyi mol kütlesine böler; çarpım başka bir büyüklüktür.",
          optionWhy: [
            "88 / 44 = 2 mol eder.",
            "Bölme yerine çarpma yapılmış.",
            "Bölme ters çevrilmiş.",
            "Verilen kütle sonuç sanılmış.",
          ],
        },
      },
    ],
  };
}

describe("citation metadata stays out of the lesson body end-to-end", () => {
  it("finishTaughtLesson never leaves 'Kaynak:' text in a published section body", async () => {
    const finished = await finishTaughtLesson(baseLesson(), {
      source: MOL_SOURCE,
      topicLabel: "Mol kütlesi",
    });
    for (const section of finished.lesson.sections) {
      expect(section.body).not.toMatch(/kaynak\s*:/i);
    }
  });

  it("attaches the citation as structured section.source instead", async () => {
    const finished = await finishTaughtLesson(baseLesson(), {
      source: MOL_SOURCE,
      topicLabel: "Mol kütlesi",
    });
    const withSource = finished.lesson.sections.find((section) => section.source);
    expect(withSource?.source?.file).toBe("pdf-12-sayfa.pdf");
    expect(typeof withSource?.source?.page).toBe("number");
  });

  it("a section note that just repeats its own body is dropped, not shown as a duplicate takeaway box", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.note = {
      title: "Mol kütlesi",
      // Near-verbatim copy of section.body above (same clause order and
      // most words) — this is exactly the "vurgu kutusu tekrarı" pattern
      // reported live.
      body: "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Karbondioksitte karbon 12 g/mol ve iki oksijen 2 × 16 g/mol toplanır.",
      tone: "info",
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: "Mol kütlesi" });
    expect(finished.lesson.sections[0]?.note).toBeUndefined();
  });

  it("a genuinely distinct definition note survives (dedup is not overly aggressive)", async () => {
    const lesson = baseLesson();
    lesson.sections[0]!.note = {
      title: "Avogadro sayısı",
      body: "Bir molde 6,02 × 10^23 tanecik bulunur; bu sabite Avogadro sayısı denir.",
      tone: "info",
    };
    const finished = await finishTaughtLesson(lesson, { source: MOL_SOURCE, topicLabel: "Mol kütlesi" });
    expect(finished.lesson.sections[0]?.note?.title).toBe("Avogadro sayısı");
  });

  it("legacy content saved before this fix (citation baked into body, no source field) still renders without crashing and can still be extracted", () => {
    // Simulates a lesson persisted before this change: no `source` field at
    // all, citation text lives inside `body`. The UI (exam-lesson-steps.tsx)
    // applies the same stripInlineSourceLine at render time as a fallback.
    const legacyBody =
      "Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir. Kaynak: pdf-12-sayfa.pdf, s.3.";
    const { body, source } = stripInlineSourceLine(legacyBody);
    expect(body).toBe("Mol kütlesi, bir mol maddenin gram cinsinden kütlesidir.");
    expect(source).toEqual({ file: "pdf-12-sayfa.pdf", page: 3 });
  });
});
